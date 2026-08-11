import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { getDoctorView, DoctorView } from "../services/journeyService";

import { useFamily } from "../context/FamilyContext";
import { getTwinId } from "../utils/twinUtils";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

export default function DoctorViewScreen() {
  useStackBackHandler();
  const router = useRouter();
  const { theme } = useTheme();
  const { activeProfile } = useFamily();
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DoctorView | null>(null);
  const patientId = activeProfile ? getTwinId(activeProfile) : "p_healthy";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await getDoctorView(patientId);
        setData(res);
      } catch (e) {
        console.log("Error loading doctor view:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
        <View style={styles.center}><ActivityIndicator size="large" color="#0284C7" /></View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
        <View style={styles.center}><Text style={{ color: "#64748B" }}>Clinical data unavailable</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
      {/* CLINICAL HEADER */}
      <View style={[styles.header, { backgroundColor: isDark ? "#0F172A" : "#0284C7" }]}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Clinician Mode — SOAP View</Text>
          <Text style={styles.headerSub}>VitalHealth Brain v5.0 Master Summary</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* SOAP NOTE CARD */}
        <View style={[styles.soapCard, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
          <Text style={[styles.sectionHeading, { color: "#0284C7" }]}>SOAP Summary</Text>

          <View style={styles.soapSection}>
            <Text style={styles.soapLabel}>S (Subjective):</Text>
            <Text style={[styles.soapBody, { color: isDark ? "#CBD5E1" : "#334155" }]}>{data.soap.subjective}</Text>
          </View>

          <View style={styles.soapSection}>
            <Text style={styles.soapLabel}>O (Objective):</Text>
            <Text style={[styles.soapBody, { color: isDark ? "#CBD5E1" : "#334155" }]}>{data.soap.objective}</Text>
          </View>

          <View style={styles.soapSection}>
            <Text style={styles.soapLabel}>A (Assessment):</Text>
            <Text style={[styles.soapBody, { color: isDark ? "#CBD5E1" : "#334155" }]}>{data.soap.assessment}</Text>
          </View>

          <View style={styles.soapSection}>
            <Text style={styles.soapLabel}>P (Plan):</Text>
            <Text style={[styles.soapBody, { color: isDark ? "#CBD5E1" : "#334155" }]}>{data.soap.plan}</Text>
          </View>
        </View>

        {/* ACTIVE MEDICATIONS */}
        <View style={[styles.card, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
          <Text style={[styles.sectionHeading, { color: isDark ? "#FFF" : "#0F172A" }]}>Active Regimen ({data.active_medications.length})</Text>
          {data.active_medications.map((m, idx) => (
            <View key={idx} style={styles.listRow}>
              <Ionicons name="medical-outline" size={16} color="#0284C7" style={{ marginRight: 8 }} />
              <Text style={[styles.listText, { color: isDark ? "#CBD5E1" : "#334155" }]}>{m}</Text>
            </View>
          ))}
        </View>

        {/* LATEST LABS */}
        <View style={[styles.card, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
          <Text style={[styles.sectionHeading, { color: isDark ? "#FFF" : "#0F172A" }]}>Recent Lab Results</Text>
          {data.latest_labs.slice(0, 5).map((l, idx) => (
            <View key={idx} style={styles.labRow}>
              <Text style={[styles.labName, { color: isDark ? "#FFF" : "#0F172A" }]}>{l.canonical_name}</Text>
              <Text style={[styles.labVal, { color: l.classification === "high" ? "#EF4444" : "#10B981" }]}>
                {l.value} {l.unit} ({l.classification})
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  backButton: { padding: 4, marginRight: 12 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#FFF" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.8)" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  soapCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  sectionHeading: { fontSize: 16, fontWeight: "800", marginBottom: 12 },
  soapSection: { marginBottom: 10 },
  soapLabel: { fontSize: 12, fontWeight: "800", color: "#0284C7", textTransform: "uppercase" },
  soapBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  listRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  listText: { fontSize: 14, fontWeight: "600" },
  labRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#64748B40" },
  labName: { fontSize: 13, fontWeight: "600" },
  labVal: { fontSize: 13, fontWeight: "700" },
});
