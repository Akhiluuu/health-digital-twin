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
import { getJourneyInsights, JourneyInsight } from "../services/journeyService";

import { useFamily } from "../context/FamilyContext";
import { getTwinId } from "../utils/twinUtils";

export default function JourneyInsightsFeedScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { activeProfile } = useFamily();
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<JourneyInsight[]>([]);
  const patientId = activeProfile ? getTwinId(activeProfile) : "p_healthy";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await getJourneyInsights(patientId);
        setInsights(res.insights || []);
      } catch (e) {
        console.log("Error loading insights feed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [patientId]);

  const getSeverityBadge = (severity: string) => {
    if (severity === "critical" || severity === "high") return { color: "#EF4444", bg: "rgba(239,68,68,0.15)", icon: "alert-circle" };
    if (severity === "moderate") return { color: "#F59E0B", bg: "rgba(245,158,11,0.15)", icon: "warning" };
    return { color: "#10B981", bg: "rgba(16,185,129,0.15)", icon: "checkmark-circle" };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#0F172A"} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Proactive Insights Feed</Text>
          <Text style={styles.headerSub}>Auto-Detected Health Trends & Signals</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#3B82F6" /></View>
      ) : insights.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="bulb-outline" size={48} color="#64748B" />
          <Text style={{ color: "#64748B", marginTop: 12, fontSize: 16 }}>No active insights detected</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {insights.map((item, idx) => {
            const badge = getSeverityBadge(item.severity);
            const dateStr = new Date(item.detected_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

            return (
              <View
                key={item.insight_id || idx}
                style={[styles.card, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon as any} size={14} color={badge.color} style={{ marginRight: 4 }} />
                    <Text style={[styles.badgeText, { color: badge.color }]}>{item.severity.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.dateText}>{dateStr}</Text>
                </View>

                <Text style={[styles.title, { color: isDark ? "#FFF" : "#0F172A" }]}>{item.title}</Text>
                <Text style={[styles.body, { color: isDark ? "#CBD5E1" : "#475569" }]}>{item.body}</Text>

                {item.actionable_recommendation ? (
                  <View style={[styles.recBox, { backgroundColor: isDark ? "#1E2D4A" : "#F1F5F9" }]}>
                    <Ionicons name="bulb" size={16} color="#3B82F6" style={{ marginRight: 6, marginTop: 2 }} />
                    <Text style={[styles.recText, { color: isDark ? "#93C5FD" : "#1E40AF" }]}>
                      {item.actionable_recommendation}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  backButton: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  headerSub: { fontSize: 11, color: "#64748B" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  dateText: { fontSize: 11, color: "#64748B" },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  recBox: { flexDirection: "row", alignItems: "flex-start", padding: 10, borderRadius: 10 },
  recText: { fontSize: 12, flex: 1, fontWeight: "600", lineHeight: 16 },
});
