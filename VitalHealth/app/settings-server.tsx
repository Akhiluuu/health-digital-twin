// app/settings-server.tsx
// Server Configuration screen — themed to match app design system

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import {
  getBiogearsBaseUrl,
  setBiogearsBaseUrl,
  setApiKey,
  getApiKey,
  clearApiKey,
} from "../services/biogears";

type TestStatus = "idle" | "testing" | "ok" | "fail";

export default function ServerConfigScreen() {
  const { theme } = useTheme();
  const c = colors[theme];

  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [apiKey, setApiKeyInput] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Load stored values on mount ──────────────────────────────────────────
  useEffect(() => {
    getBiogearsBaseUrl().then((savedUrl) => {
      try {
        const u = new URL(savedUrl);
        const isDefaultPort =
          (u.protocol === "http:" && (u.port === "80" || u.port === "")) ||
          (u.protocol === "https:" && (u.port === "443" || u.port === ""));
        setIp(u.protocol + "//" + u.hostname);
        setPort(isDefaultPort ? "" : u.port);
      } catch {
        setIp(savedUrl);
        setPort("");
      }
    });
    getApiKey().then((k) => setApiKeyInput(k));
  }, []);

  const buildUrl = () => {
    let cleanIp = ip.trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(cleanIp)) {
      cleanIp = `http://${cleanIp}`;
    }
    const p = port.trim();
    if (!p) return cleanIp;
    if (p === "80" || p === "443") return cleanIp;
    const alreadyHasPort = /:\d+$/.test(cleanIp);
    if (alreadyHasPort) return cleanIp;
    return `${cleanIp}:${p}`;
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const finalUrl = buildUrl();
    if (!finalUrl) {
      Alert.alert("Missing Address", "Please enter the server address.");
      return;
    }
    setSaving(true);
    try {
      await setBiogearsBaseUrl(finalUrl);
      if (apiKey.trim()) await setApiKey(apiKey.trim());
      Alert.alert("✅ Saved", "Server settings updated.");
    } catch {
      Alert.alert("Error", "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  // ── Test connection ───────────────────────────────────────────────────────
  const handleTest = async () => {
    const finalUrl = buildUrl();
    if (!finalUrl) {
      Alert.alert("Missing Address", "Enter a server address first.");
      return;
    }
    setTestStatus("testing");
    setTestMsg("");
    try {
      const currentApiKey = apiKey.trim();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${finalUrl}/health`, {
        signal: controller.signal,
        headers: currentApiKey ? { "X-API-Key": currentApiKey } : {},
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setTestStatus("ok");
      setTestMsg(`Connected ✓  Engine: ${data.engine ?? "ok"}  v${data.version ?? ""}`);
    } catch (err: any) {
      setTestStatus("fail");
      setTestMsg(
        err.name === "AbortError"
          ? "Request timed out — check the address and port."
          : err.message || "Could not reach server."
      );
    }
  };

  // ── Clear API key ─────────────────────────────────────────────────────────
  const handleClearKey = () => {
    Alert.alert("Clear API Key?", "You'll need to re-enter it to use the server.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear", style: "destructive",
        onPress: async () => { await clearApiKey(); setApiKeyInput(""); },
      },
    ]);
  };

  // ── Quick-fill presets ────────────────────────────────────────────────────
  const presets = [
    { label: "Local Dev", value: "http://10.172.0.79:8000", icon: "laptop-outline" as const },
    { label: "E2E Cloud", value: "http://151.185.42.123", icon: "cloud-outline" as const },
    { label: "HTTPS", value: "https://yourdomain.com", icon: "lock-closed-outline" as const },
  ];

  const applyPreset = (presetUrl: string) => {
    try {
      const u = new URL(presetUrl);
      const isDefault =
        (u.protocol === "http:" && (u.port === "80" || u.port === "")) ||
        (u.protocol === "https:" && (u.port === "443" || u.port === ""));
      setIp(u.protocol + "//" + u.hostname);
      setPort(isDefault ? "" : u.port);
    } catch {
      setIp(presetUrl);
      setPort("");
    }
  };

  const testColor =
    testStatus === "ok" ? "#10b981" :
    testStatus === "fail" ? "#ef4444" :
    c.accent;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Server Configuration",
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: c.bg }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1, backgroundColor: c.bg }}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <View style={s.header}>
            <View style={[s.headerIconWrap, { backgroundColor: c.accent + "18", borderColor: c.accent + "40" }]}>
              <Ionicons name="server-outline" size={30} color={c.accent} />
            </View>
            <Text style={[s.title, { color: c.text }]}>BioGears Server</Text>
            <Text style={[s.sub, { color: c.sub }]}>
              Point the app at your local server or the E2E Cloud deployment.
            </Text>
          </View>

          {/* ── Quick Presets ────────────────────────────────────────────── */}
          <Text style={[s.label, { color: c.sub }]}>QUICK PRESETS</Text>
          <View style={s.presetRow}>
            {presets.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[s.presetChip, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={() => applyPreset(p.value)}
              >
                <Ionicons name={p.icon} size={13} color={c.sub} />
                <Text style={[s.presetText, { color: c.sub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Address Input ─────────────────────────────────────────────── */}
          <Text style={[s.label, { color: c.sub }]}>SERVER ADDRESS</Text>
          <View style={[s.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="globe-outline" size={18} color={c.sub} style={s.inputIcon} />
            <TextInput
              style={[s.input, { color: c.text }]}
              value={ip}
              onChangeText={setIp}
              placeholder="e.g. http://151.185.42.123"
              placeholderTextColor={c.sub}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
            />
          </View>

          {/* ── Port Input ────────────────────────────────────────────────── */}
          <Text style={[s.label, { color: c.sub }]}>PORT <Text style={{ fontSize: 10, fontWeight: "400" }}>(leave blank for port 80)</Text></Text>
          <View style={[s.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="git-branch-outline" size={18} color={c.sub} style={s.inputIcon} />
            <TextInput
              style={[s.input, { color: c.text }]}
              value={port}
              onChangeText={setPort}
              placeholder="e.g. 8000  (optional)"
              placeholderTextColor={c.sub}
              keyboardType="numeric"
            />
          </View>

          {/* ── API Key ───────────────────────────────────────────────────── */}
          <Text style={[s.label, { color: c.sub }]}>API KEY</Text>
          <View style={[s.inputWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="key-outline" size={18} color={c.sub} style={s.inputIcon} />
            <TextInput
              style={[s.input, { color: c.text }]}
              value={apiKey}
              onChangeText={setApiKeyInput}
              placeholder="Paste X-API-Key value from .env"
              placeholderTextColor={c.sub}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
          <TouchableOpacity onPress={handleClearKey} style={{ alignSelf: "flex-end", marginTop: 6 }}>
            <Text style={{ color: c.danger, fontSize: 13 }}>Clear saved key</Text>
          </TouchableOpacity>

          {/* ── Test Result Banner ─────────────────────────────────────── */}
          {testStatus !== "idle" && (
            <View style={[
              s.testBanner,
              { backgroundColor: testColor + "14", borderColor: testColor + "50" },
            ]}>
              {testStatus === "testing"
                ? <ActivityIndicator color={c.accent} size="small" />
                : <Ionicons
                    name={testStatus === "ok" ? "checkmark-circle" : "close-circle"}
                    size={18}
                    color={testColor}
                  />
              }
              {testStatus !== "testing" && (
                <Text style={[s.testBannerText, { color: testColor }]}>{testMsg}</Text>
              )}
            </View>
          )}

          {/* ── Actions ───────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[s.btnTest, { backgroundColor: c.card, borderColor: c.accent + "60" }]}
            onPress={handleTest}
            disabled={testStatus === "testing"}
          >
            <Ionicons name="flash-outline" size={18} color={c.accent} />
            <Text style={[s.btnTestText, { color: c.accent }]}>Test Connection</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btnSave, { backgroundColor: c.accent }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <>
                  <Ionicons name="save-outline" size={18} color="#fff" />
                  <Text style={s.btnSaveText}>Save Settings</Text>
                </>
            }
          </TouchableOpacity>

          {/* ── Info Card ──────────────────────────────────────────────── */}
          <View style={[s.infoCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Ionicons name="information-circle-outline" size={16} color={c.sub} />
              <Text style={[s.infoTitle, { color: c.text }]}>Where to get these values</Text>
            </View>
            <Text style={[s.infoText, { color: c.sub }]}>
              <Text style={[s.bold, { color: c.text }]}>Server Address</Text>: your VM's public
              IP, e.g. {"`http://103.x.x.x`"}.{"\n"}
              <Text style={[s.bold, { color: c.text }]}>Port</Text>: leave blank when behind
              nginx (port 80). Use {"`8000`"} only for direct FastAPI access.{"\n"}
              <Text style={[s.bold, { color: c.text }]}>API Key</Text>: the value of
              {" `DIGITAL_TWIN_API_KEY`"} from the server's {"`/.env`"} file.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: { padding: 24, paddingBottom: 60 },

  header: { alignItems: "center", marginBottom: 28, paddingTop: 8 },
  headerIconWrap: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8, letterSpacing: 0.2 },
  sub: { fontSize: 14, lineHeight: 20, textAlign: "center" },

  label: {
    fontSize: 11, letterSpacing: 1.2, fontWeight: "700", marginBottom: 8, marginTop: 20,
  },

  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 14, borderWidth: 1, paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 15, fontSize: 15 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1,
  },
  presetText: { fontSize: 12, fontWeight: "500" },

  testBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, padding: 14, marginTop: 20, borderWidth: 1,
  },
  testBannerText: { flex: 1, fontSize: 14, fontWeight: "500" },

  btnTest: {
    marginTop: 20, borderRadius: 14, padding: 17,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5,
  },
  btnTestText: { fontSize: 16, fontWeight: "600" },

  btnSave: {
    marginTop: 12, borderRadius: 14, padding: 17,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    shadowColor: "#38bdf8", shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  btnSaveText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  infoCard: { marginTop: 28, borderRadius: 16, padding: 18, borderWidth: 1 },
  infoTitle: { fontWeight: "700", fontSize: 14 },
  infoText: { fontSize: 13, lineHeight: 22 },
  bold: { fontWeight: "600" },
});
