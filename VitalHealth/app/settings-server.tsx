// app/settings-server.tsx
// Server Configuration screen — lets users point the app at the E2E Cloud URL
// and enter the API key. Called from Settings screen.

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
import {
  getBiogearsBaseUrl,
  setBiogearsBaseUrl,
  setApiKey,
  getApiKey,
  clearApiKey,
  healthCheck,
} from "../services/biogears";

type TestStatus = "idle" | "testing" | "ok" | "fail";

export default function ServerConfigScreen() {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKeyInput] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Load stored values on mount ──────────────────────────────────────────
  useEffect(() => {
    getBiogearsBaseUrl().then(setUrl);
    getApiKey().then((k) => setApiKeyInput(k));
  }, []);

  // ── Save both values ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!url.trim()) {
      Alert.alert("Missing URL", "Please enter the server URL.");
      return;
    }
    setSaving(true);
    try {
      await setBiogearsBaseUrl(url.trim());
      if (apiKey.trim()) await setApiKey(apiKey.trim());
      Alert.alert("✅ Saved", "Server settings updated. Test connection to verify.");
    } catch {
      Alert.alert("Error", "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  // ── Test connection ───────────────────────────────────────────────────────
  const handleTest = async () => {
    if (!url.trim()) {
      Alert.alert("Missing URL", "Save a server URL first.");
      return;
    }
    setTestStatus("testing");
    setTestMsg("");
    try {
      // Save temporarily so healthCheck uses current input values
      await setBiogearsBaseUrl(url.trim());
      if (apiKey.trim()) await setApiKey(apiKey.trim());

      const data = await healthCheck();
      setTestStatus("ok");
      setTestMsg(`Connected ✓  Engine: ${data.engine}  v${data.version}`);
    } catch (err: any) {
      setTestStatus("fail");
      setTestMsg(err.message || "Could not reach server.");
    }
  };

  // ── Clear API key ─────────────────────────────────────────────────────────
  const handleClearKey = () => {
    Alert.alert("Clear API Key?", "You'll need to re-enter it to use the server.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          await clearApiKey();
          setApiKeyInput("");
        },
      },
    ]);
  };

  // ── Quick-fill presets ────────────────────────────────────────────────────
  const presets = [
    { label: "Local Dev (Wi-Fi)", value: "http://10.172.0.79:8000" },
    { label: "E2E Cloud (HTTP)", value: "http://151.185.42.123" },
    { label: "E2E Cloud (HTTPS)", value: "https://yourdomain.com" },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: "Server Configuration",
          headerStyle: { backgroundColor: "#0F0F1A" },
          headerTintColor: "#F0F0FF",
          headerTitleStyle: { fontWeight: "700" },
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <Text style={s.title}>🌐 BioGears Server</Text>
          <Text style={s.sub}>
            Point the app at your local development server or the E2E Cloud deployment.
          </Text>

          {/* ── URL Input ──────────────────────────────────────────────── */}
          <Text style={s.label}>SERVER URL</Text>
          <TextInput
            style={s.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://yourdomain.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {/* ── Quick Presets ───────────────────────────────────────────── */}
          <Text style={s.label}>QUICK PRESETS</Text>
          <View style={s.presetRow}>
            {presets.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={s.presetChip}
                onPress={() => setUrl(p.value)}
              >
                <Text style={s.presetText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── API Key Input ───────────────────────────────────────────── */}
          <Text style={s.label}>API KEY</Text>
          <TextInput
            style={s.input}
            value={apiKey}
            onChangeText={setApiKeyInput}
            placeholder="Paste the X-API-Key value from .env"
            placeholderTextColor="#555"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TouchableOpacity onPress={handleClearKey} style={{ alignSelf: "flex-end" }}>
            <Text style={s.clearKey}>Clear saved key</Text>
          </TouchableOpacity>

          {/* ── Test Result Banner ─────────────────────────────────────── */}
          {testStatus !== "idle" && (
            <View style={[
              s.testBanner,
              testStatus === "ok" && s.testOk,
              testStatus === "fail" && s.testFail,
              testStatus === "testing" && s.testPending,
            ]}>
              {testStatus === "testing"
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.testBannerText}>{testMsg}</Text>
              }
            </View>
          )}

          {/* ── Actions ────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={s.btnTest}
            onPress={handleTest}
            disabled={testStatus === "testing"}
          >
            <Text style={s.btnTestText}>⚡  Test Connection</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnSave}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.btnSaveText}>💾  Save Settings</Text>
            }
          </TouchableOpacity>

          {/* ── Info Card ──────────────────────────────────────────────── */}
          <View style={s.infoCard}>
            <Text style={s.infoTitle}>Where to get these values</Text>
            <Text style={s.infoText}>
              {"• "}
              <Text style={s.bold}>Server URL</Text>: your E2E Cloud VM's public IP or domain,
              e.g. {"`http://103.x.x.x`"} or {"`https://yourdomain.com`"}.{"\n"}
              {"• "}
              <Text style={s.bold}>API Key</Text>: the value of {"`DIGITAL_TWIN_API_KEY`"} from the
              server's {"`/.env`"} file. Ask your project admin.{"\n\n"}
              For local development, use your laptop's Wi-Fi IP and leave the API key blank.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BG      = "#0F0F1A";
const CARD    = "#1A1A2E";
const PURPLE  = "#7C3AED";
const TEXT    = "#F0F0FF";
const MUTED   = "#888";
const BORDER  = "#2A2A4A";

const s = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: BG },
  content: { padding: 24, paddingBottom: 60 },

  title: { fontSize: 22, fontWeight: "700", color: TEXT, marginBottom: 8 },
  sub:   { fontSize: 14, color: MUTED, lineHeight: 20, marginBottom: 28 },

  label: {
    fontSize: 11, color: MUTED, letterSpacing: 1.2,
    fontWeight: "600", marginBottom: 8, marginTop: 20,
  },

  input: {
    backgroundColor: CARD, color: TEXT,
    borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 16, fontSize: 15,
  },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip: {
    backgroundColor: CARD, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  presetText: { color: MUTED, fontSize: 12, fontWeight: "500" },

  clearKey: { color: "#EF4444", fontSize: 13, marginTop: 8 },

  testBanner: {
    borderRadius: 12, padding: 14, marginTop: 20,
    alignItems: "center", justifyContent: "center", minHeight: 50,
  },
  testOk:      { backgroundColor: "#052E16" },
  testFail:    { backgroundColor: "#2D0A0A" },
  testPending: { backgroundColor: "#1E1A30" },
  testBannerText: { color: TEXT, fontSize: 14, fontWeight: "500" },

  btnTest: {
    marginTop: 20,
    backgroundColor: CARD, borderRadius: 14, padding: 18,
    alignItems: "center", borderWidth: 1, borderColor: PURPLE,
  },
  btnTestText: { color: PURPLE, fontSize: 16, fontWeight: "600" },

  btnSave: {
    marginTop: 12,
    backgroundColor: PURPLE, borderRadius: 14, padding: 18,
    alignItems: "center",
    shadowColor: PURPLE, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnSaveText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  infoCard: {
    marginTop: 28, backgroundColor: CARD,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  infoTitle: { color: TEXT, fontWeight: "600", fontSize: 14, marginBottom: 10 },
  infoText:  { color: MUTED, fontSize: 13, lineHeight: 22 },
  bold:      { color: TEXT, fontWeight: "600" },
});
