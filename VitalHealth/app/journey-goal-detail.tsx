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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { getJourneyGoals, HealthGoal } from "../services/journeyService";

import { useFamily } from "../context/FamilyContext";
import { getTwinId } from "../utils/twinUtils";

export default function JourneyGoalDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const { activeProfile } = useFamily();
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<HealthGoal | null>(null);
  const patientId = activeProfile ? getTwinId(activeProfile) : "p_healthy";

  useEffect(() => {
    async function load() {
      try {
        const res = await getJourneyGoals(patientId);
        const g = res.goals.find((x) => x.goal_id === params.goal_id) || res.goals[0];
        setGoal(g || null);
      } catch (e) {
        console.log("Error loading goal detail:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.goal_id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
        <View style={styles.center}><ActivityIndicator size="large" color="#10B981" /></View>
      </SafeAreaView>
    );
  }

  if (!goal) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#0F172A"} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Goal Detail</Text>
        </View>
        <View style={styles.center}><Text style={{ color: "#64748B" }}>Goal not found</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#0F172A"} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>{goal.title}</Text>
          <Text style={styles.headerSub}>{goal.category.toUpperCase()} GOAL</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* PROGRESS HERO CARD */}
        <View style={[styles.progressCard, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
          <Text style={[styles.cardTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Progress Overview</Text>
          <View style={styles.metricRow}>
            <View>
              <Text style={styles.metricLabel}>Current</Text>
              <Text style={[styles.metricVal, { color: isDark ? "#FFF" : "#0F172A" }]}>{goal.current_value} <Text style={{ fontSize: 14 }}>{goal.unit}</Text></Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#64748B" />
            <View>
              <Text style={styles.metricLabel}>Target</Text>
              <Text style={[styles.metricVal, { color: "#10B981" }]}>{goal.target_value} <Text style={{ fontSize: 14 }}>{goal.unit}</Text></Text>
            </View>
          </View>

          {/* BAR */}
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${Math.min(100, goal.progress_pct)}%` }]} />
          </View>
          <Text style={styles.progressPct}>{goal.progress_pct}% Completed</Text>
        </View>

        {/* DETAILS CARD */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
          <Text style={[styles.cardTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Description</Text>
          <Text style={[styles.bodyText, { color: isDark ? "#CBD5E1" : "#475569" }]}>{goal.description}</Text>

          <View style={{ height: 1, backgroundColor: isDark ? "#1E2D4A" : "#E2E8F0", marginVertical: 12 }} />

          <Text style={[styles.cardTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Status & Confidence</Text>
          <Text style={[styles.bodyText, { color: isDark ? "#CBD5E1" : "#475569" }]}>
            Status: <Text style={{ fontWeight: "700", textTransform: "capitalize" }}>{goal.status}</Text> | Clinical Confidence: <Text style={{ fontWeight: "700" }}>{Math.round(goal.confidence * 100)}%</Text>
          </Text>
        </View>

        {/* CLINICAL RECOMMENDATIONS */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
          <Text style={[styles.cardTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Actionable Steps</Text>
          {goal.recommendations.map((rec, idx) => (
            <View key={idx} style={styles.recRow}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" style={{ marginRight: 8, marginTop: 2 }} />
              <Text style={[styles.recText, { color: isDark ? "#CBD5E1" : "#475569" }]}>{rec}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  headerSub: { fontSize: 11, color: "#64748B", letterSpacing: 0.5 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  progressCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  metricRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginBottom: 16 },
  metricLabel: { fontSize: 12, color: "#64748B" },
  metricVal: { fontSize: 22, fontWeight: "800" },
  barBg: { height: 10, borderRadius: 5, backgroundColor: "rgba(16, 185, 129, 0.15)", overflow: "hidden", marginBottom: 6 },
  barFill: { height: "100%", backgroundColor: "#10B981", borderRadius: 5 },
  progressPct: { fontSize: 12, fontWeight: "700", color: "#10B981", textAlign: "right" },
  infoCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  bodyText: { fontSize: 14, lineHeight: 20 },
  recRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  recText: { fontSize: 14, flex: 1, lineHeight: 20 },
});
