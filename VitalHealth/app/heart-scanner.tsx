/**
 * app/heart-scanner.tsx
 *
 * ARCHITECTURE: Silent frame capture via react-native-view-shot
 * ──────────────────────────────────────────────────────────────
 * takePictureAsync() → always fires shutter sound + is slow (200–500 ms)
 * captureRef()       → reads GPU framebuffer silently in ~15–40 ms ✅
 *
 * Flow:
 *  1. CameraView streams live preview (no photos ever taken)
 *  2. setInterval calls captureRef() every 100 ms → silent JPEG from GPU
 *  3. JS decodes pixels and computes R/G/B averages on-device
 *  4. Finger detection runs locally (no network round-trip)
 *  5. Only 3 floats sent to Python per frame (~200 bytes vs ~50 KB)
 *  6. Python does FFT + bandpass → returns BPM
 *
 * Setup (run once):
 *   npx expo install react-native-view-shot
 */

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, Vibration, Animated, Easing, ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API_BASE_URL         = "http://10.66.213.41:5000";  // ← your LAN IP
const SAMPLE_INTERVAL_MS   = 100;   // 10 fps — no shutter, fast enough for rPPG
const AUTO_STOP_CONFIDENCE = 0.82;
const CAPTURE_WIDTH        = 80;    // tiny — colour only, no detail needed
const CAPTURE_HEIGHT       = 80;

// ── Types ─────────────────────────────────────────────────────────────────────

interface HRResult {
  bpm: number; confidence: number;
  hrv_ms: number; spo2: number;
  signal_quality: "excellent" | "good" | "poor";
  measurement_time: number;
}

// ── Pixel helpers (run entirely in JS) ────────────────────────────────────────

/** Decode base64 JPEG → average R, G, B using OffscreenCanvas (Hermes JSI). */
async function getRGBFromBase64(b64: string): Promise<{ r: number; g: number; b: number } | null> {
  try {
    const data   = b64.includes(",") ? b64.split(",")[1] : b64;
    const binary = atob(data);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    if (typeof createImageBitmap !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      const blob   = new Blob([bytes], { type: "image/jpeg" });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx    = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let r = 0, g = 0, b = 0;
      const n = px.length / 4;
      for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i+1]; b += px[i+2]; }
      return { r: r/n, g: g/n, b: b/n };
    }
    // Canvas unavailable — signal caller to use full-frame fallback
    return null;
  } catch { return null; }
}

/** Mirror of Python's finger detection — runs locally, no network. */
function detectFinger(r: number, g: number, b: number): boolean {
  if (r < 110 || r > 252) return false;
  if (b > 90)              return false;
  if (g > 160)             return false;
  if (b < 1 || r / b < 1.5) return false;
  if (g < 1 || r / g < 1.1) return false;
  return true;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HeartScannerScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  const [permission, requestPermission] = useCameraPermissions();

  // All mutable loop state in refs (stale closure–safe)
  const cameraContainerRef = useRef<View>(null);
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef       = useRef<string | null>(null);
  const isSendingRef       = useRef(false);
  const statusRef          = useRef<"idle" | "measuring" | "done" | "error">("idle");
  const fingerRef          = useRef(false);

  const [status,         setStatusState]  = useState<"idle" | "measuring" | "done" | "error">("idle");
  const [progress,       setProgress]     = useState(0);
  const [fingerDetected, setFingerDetected] = useState(false);
  const [torchOn,        setTorchOn]      = useState(false);
  const [result,         setResult]       = useState<HRResult | null>(null);
  const [liveResult,     setLiveResult]   = useState<HRResult | null>(null);
  const [errorMsg,       setErrorMsg]     = useState("");

  const setStatus = (s: typeof status) => { statusRef.current = s; setStatusState(s); };

  // ── Animations ─────────────────────────────────────────────────────────────

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (status === "measuring" && fingerDetected) {
      pulseRef.current = Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.13, duration: 480, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 480, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      pulseRef.current.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [status, fingerDetected]);

  const prevFingerRef = useRef(false);
  useEffect(() => {
    if (fingerDetected && !prevFingerRef.current) Vibration.vibrate(60);
    prevFingerRef.current = fingerDetected;
  }, [fingerDetected]);

  useEffect(() => () => stopLoop(), []);

  // ── Core sampling loop ─────────────────────────────────────────────────────

  /**
   * Called every SAMPLE_INTERVAL_MS.
   * Uses captureRef() — reads from GPU framebuffer, NO shutter, NO file, NO sound.
   */
  const sampleFrame = async () => {
    if (isSendingRef.current)           return;
    if (statusRef.current !== "measuring") return;
    if (!cameraContainerRef.current)    return;
    if (!sessionIdRef.current)          return;

    isSendingRef.current = true;
    try {
      // ── Silent GPU capture (~15–40 ms, no shutter) ──────────────────────
      const b64 = await captureRef(cameraContainerRef, {
        format:  "jpg",
        quality: 0.2,
        width:   CAPTURE_WIDTH,
        height:  CAPTURE_HEIGHT,
        result:  "base64",
      });

      // ── RGB averaging in JS ─────────────────────────────────────────────
      const rgb = await getRGBFromBase64(b64);

      if (!rgb) {
        // Fallback: send full frame to Python (canvas unavailable on this device)
        await sendFullFrame(b64);
        return;
      }

      const { r, g, b } = rgb;

      // ── Local finger detection ──────────────────────────────────────────
      const finger = detectFinger(r, g, b);

      if (finger !== fingerRef.current) {
        fingerRef.current = finger;
        setFingerDetected(finger);
        setTorchOn(finger);       // torch: ON when finger present, OFF otherwise

        if (!finger) {
          // Finger lifted — reset Python buffer to avoid stale signal mixing
          setProgress(0);
          fetch(`${API_BASE_URL}/reset_buffer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionIdRef.current }),
          }).catch(() => {});
          return;
        }
      }

      if (!finger) return;        // skip network call — no finger

      // ── Send only 3 floats to Python (~200 bytes, not ~50 KB) ───────────
      const res  = await fetch(`${API_BASE_URL}/channels`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id: sessionIdRef.current,
          red:   r,
          green: g,
          blue:  b,
        }),
      });

      const data = await res.json();
      setProgress(data.progress ?? 0);
      if (data.live_bpm) setLiveResult(data.live_bpm);

      if (data.ready && data.live_bpm?.confidence >= AUTO_STOP_CONFIDENCE) {
        finishSession();
      }

    } catch { /* skip bad frames */ }
    finally  { isSendingRef.current = false; }
  };

  /** Fallback path when OffscreenCanvas is unavailable */
  const sendFullFrame = async (b64: string) => {
    if (!sessionIdRef.current) return;
    try {
      const res  = await fetch(`${API_BASE_URL}/frame`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionIdRef.current, frame_data: b64 }),
      });
      const data = await res.json();
      const f    = data.finger_detected ?? false;
      if (f !== fingerRef.current) {
        fingerRef.current = f;
        setFingerDetected(f);
        setTorchOn(f);
      }
      setProgress(data.progress ?? 0);
      if (data.live_bpm) setLiveResult(data.live_bpm);
      if (data.ready && data.live_bpm?.confidence >= AUTO_STOP_CONFIDENCE) finishSession();
    } catch {}
  };

  // ── Session lifecycle ──────────────────────────────────────────────────────

  const startMeasuring = async () => {
    try {
      setStatus("measuring");
      setProgress(0); setResult(null); setLiveResult(null);
      setFingerDetected(false); setTorchOn(false); setErrorMsg("");
      isSendingRef.current = false;
      fingerRef.current    = false;

      const res  = await fetch(`${API_BASE_URL}/start`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      sessionIdRef.current = data.session_id;

      stopLoop();
      intervalRef.current = setInterval(sampleFrame, SAMPLE_INTERVAL_MS);
    } catch {
      setStatus("error");
      setErrorMsg("Cannot reach server. Check IP and run: python app.py");
    }
  };

  const finishSession = async () => {
    stopLoop();
    setTorchOn(false);
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const res  = await fetch(`${API_BASE_URL}/stop/${sid}`, { method: "POST" });
      const data = await res.json();
      setResult(data.final_result ?? null);
    } catch { setResult(liveResult); }
    setStatus("done");
    Vibration.vibrate([0, 80, 80, 80]);
  };

  const stopLoop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const stopMeasuring = () => { stopLoop(); finishSession(); };

  const reset = () => {
    stopLoop();
    sessionIdRef.current   = null;
    isSendingRef.current   = false;
    fingerRef.current      = false;
    prevFingerRef.current  = false;
    setStatus("idle");
    setProgress(0); setResult(null); setLiveResult(null);
    setFingerDetected(false); setTorchOn(false);
  };

  // ── Permission gate ────────────────────────────────────────────────────────

  if (!permission) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: c.bg }]}>
        <Ionicons name="camera-outline" size={64} color={c.sub} />
        <Text style={[styles.permTitle, { color: c.text }]}>Camera Permission Required</Text>
        <Text style={[styles.permSub, { color: c.sub }]}>Needed to measure heart rate via flashlight</Text>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef476f" }]} onPress={requestPermission}>
          <Text style={styles.actionBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const displayResult = result ?? liveResult;
  const progressPct   = Math.round(progress * 100);
  const isDark        = theme === "dark";
  const isMeasuring   = status === "measuring";
  const isDone        = status === "done";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.bg }]}>

      <View style={styles.header}>
        <TouchableOpacity onPress={() => { reset(); router.back(); }}>
          <Ionicons name="chevron-back" size={28} color={c.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: c.text }]}>Heart Scanner</Text>
          <Text style={[styles.headerSub,   { color: c.sub  }]}>Python rPPG Engine</Text>
        </View>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/*
          ┌─ cameraContainerRef ─────────────────────────────────────────┐
          │  captureRef() targets this View, not the CameraView itself.  │
          │  collapsable={false} is REQUIRED on Android or the ref       │
          │  may point to a collapsed native node and capture fails.     │
          └──────────────────────────────────────────────────────────────┘
        */}
        <View
          ref={cameraContainerRef}
          style={styles.cameraBox}
          collapsable={false}
        >
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
          />

          <View style={styles.overlay}>
            <Animated.View style={[
              styles.fingerRing,
              fingerDetected && styles.fingerRingActive,
              isDone         && styles.fingerRingDone,
              { transform: [{ scale: pulseAnim }] },
            ]}>
              <Text style={styles.fingerEmoji}>{isDone ? "✅" : "☝️"}</Text>
              <Text style={styles.fingerHint}>
                {status === "idle"   ? "tap Start below"   :
                 isDone              ? "reading complete"  :
                 fingerDetected      ? "hold very still"   :
                                      "cover lens + flash"}
              </Text>
            </Animated.View>
          </View>

          {torchOn && (
            <View style={styles.flashBadge}>
              <Ionicons name="flashlight" size={11} color="#ffe066" />
              <Text style={styles.flashLabel}>FLASH ON</Text>
            </View>
          )}
        </View>

        {/* Instruction card */}
        <View style={[styles.instructionBox, { backgroundColor: c.card }]}>
          <Ionicons name="information-circle-outline" size={18} color={c.sub} />
          <Text style={[styles.instructionText, { color: c.sub }]}>
            Press your finger firmly over the rear camera and flash.
            The torch turns on automatically once your finger is detected. Keep still for 8–10 s.
          </Text>
        </View>

        {/* Progress bar */}
        {isMeasuring && fingerDetected && (
          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={[styles.progressText, { color: c.sub }]}>
                {progressPct < 100 ? "Collecting signal…" : "Analysing with Python…"}
              </Text>
              <Text style={[styles.progressText, { color: "#ef476f" }]}>{progressPct}%</Text>
            </View>
          </View>
        )}

        {/* Status banners */}
        {isMeasuring && !fingerDetected && (
          <View style={styles.alertBox}>
            <Ionicons name="warning-outline" size={16} color="#f59e0b" />
            <Text style={styles.warnText}>Cover both the camera lens and flashlight completely</Text>
          </View>
        )}
        {isMeasuring && fingerDetected && (
          <View style={[styles.alertBox, { backgroundColor: "#4ade8022" }]}>
            <Ionicons name="pulse-outline" size={16} color="#4ade80" />
            <Text style={[styles.warnText, { color: "#4ade80" }]}>Pulse detected — Python is analysing…</Text>
          </View>
        )}
        {status === "error" && (
          <View style={[styles.alertBox, { backgroundColor: "#ef444422" }]}>
            <Ionicons name="close-circle-outline" size={16} color="#ef4444" />
            <Text style={[styles.warnText, { color: "#ef4444" }]}>{errorMsg}</Text>
          </View>
        )}

        {/* Result card */}
        {displayResult && (
          <LinearGradient
            colors={isDark ? ["#1e0a0a", "#0f172a"] : ["#fff0f0", "#ffffff"]}
            style={styles.resultCard}
          >
            <Text style={[styles.resultLabel, { color: c.sub }]}>
              {isDone ? "✓ FINAL RESULT" : "⏳ LIVE READING"}
            </Text>
            <View style={styles.bpmRow}>
              <Text style={styles.bpmValue}>{displayResult.bpm.toFixed(0)}</Text>
              <View style={styles.bpmMeta}>
                <Text style={styles.bpmUnit}>BPM</Text>
                <Text style={[styles.bpmSub, { color: c.sub }]}>Heart Rate</Text>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: c.sub + "33" }]} />
            <View style={styles.metricsRow}>
              <MetricBox label="SpO₂ est."  value={`${displayResult.spo2.toFixed(1)}%`}             color="#4cc9f0" c={c} />
              <MetricBox label="HRV"        value={`${displayResult.hrv_ms.toFixed(0)} ms`}          color="#4ade80" c={c} />
              <MetricBox label="Confidence" value={`${Math.round(displayResult.confidence * 100)}%`} color="#f59e0b" c={c} />
            </View>
            <View style={[styles.qualityBadge, { backgroundColor: qualityColor(displayResult.signal_quality) + "22" }]}>
              <View style={[styles.qualityDot, { backgroundColor: qualityColor(displayResult.signal_quality) }]} />
              <Text style={[styles.qualityText, { color: qualityColor(displayResult.signal_quality) }]}>
                {displayResult.signal_quality.toUpperCase()} SIGNAL QUALITY
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Buttons */}
        <View style={styles.btnRow}>
          {status === "idle" && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef476f" }]} onPress={startMeasuring}>
              <Ionicons name="heart" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Start Measuring</Text>
            </TouchableOpacity>
          )}
          {isMeasuring && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#334155" }]} onPress={stopMeasuring}>
              <Ionicons name="stop-circle-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Stop</Text>
            </TouchableOpacity>
          )}
          {isDone && (
            <>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef476f", flex: 1 }]} onPress={() => { reset(); startMeasuring(); }}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Measure Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.outlineBtn, { borderColor: c.sub, flex: 0.45 }]} onPress={reset}>
                <Text style={[styles.outlineBtnText, { color: c.sub }]}>Clear</Text>
              </TouchableOpacity>
            </>
          )}
          {status === "error" && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef476f" }]} onPress={reset}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MetricBox({ label, value, color, c }: { label: string; value: string; color: string; c: any }) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: c.sub }]}>{label}</Text>
    </View>
  );
}
function qualityColor(q: string) {
  return q === "excellent" ? "#4ade80" : q === "good" ? "#f59e0b" : "#ef4444";
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:           { flex: 1 },
  center:           { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerCenter:     { alignItems: "center" },
  headerTitle:      { fontSize: 18, fontWeight: "bold" },
  headerSub:        { fontSize: 11, marginTop: 1 },
  content:          { padding: 16, paddingBottom: 40 },
  cameraBox:        { height: 260, borderRadius: 24, overflow: "hidden", backgroundColor: "#111", marginBottom: 12 },
  overlay:          { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  fingerRing:       { width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  fingerRingActive: { borderColor: "#ef476f", borderStyle: "solid" },
  fingerRingDone:   { borderColor: "#4ade80", borderStyle: "solid" },
  fingerEmoji:      { fontSize: 32 },
  fingerHint:       { fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 5, textAlign: "center", paddingHorizontal: 8 },
  flashBadge:       { position: "absolute", bottom: 12, right: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  flashLabel:       { color: "#ffe066", fontSize: 10, fontWeight: "700" },
  instructionBox:   { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14, marginBottom: 12 },
  instructionText:  { flex: 1, fontSize: 13, lineHeight: 18 },
  progressBlock:    { marginBottom: 12 },
  progressTrack:    { height: 6, backgroundColor: "#1e293b", borderRadius: 4, overflow: "hidden" },
  progressFill:     { height: "100%", backgroundColor: "#ef476f", borderRadius: 4 },
  progressLabels:   { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  progressText:     { fontSize: 12 },
  alertBox:         { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: "#f59e0b22", marginBottom: 12 },
  warnText:         { fontSize: 13, color: "#f59e0b", flex: 1 },
  resultCard:       { borderRadius: 24, padding: 20, marginBottom: 16 },
  resultLabel:      { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10 },
  bpmRow:           { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  bpmValue:         { fontSize: 72, fontWeight: "900", color: "#ef476f", lineHeight: 76 },
  bpmMeta:          { justifyContent: "center" },
  bpmUnit:          { fontSize: 20, fontWeight: "700", color: "#ef476f" },
  bpmSub:           { fontSize: 13, marginTop: 2 },
  divider:          { height: 1, marginBottom: 16 },
  metricsRow:       { flexDirection: "row", justifyContent: "space-around", marginBottom: 14 },
  metricBox:        { alignItems: "center" },
  metricValue:      { fontSize: 20, fontWeight: "700" },
  metricLabel:      { fontSize: 11, marginTop: 3 },
  qualityBadge:     { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  qualityDot:       { width: 7, height: 7, borderRadius: 4 },
  qualityText:      { fontSize: 11, fontWeight: "700" },
  btnRow:           { flexDirection: "row", gap: 10 },
  actionBtn:        { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 18 },
  actionBtnText:    { color: "#fff", fontWeight: "700", fontSize: 16 },
  outlineBtn:       { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 18, borderWidth: 1 },
  outlineBtnText:   { fontWeight: "600", fontSize: 15 },
  permTitle:        { fontSize: 20, fontWeight: "bold", marginTop: 16, marginBottom: 8 },
  permSub:          { fontSize: 14, textAlign: "center", marginBottom: 24, lineHeight: 20 },
});