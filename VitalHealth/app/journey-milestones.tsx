import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { getJourneyMilestones, HealthMilestone } from "../services/journeyService";

import { useFamily } from "../context/FamilyContext";
import { getTwinId } from "../utils/twinUtils";

export default function JourneyMilestonesScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { activeProfile } = useFamily();
  const isDark = theme === "dark";

  const [loading, setLoading] = useState(true);
  const [milestones, setMilestones] = useState<HealthMilestone[]>([]);
  const patientId = activeProfile ? getTwinId(activeProfile) : "p_healthy";

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await getJourneyMilestones(patientId);
        setMilestones(res.milestones || []);
      } catch (e) {
        console.log("Error loading milestones:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#0F172A"} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Health Milestones</Text>
          <Text style={styles.headerSub}>Key Achievements & Clinical Progress</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F59E0B" />
        </View>
      ) : milestones.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="trophy-outline" size={48} color="#64748B" />
          <Text style={{ color: "#64748B", marginTop: 12, fontSize: 16 }}>No milestones achieved yet</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* LATEST CELEBRATION HERO */}
          {milestones.length > 0 && (
            <View style={[styles.heroCard, { backgroundColor: isDark ? "#1E1B4B" : "#FEF3C7", borderColor: "#F59E0B" }]}>
              <Ionicons name="trophy" size={36} color="#F59E0B" style={{ marginBottom: 8 }} />
              <Text style={[styles.heroTitle, { color: isDark ? "#FDE68A" : "#92400E" }]}>Latest Achievement!</Text>
              <Text style={[styles.heroName, { color: isDark ? "#FFF" : "#78350F" }]}>{milestones[milestones.length - 1].title}</Text>
              <Text style={[styles.heroDesc, { color: isDark ? "#FEF3C7" : "#B45309" }]}>{milestones[milestones.length - 1].description}</Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Milestone Gallery ({milestones.length})</Text>

          {/* GRID OF MILESTONES */}
          {milestones.map((ms, idx) => {
            const dateStr = new Date(ms.achieved_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <View
                key={ms.milestone_id || idx}
                style={[styles.milestoneCard, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}
              >
                <View style={styles.badgeCol}>
                  <View style={styles.trophyCircle}>
                    <Ionicons name="ribbon-outline" size={22} color="#F59E0B" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.msTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>{ms.title}</Text>
                  <Text style={styles.msDate}>{dateStr}</Text>
                  <Text style={[styles.msDesc, { color: isDark ? "#CBD5E1" : "#475569" }]}>{ms.description}</Text>
                </View>
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
  headerTitle: { fontSize: 20, fontWeight: "800" },
  headerSub: { fontSize: 13, color: "#64748B" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heroCard: { padding: 20, borderRadius: 16, borderWidth: 1.5, alignItems: "center", marginBottom: 20 },
  heroTitle: { fontSize: 14, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  heroName: { fontSize: 18, fontWeight: "800", textAlign: "center", marginBottom: 6 },
  heroDesc: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  milestoneCard: { flexDirection: "row", padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  badgeCol: { marginRight: 12, justifyContent: "center" },
  trophyCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(245, 158, 11, 0.15)", justifyContent: "center", alignItems: "center" },
  msTitle: { fontSize: 15, fontWeight: "700" },
  msDate: { fontSize: 11, color: "#64748B", marginBottom: 4 },
  msDesc: { fontSize: 13, lineHeight: 18 },
});
