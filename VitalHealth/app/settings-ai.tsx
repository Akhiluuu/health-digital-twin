// app/settings-ai.tsx
// AI Chatbot Server Configuration screen — themed to match app design system

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
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";

const KEY_SERVER_IP   = "@hai_server_ip";
const KEY_SERVER_PORT = "@hai_server_port";
const DEFAULT_PORT    = "8000";
const DEFAULT_AI_URL  = "http://151.185.42.123/ai";

type TestStatus = "idle" | "testing" | "ok" | "fail";

export default function AIServerConfigScreen() {
  const { theme } = useTheme();
  const c = colors[theme];
  const router = useRouter();

  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMsg, setTestMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Load stored values on mount ──────────────────────────────────────────
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedIp = await AsyncStorage.getItem(KEY_SERVER_IP);
        const storedPort = await AsyncStorage.getItem(KEY_SERVER_PORT);
        
        if (storedIp) {
          setIp(storedIp);
          setPort(storedPort || "");
        } else {
          // Parse default
          const u = new URL(DEFAULT_AI_URL);
          setIp(u.protocol + "//" + u.hostname + u.pathname);
          setPort(u.port || "");
        }
      } catch (e) {
        console.error("Failed to load AI settings:", e);
      }
    };
    loadSettings();
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
    if (!ip.trim()) {
      Alert.alert("Missing Address", "Please enter the server address.");
      return;
    }
    setSaving(true);
    try {
      await AsyncStorage.setItem(KEY_SERVER_IP, ip.trim());
      await AsyncStorage.setItem(KEY_SERVER_PORT, port.trim());
      Alert.alert("✅ Saved", "AI Chatbot server settings updated.", [
        { text: "OK", onPress: () => router.back() }
      ]);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${finalUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        setTestStatus("ok");
        setTestMsg(`Connected successfully to ${finalUrl}`);
      } else {
        setTestStatus("fail");
        setTestMsg(`Server replied with error: ${res.status}`);
      }
    } catch (e: any) {
      setTestStatus("fail");
      setTestMsg(e.name === "AbortError" ? "Connection timed out." : "Cannot connect — check IP and WiFi.");
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Stack.Screen options={{ 
        title: "Health AI Config",
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        headerShadowVisible: false,
      }} />

      <ScrollView contentContainerStyle={ss.container} keyboardShouldPersistTaps="handled">
        <View style={[ss.headerCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="chatbubbles" size={32} color={c.accent} style={{ marginBottom: 12 }} />
          <Text style={[ss.title, { color: c.text }]}>AI Chatbot Server</Text>
          <Text style={[ss.subtitle, { color: c.sub }]}>
            Connect to the LLM backend for intelligent health conversations. Chunking and embedding still happen on this device.
          </Text>
        </View>

        <View style={ss.formGroup}>
          <Text style={[ss.label, { color: c.sub }]}>Server Address</Text>
          <View style={[ss.inputRow, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="globe-outline" size={20} color={c.sub} style={ss.icon} />
            <TextInput
              style={[ss.input, { color: c.text }]}
              placeholder="e.g. http://151.185.42.123/ai"
              placeholderTextColor={c.sub}
              value={ip}
              onChangeText={setIp}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <Text style={[ss.helperText, { color: c.sub }]}>Do not include the port here</Text>
        </View>

        <View style={ss.formGroup}>
          <Text style={[ss.label, { color: c.sub }]}>Port</Text>
          <View style={[ss.inputRow, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="hardware-chip-outline" size={20} color={c.sub} style={ss.icon} />
            <TextInput
              style={[ss.input, { color: c.text }]}
              placeholder="8000"
              placeholderTextColor={c.sub}
              value={port}
              onChangeText={setPort}
              keyboardType="numeric"
            />
          </View>
          <Text style={[ss.helperText, { color: c.sub }]}>Leave empty for default (80/443)</Text>
        </View>

        {/* Test Section */}
        <View style={[ss.testCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <TouchableOpacity
            style={[ss.testBtn, { backgroundColor: c.bg, borderColor: c.accent }]}
            onPress={handleTest}
            disabled={testStatus === "testing" || !ip.trim()}
          >
            {testStatus === "testing" ? (
              <ActivityIndicator color={c.accent} />
            ) : (
              <>
                <Ionicons name="analytics" size={18} color={c.accent} />
                <Text style={[ss.testBtnTxt, { color: c.accent }]}>Test AI Connection</Text>
              </>
            )}
          </TouchableOpacity>

          {testStatus === "ok" && (
            <View style={[ss.statusBox, { backgroundColor: "#10b98115", borderColor: "#10b98150" }]}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={[ss.statusTxt, { color: "#10b981" }]}>{testMsg}</Text>
            </View>
          )}

          {testStatus === "fail" && (
            <View style={[ss.statusBox, { backgroundColor: "#ef444415", borderColor: "#ef444450" }]}>
              <Ionicons name="alert-circle" size={20} color="#ef4444" />
              <Text style={[ss.statusTxt, { color: "#ef4444" }]}>{testMsg}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[ss.saveBtn, { backgroundColor: c.accent }, (!ip.trim() || saving) && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={!ip.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={ss.saveBtnTxt}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ss = StyleSheet.create({
  container: { padding: 20, paddingBottom: 60 },
  headerCard: {
    padding: 24, borderRadius: 20, borderWidth: 1,
    alignItems: "center", marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: "center", lineHeight: 20 },

  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8, marginLeft: 4 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, height: 56,
  },
  icon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, height: "100%" },
  helperText: { fontSize: 12, marginTop: 6, marginLeft: 4 },

  testCard: {
    padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 32, gap: 12,
  },
  testBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    height: 48, borderRadius: 12, borderWidth: 1, gap: 8,
  },
  testBtnTxt: { fontSize: 15, fontWeight: "600" },
  statusBox: {
    flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, gap: 8,
  },
  statusTxt: { fontSize: 13, flex: 1 },

  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    height: 56, borderRadius: 16, gap: 10,
  },
  saveBtnTxt: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
