// app/VitalsHistoryScreen.tsx
// Screen listing logged vitals grouped by date with support for editing.

import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useNavigation } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { useFamily } from "../context/FamilyContext";
import { getAllVitalsRecords, VitalsRecord } from "../database/vitalsDB";
import { log } from "../utils/logger";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

interface GroupedRecords {
  date: string;
  data: VitalsRecord[];
}

export default function VitalsHistoryScreen() {
  useStackBackHandler();
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const c = colors[theme];
  const { activeMemberId, isSwitched } = useFamily();
  const memberId = isSwitched && activeMemberId ? activeMemberId : "self";

  const [records, setRecords] = useState<VitalsRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── LOAD RECORDS ON MOUNT, FOCUS, AND PROFILE SWITCH ───
  useEffect(() => {
    loadRecords();
    const unsubscribe = navigation.addListener("focus", () => {
      loadRecords();
    });
    return unsubscribe;
  }, [navigation, memberId]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      const data = await getAllVitalsRecords(memberId);
      setRecords(data);
    } catch (err) {
      log("Failed to load vitals history:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── HELPERS ───
  const formatGroupHeaderDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (dateObj.toDateString() === today.toDateString()) {
      return "Today";
    }
    if (dateObj.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return dateObj.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const format12HourTime = (timeStr: string) => {
    const [hStr, mStr] = timeStr.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  // ─── GROUP BY DATE ───
  const getGroupedRecords = (): GroupedRecords[] => {
    const groups: { [key: string]: VitalsRecord[] } = {};
    records.forEach((rec) => {
      if (!groups[rec.date]) {
        groups[rec.date] = [];
      }
      groups[rec.date].push(rec);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        date,
        data: groups[date],
      }));
  };

  const groupedList = getGroupedRecords();

  // ─── RENDER CARD ITEM ───
  const renderCard = (record: VitalsRecord) => {
    const items = [];

    if (record.heartRate !== null && record.heartRate !== undefined) {
      items.push({
        label: "Heart Rate",
        value: `${record.heartRate} BPM`,
        icon: "heart",
        color: "#ef4444",
      });
    }

    if (record.bpSystolic !== null && record.bpDiastolic !== null) {
      items.push({
        label: "Blood Pressure",
        value: `${record.bpSystolic} / ${record.bpDiastolic} mmHg`,
        icon: "pulse",
        color: "#3b82f6",
      });
    } else if (record.bpSystolic !== null) {
      items.push({
        label: "Systolic BP",
        value: `${record.bpSystolic} mmHg`,
        icon: "pulse",
        color: "#3b82f6",
      });
    } else if (record.bpDiastolic !== null) {
      items.push({
        label: "Diastolic BP",
        value: `${record.bpDiastolic} mmHg`,
        icon: "pulse",
        color: "#3b82f6",
      });
    }

    if (record.spo2 !== null && record.spo2 !== undefined) {
      items.push({
        label: "SpO₂",
        value: `${record.spo2}%`,
        icon: "water-outline",
        color: "#06b6d4",
      });
    }

    if (record.temperature !== null && record.temperature !== undefined) {
      items.push({
        label: "Temperature",
        value: `${record.temperature}°C`,
        icon: "thermometer-outline",
        color: "#f97316",
      });
    }

    if (record.respiratoryRate !== null && record.respiratoryRate !== undefined) {
      items.push({
        label: "Respiratory Rate",
        value: `${record.respiratoryRate} /min`,
        icon: "body-outline",
        color: "#8b5cf6",
      });
    }

    if (record.weight !== null && record.weight !== undefined) {
      items.push({
        label: "Weight",
        value: `${record.weight} kg`,
        icon: "fitness-outline",
        color: "#10b981",
      });
    }

    if (record.bloodGlucose !== null && record.bloodGlucose !== undefined) {
      items.push({
        label: "Blood Glucose",
        value: `${record.bloodGlucose} mg/dL`,
        icon: "flask-outline",
        color: "#ec4899",
      });
    }

    if (record.feeling) {
      items.push({
        label: "Feeling Today",
        value: record.feeling,
        icon: "happy-outline",
        color: "#eab308",
      });
    }

    if (record.medicationTaken !== null && record.medicationTaken !== undefined) {
      items.push({
        label: "Meds Taken Before",
        value: record.medicationTaken === 1 ? "Yes" : "No",
        icon: "medical-outline",
        color: "#6366f1",
      });
    }

    return (
      <TouchableOpacity
        key={record.id}
        style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}
        onPress={() => router.push(`/LogVitalsScreen?id=${record.id}` as any)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.timeRow}>
            <Ionicons name="time-outline" size={14} color={c.sub} />
            <Text style={[styles.timeText, { color: c.sub }]}>
              {format12HourTime(record.time)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.sub} />
        </View>

        <View style={styles.grid}>
          {items.map((item, idx) => (
            <View key={idx} style={styles.gridItem}>
              <View style={styles.itemHeader}>
                <Ionicons name={item.icon as any} size={14} color={item.color} />
                <Text style={[styles.itemLabel, { color: c.sub }]}>{item.label}</Text>
              </View>
              <Text style={[styles.itemValue, { color: c.text }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {record.notes && (
          <View style={[styles.notesContainer, { backgroundColor: c.bg, borderColor: c.border }]}>
            <Ionicons name="document-text-outline" size={14} color={c.sub} />
            <Text style={[styles.notesText, { color: c.sub }]} numberOfLines={2}>
              {record.notes}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── RENDER EMPTY STATE ───
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconWrapper, { backgroundColor: c.accent + "10" }]}>
        <Ionicons name="clipboard-outline" size={54} color={c.accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.text }]}>No vitals recorded yet</Text>
      <Text style={[styles.emptySubtitle, { color: c.sub }]}>
        Keep track of your blood pressure, temperature, heart rate, and other measurements here.
      </Text>
      <TouchableOpacity
        style={[styles.emptyButton, { backgroundColor: c.accent }]}
        onPress={() => router.push("/LogVitalsScreen" as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.emptyButtonText}>Log Your First Vitals</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }} activeOpacity={0.7} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={c.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.text }]}>Vitals History</Text>
        <TouchableOpacity
          onPress={() => router.push("/LogVitalsScreen" as any)}
          activeOpacity={0.7}
          style={[styles.addButton, { backgroundColor: c.accent + "12" }]}
        >
          <Ionicons name="add" size={20} color={c.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={{ color: c.sub, marginTop: 10 }}>Loading history...</Text>
        </View>
      ) : records.length === 0 ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={groupedList}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.groupContainer}>
              <Text style={[styles.groupHeader, { color: c.sub }]}>
                {formatGroupHeaderDate(item.date)}
              </Text>
              {item.data.map((record) => renderCard(record))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  groupContainer: {
    marginBottom: 20,
  },
  groupHeader: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.03)",
    paddingBottom: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    width: "47%",
    marginBottom: 8,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  itemLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  itemValue: {
    fontSize: 14,
    fontWeight: "800",
    marginLeft: 18,
  },
  notesContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  notesText: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
    lineHeight: 16,
  },

  // ─── EMPTY STATE STYLES ───
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
    elevation: 2,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
});
