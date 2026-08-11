import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { getJourneyTimeline, JourneyTimelineEvent } from "../services/journeyService";

import { useFamily } from "../context/FamilyContext";
import { getTwinId } from "../utils/twinUtils";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

export default function JourneyTimelineScreen() {
  useStackBackHandler();
  const router = useRouter();
  const { theme } = useTheme();
  const { activeProfile } = useFamily();
  const isDark = theme === "dark";
  const c = colors[theme];

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<JourneyTimelineEvent[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const patientId = activeProfile ? getTwinId(activeProfile) : "p_healthy";

  const filterChips = [
    { id: "all", label: "All Events" },
    { id: "labs", label: "Labs" },
    { id: "medications", label: "Meds" },
    { id: "vitals", label: "Vitals" },
    { id: "milestones", label: "Milestones" },
    { id: "goals", label: "Goals" },
  ];

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const res = await getJourneyTimeline(patientId, activeFilter === "all" ? undefined : activeFilter, searchQuery);
      setEvents(res.events || []);
    } catch (e) {
      console.log("Error loading timeline:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, [activeFilter, searchQuery]);

  const getEventBadge = (type: string) => {
    if (type.includes("milestone")) return { icon: "trophy", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.15)" };
    if (type.includes("lab") || type.includes("ocr")) return { icon: "flask", color: "#8B5CF6", bg: "rgba(139, 92, 246, 0.15)" };
    if (type.includes("medication")) return { icon: "medical", color: "#06B6D4", bg: "rgba(6, 182, 212, 0.15)" };
    if (type.includes("vital")) return { icon: "heart-pulse", color: "#EF4444", bg: "rgba(239, 68, 68, 0.15)" };
    if (type.includes("goal")) return { icon: "flag", color: "#10B981", bg: "rgba(16, 185, 129, 0.15)" };
    return { icon: "git-commit-outline", color: "#3B82F6", bg: "rgba(59, 130, 246, 0.15)" };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? "#0A0F1D" : "#F8FAFC" }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#0F172A"} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>Health Journey Timeline</Text>
          <Text style={styles.headerSub}>Complete Longitudinal Record</Text>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={[styles.searchContainer, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
        <Ionicons name="search" size={20} color="#64748B" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Search timeline events..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[styles.searchInput, { color: isDark ? "#FFF" : "#0F172A" }]}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color="#64748B" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* FILTER CHIPS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {filterChips.map((chip) => {
          const active = activeFilter === chip.id;
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={() => setActiveFilter(chip.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? "#3B82F6" : isDark ? "#111C35" : "#E2E8F0",
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? "#FFF" : isDark ? "#94A3B8" : "#475569" }]}>{chip.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* TIMELINE EVENT STREAM */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="documents-outline" size={48} color="#64748B" />
          <Text style={{ color: "#64748B", marginTop: 12, fontSize: 16 }}>No timeline events found</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {events.map((item, index) => {
            const badge = getEventBadge(item.event_type);
            const eventDate = new Date(item.timestamp).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <View key={item.event_id || index} style={styles.timelineItem}>
                {/* TIMELINE LINE & BADGE */}
                <View style={styles.lineCol}>
                  <View style={[styles.iconCircle, { backgroundColor: badge.bg }]}>
                    <Ionicons name={badge.icon as any} size={18} color={badge.color} />
                  </View>
                  {index < events.length - 1 && <View style={[styles.verticalLine, { backgroundColor: isDark ? "#1E2D4A" : "#E2E8F0" }]} />}
                </View>

                {/* CONTENT CARD */}
                <View style={[styles.eventCard, { backgroundColor: isDark ? "#111C35" : "#FFF", borderColor: isDark ? "#1E2D4A" : "#E2E8F0" }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <Text style={[styles.eventTitle, { color: isDark ? "#FFF" : "#0F172A" }]}>{item.title}</Text>
                  </View>
                  <Text style={styles.eventDate}>{eventDate}</Text>
                  <Text style={[styles.eventDesc, { color: isDark ? "#CBD5E1" : "#475569" }]}>{item.description}</Text>
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterRow: { maxHeight: 38, marginBottom: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  chipText: { fontSize: 13, fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  timelineItem: { flexDirection: "row", marginBottom: 16 },
  lineCol: { alignItems: "center", marginRight: 12, width: 36 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  verticalLine: { flex: 1, width: 2, marginTop: 4 },
  eventCard: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1 },
  eventTitle: { fontSize: 15, fontWeight: "700" },
  eventDate: { fontSize: 11, color: "#64748B", marginBottom: 6 },
  eventDesc: { fontSize: 13, lineHeight: 18 },
});
