import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  StatusBar,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";

// 🔹 Firebase Imports
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Spo2Reading {
  value: number;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getStatus = (value: number): { label: string; color: string; darkColor: string; bg: string; darkBg: string; icon: keyof typeof Ionicons.glyphMap } => {
  if (value >= 95) return { label: "Normal", color: "#15803d", darkColor: "#4ade80", bg: "#dcfce7", darkBg: "#14301e", icon: "checkmark-circle-outline" };
  if (value >= 90) return { label: "Low", color: "#b45309", darkColor: "#fbbf24", bg: "#fef3c7", darkBg: "#2d2210", icon: "warning-outline" };
  return { label: "Critical", color: "#b91c1c", darkColor: "#f87171", bg: "#fee2e2", darkBg: "#2d1010", icon: "alert-circle-outline" };
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) +
    " · " + d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Spo2Screen() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const colors = isDark
    ? {
        bg: "#0d1117",
        card: "#161b22",
        border: "#21262d",
        text: "#c9d1d9",
        sub: "#8b949e",
        muted: "#484f58",
        accent: "#1d6fa4",
        accentText: "#5db4e8",
        inputBg: "#1c2128",
        headerBg: "#0d1117",
        historyBg: "#1c2128",
        divider: "#21262d",
      }
    : {
        bg: "#f0f4f8",
        card: "#ffffff",
        border: "#e2e8f0",
        text: "#0f172a",
        sub: "#64748b",
        muted: "#cbd5e1",
        accent: "#2563eb",
        accentText: "#2563eb",
        inputBg: "#f8fafc",
        headerBg: "#ffffff",
        historyBg: "#f8fafc",
        divider: "#f1f5f9",
      };

  // ─── State ──────────────────────────────────────────────────────────────────

  const [spo2, setSpo2] = useState("");
  const [latestReading, setLatestReading] = useState<Spo2Reading | null>(null);
  const [history, setHistory] = useState<Spo2Reading[]>([]);
  const [saving, setSaving] = useState(false);

  // Pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  // 🔹 Updated useEffect with Firebase subscription
  useEffect(() => {
    loadData();
    subscribeToSpo2();
  }, []);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.15, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // ─── Data ────────────────────────────────────────────────────────────────────

  const loadData = async () => {
    try {
      const latest = await AsyncStorage.getItem("latest_spo2");
      if (latest) setLatestReading(JSON.parse(latest));

      const hist = await AsyncStorage.getItem("spo2_history");
      if (hist) setHistory(JSON.parse(hist));
    } catch {}
  };

  // 🔹 Firebase subscription function
  const subscribeToSpo2 = async () => {
    const uid = await getUserId();
    if (!uid) return;

    const ref = doc(db, "users", uid);

    return onSnapshot(ref, (snapshot) => {
      if (!snapshot.exists()) return;

      const data = snapshot.data();
      if (data.spo2 !== undefined) {
        setLatestReading({
          value: data.spo2,
          timestamp: data.spo2Timestamp || new Date().toISOString(),
        });
      }
    });
  };

  const saveSpo2 = async () => {
    if (!spo2.trim()) {
      Alert.alert("Missing value", "Please enter your SpO₂ level.");
      return;
    }
    const value = parseInt(spo2);
    if (isNaN(value) || value < 50 || value > 100) {
      Alert.alert("Invalid input", "Please enter a value between 50 and 100.");
      return;
    }

    setSaving(true);
    try {
      const reading: Spo2Reading = { value, timestamp: new Date().toISOString() };

      await AsyncStorage.setItem("latest_spo2", JSON.stringify(reading));

      const updatedHistory = [reading, ...history].slice(0, 10);
      await AsyncStorage.setItem("spo2_history", JSON.stringify(updatedHistory));

      setLatestReading(reading);
      setHistory(updatedHistory);
      setSpo2("");

      // 🔹 Save SpO₂ to Firebase
      const uid = await getUserId();
      if (uid) {
        await setDoc(
          doc(db, "users", uid),
          {
            spo2: value,
            spo2Timestamp: reading.timestamp,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      if (value < 90) {
        Alert.alert(
          "⚠️ Critical Level",
          "Your SpO₂ is critically low. Please seek medical attention immediately.",
          [{ text: "OK" }]
        );
      }
    } catch {
      Alert.alert("Error", "Failed to save reading. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const numVal = parseInt(spo2);
  const previewStatus = !isNaN(numVal) && numVal >= 50 && numVal <= 100
    ? getStatus(numVal)
    : null;

  const latestStatus = latestReading ? getStatus(latestReading.value) : null;

  const RANGES = [
    { range: "95 – 100%", label: "Normal", color: "#15803d", darkColor: "#4ade80", bg: "#dcfce7", darkBg: "#14301e" },
    { range: "90 – 94%", label: "Low", color: "#b45309", darkColor: "#fbbf24", bg: "#fef3c7", darkBg: "#2d2210" },
    { range: "Below 90%", label: "Critical", color: "#b91c1c", darkColor: "#f87171", bg: "#fee2e2", darkBg: "#2d1010" },
  ];

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>SpO₂ Monitor</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Live Display Card ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Pulse ring + icon */}
          <View style={styles.iconWrapper}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  backgroundColor: isDark ? "#1d6fa420" : "#2563eb15",
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseOpacity,
                },
              ]}
            />
            <View style={[styles.iconCircle, { backgroundColor: isDark ? "#1a2e3d" : "#dbeafe" }]}>
              <Ionicons name="water" size={32} color={isDark ? "#5db4e8" : "#2563eb"} />
            </View>
          </View>

          <Text style={[styles.cardTitle, { color: colors.text }]}>Oxygen Saturation</Text>
          <Text style={[styles.cardSub, { color: colors.sub }]}>Blood oxygen level (SpO₂)</Text>

          {/* Last reading display */}
          {latestReading && latestStatus ? (
            <View style={[styles.latestBox, { backgroundColor: isDark ? latestStatus.darkBg : latestStatus.bg, borderColor: isDark ? latestStatus.darkBg : latestStatus.bg }]}>
              <Text style={[styles.latestValue, { color: isDark ? latestStatus.darkColor : latestStatus.color }]}>
                {latestReading.value}<Text style={styles.latestUnit}>%</Text>
              </Text>
              <View style={styles.latestMeta}>
                <Ionicons name={latestStatus.icon} size={14} color={isDark ? latestStatus.darkColor : latestStatus.color} />
                <Text style={[styles.latestLabel, { color: isDark ? latestStatus.darkColor : latestStatus.color }]}>
                  {latestStatus.label}
                </Text>
              </View>
              <Text style={[styles.latestTime, { color: colors.sub }]}>{formatTime(latestReading.timestamp)}</Text>
            </View>
          ) : (
            <View style={[styles.latestBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Text style={[styles.noReadingText, { color: colors.muted }]}>No reading yet</Text>
            </View>
          )}
        </View>

        {/* ── Input Card ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Log Reading</Text>
          <Text style={[styles.sectionSub, { color: colors.sub }]}>Enter your SpO₂ percentage</Text>

          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: previewStatus
                    ? isDark ? previewStatus.darkColor : previewStatus.color
                    : colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="98"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={spo2}
              onChangeText={setSpo2}
              maxLength={3}
            />
            <Text style={[styles.inputUnit, { color: colors.sub }]}>%</Text>
          </View>

          {/* Live preview badge */}
          {previewStatus && (
            <View style={[styles.previewBadge, { backgroundColor: isDark ? previewStatus.darkBg : previewStatus.bg }]}>
              <Ionicons name={previewStatus.icon} size={14} color={isDark ? previewStatus.darkColor : previewStatus.color} />
              <Text style={[styles.previewText, { color: isDark ? previewStatus.darkColor : previewStatus.color }]}>
                {previewStatus.label}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: saving ? colors.muted : colors.accent },
            ]}
            onPress={saveSpo2}
            activeOpacity={0.8}
            disabled={saving}
          >
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save Reading"}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Reference Ranges ── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>SpO₂ Reference</Text>
          <Text style={[styles.sectionSub, { color: colors.sub }]}>Normal ranges & what they mean</Text>

          <View style={styles.rangesContainer}>
            {RANGES.map((r, i) => (
              <View
                key={i}
                style={[
                  styles.rangeRow,
                  { backgroundColor: isDark ? r.darkBg : r.bg },
                  i < RANGES.length - 1 && { marginBottom: 8 },
                ]}
              >
                <View style={[styles.rangeDot, { backgroundColor: isDark ? r.darkColor : r.color }]} />
                <Text style={[styles.rangeRange, { color: isDark ? r.darkColor : r.color }]}>{r.range}</Text>
                <Text style={[styles.rangeLabel, { color: isDark ? r.darkColor : r.color }]}>{r.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── History ── */}
        {history.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Readings</Text>
            <Text style={[styles.sectionSub, { color: colors.sub }]}>Last {history.length} entries</Text>

            <View style={styles.historyList}>
              {history.map((item, i) => {
                const s = getStatus(item.value);
                return (
                  <View key={i}>
                    <View style={styles.historyRow}>
                      <View style={[styles.historyDot, { backgroundColor: isDark ? s.darkColor : s.color }]} />
                      <View style={styles.historyInfo}>
                        <Text style={[styles.historyValue, { color: colors.text }]}>
                          {item.value}%
                        </Text>
                        <Text style={[styles.historyTime, { color: colors.sub }]}>
                          {formatTime(item.timestamp)}
                        </Text>
                      </View>
                      <View style={[styles.historyBadge, { backgroundColor: isDark ? s.darkBg : s.bg }]}>
                        <Text style={[styles.historyBadgeText, { color: isDark ? s.darkColor : s.color }]}>
                          {s.label}
                        </Text>
                      </View>
                    </View>
                    {i < history.length - 1 && (
                      <View style={[styles.divider, { backgroundColor: colors.divider }]} />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  headerRight: { width: 28 },
  scroll: { padding: 16, gap: 14 },
  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 20,
  },

  // Live display
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    height: 80,
  },
  pulseRing: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  cardSub: { fontSize: 13, textAlign: "center", marginBottom: 16 },
  latestBox: {
    borderRadius: 14,
    borderWidth: 0,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 6,
  },
  latestValue: { fontSize: 52, fontWeight: "700", lineHeight: 58 },
  latestUnit: { fontSize: 24, fontWeight: "400" },
  latestMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  latestLabel: { fontSize: 14, fontWeight: "600" },
  latestTime: { fontSize: 12, marginTop: 2 },
  noReadingText: { fontSize: 14, paddingVertical: 18 },

  // Input
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  sectionSub: { fontSize: 13, marginBottom: 16 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 28,
    fontWeight: "600",
    textAlign: "center",
  },
  inputUnit: { fontSize: 22, fontWeight: "500" },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    marginBottom: 14,
  },
  previewText: { fontSize: 13, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },

  // Ranges
  rangesContainer: { gap: 0 },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 10,
  },
  rangeDot: { width: 8, height: 8, borderRadius: 4 },
  rangeRange: { flex: 1, fontSize: 14, fontWeight: "500" },
  rangeLabel: { fontSize: 13, fontWeight: "600" },

  // History
  historyList: { gap: 0 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyInfo: { flex: 1 },
  historyValue: { fontSize: 15, fontWeight: "600" },
  historyTime: { fontSize: 12, marginTop: 1 },
  historyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  historyBadgeText: { fontSize: 11, fontWeight: "600" },
  divider: { height: 0.5, marginLeft: 20 },
});