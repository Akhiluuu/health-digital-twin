// app/MedicationVault.tsx

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { Medicine, useMedicine } from "../context/MedicineContext";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import Header from "./components/Header";
import { useNotifications } from "../context/NotificationContext";

// deleteMedicine + cancelMedicineNotification now handled via context.removeMedicine
import { cancelRoutineReminder, scheduleRoutineReminder } from "../services/notifeeService";
import TimePicker from "../components/twin/TimePicker";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { log } from "../utils/logger";
import { addToMedicineHistory } from "../utils/medicineHistory";
import { getLocalDateString } from "../utils/twinUtils";

///////////////////////////////////////////////////////////
// Vault Alarm Settings Card
// Lets users set a "global" daily medication reminder from
// within the MedicationVault page itself.
///////////////////////////////////////////////////////////

const VAULT_ALARM_KEY = "@vault_global_alarm";

function VaultAlarmCard({ c, accent }: { c: any; accent: string }) {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled]   = useState(false);
  const [time, setTime]         = useState("08:00");
  const NOTIF_ID = "vault_global_med_alarm";

  useEffect(() => {
    AsyncStorage.getItem(VAULT_ALARM_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = JSON.parse(raw);
          setEnabled(parsed.enabled ?? false);
          setTime(parsed.time ?? "08:00");
        }
      })
      .catch(() => {});
  }, []);

  const save = async (newEnabled: boolean, newTime: string) => {
    await AsyncStorage.setItem(VAULT_ALARM_KEY, JSON.stringify({ enabled: newEnabled, time: newTime }));
    await cancelRoutineReminder(NOTIF_ID);
    if (newEnabled) {
      const [h, m] = newTime.split(":").map(Number);
      await scheduleRoutineReminder(
        NOTIF_ID,
        "💊 Medication Reminder",
        "Time to take your daily medicines.",
        h, m,
        "medicine"
      );
    }
  };

  const toggle = async (val: boolean) => {
    setEnabled(val);
    await save(val, time);
  };

  const changeTime = async (newTime: string) => {
    setTime(newTime);
    if (enabled) await save(enabled, newTime);
  };

  return (
    <View style={[va.card, { backgroundColor: c.card, borderColor: expanded ? accent + "70" : c.border }]}>
      <TouchableOpacity style={va.row} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
        <View style={[va.iconBox, { backgroundColor: accent + "20" }]}>
          <Ionicons name="alarm-outline" size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[va.title, { color: c.text }]}>Daily Medication Alarm</Text>
          <Text style={[va.sub, { color: c.sub }]}>
            {enabled ? `Active · every day at ${time}` : "No global alarm set"}
          </Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={c.sub} />
      </TouchableOpacity>

      {expanded && (
        <View style={[va.body, { borderTopColor: c.border }]}>
          <Text style={[va.hint, { color: c.sub }]}>
            This alarm fires daily as a general reminder to take your medicines.
            Individual medicine alarms are set per-medicine when you add them.
          </Text>
          <View style={va.controlRow}>
            <Text style={[va.label, { color: c.text }]}>Reminder Time</Text>
            <TimePicker value={time} onChange={changeTime} accent={accent} />
          </View>
          <View style={va.controlRow}>
            <Text style={[va.label, { color: c.text }]}>Enable Daily Alarm</Text>
            <Switch
              value={enabled}
              onValueChange={toggle}
              trackColor={{ false: c.border, true: accent }}
              thumbColor="#fff"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const va = StyleSheet.create({
  card:    { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  row:     { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 9, justifyContent: "center", alignItems: "center" },
  title:   { fontSize: 14, fontWeight: "700" },
  sub:     { fontSize: 11, marginTop: 2 },
  body:    { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  hint:    { fontSize: 11, lineHeight: 16, marginBottom: 12, fontStyle: "italic" },
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  label:   { fontSize: 13, fontWeight: "600" },
});

///////////////////////////////////////////////////////////
function formatDateString(val: string): string {
  if (!val) return '';
  if (val === 'ongoing') return 'Ongoing';
  let cleanVal = val;
  if (val.includes('T')) {
    cleanVal = val.split('T')[0];
  }
  const parts = cleanVal.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const date = new Date(y, m, d);
      return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  return val;
}

///////////////////////////////////////////////////////////
// Only show taken indicator if takenDate is TODAY.
// Daily medicines from yesterday are never shown as ticked.
///////////////////////////////////////////////////////////
function isTakenToday(medicine: Medicine): boolean {
  if (medicine.taken !== 1) return false;
  if (!medicine.takenDate) return false;
  const today = getLocalDateString();
  return medicine.takenDate === today;
}

function isMissedToday(medicine: Medicine): boolean {
  if (medicine.taken !== -1) return false;
  if (!medicine.takenDate) return false;
  const today = getLocalDateString();
  return medicine.takenDate === today;
}

///////////////////////////////////////////////////////////

export default function MedicationVault() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  const { medicines, removeMedicine, reloadMedicines, clearAllMedicines, setMedicineStatus } = useMedicine();
  const [filter, setFilter] = useState<"all" | "regular" | "once">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "completed">("active");

  /////////////////////////////////////////////////////////
  // REFRESH on screen focus
  /////////////////////////////////////////////////////////

  const { markReadByCategory } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      reloadMedicines();
      markReadByCategory("medication");
    }, [reloadMedicines, markReadByCategory])
  );

  /////////////////////////////////////////////////////////
  // FILTER
  /////////////////////////////////////////////////////////

  const filteredMedicines = medicines.filter((med: Medicine) => {
    // 1. Status Filter
    const today = getLocalDateString();
    const isActive = med.endDate === "ongoing" || med.endDate >= today;
    if (statusFilter === "active" && !isActive) return false;
    if (statusFilter === "completed" && isActive) return false;

    // 2. Schedule Filter
    if (filter === "regular") return med.frequency === "daily";
    if (filter === "once") return med.frequency === "once";
    return true;
  });

  /////////////////////////////////////////////////////////
  // DELETE
  /////////////////////////////////////////////////////////

  const handleDelete = (medicine: Medicine) => {
    Alert.alert(
      "Delete Medicine",
      `Delete ${medicine.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Log to history first
              await addToMedicineHistory({
                medicineId: medicine.id,
                medicineName: medicine.name,
                dose: medicine.dose,
                time: medicine.time,
                status: "deleted",
              });

              // ✅ Use context removeMedicine — cancels notification, deletes
              // from SQLite, syncs delete to Firebase, and reloads state.
              // Previously used raw deleteMedicine() which skipped Firebase
              // sync, causing the medicine to reappear after next login.
              await removeMedicine(medicine.id);

              log("✅ Deleted + history saved");
            } catch (err) {
              if (err instanceof Error) {
                console.log(err.message);
              }
            }
          },
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    if (medicines.length === 0) return;
    Alert.alert(
      "Delete All Medications",
      "Are you sure you want to delete all medications? This will cancel all scheduled reminders and sync with the cloud.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              await clearAllMedicines();
              Alert.alert("Success", "All medications have been deleted.");
            } catch (err) {
              console.log("❌ Error deleting all medicines:", err);
            }
          },
        },
      ]
    );
  };
  const handleToggleTaken = async (item: Medicine) => {
    try {
      const currentlyTaken = isTakenToday(item);
      const newStatus = currentlyTaken ? "pending" : "taken";

      if (newStatus === "taken") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      await setMedicineStatus(item.id, newStatus);
    } catch (error) {
      console.log("❌ handleToggleTaken error:", error);
    }
  };

  const handleToggleMissed = async (item: Medicine) => {
    try {
      const currentlyMissed = isMissedToday(item);
      const newStatus = currentlyMissed ? "pending" : "missed";

      if (newStatus === "missed") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      await setMedicineStatus(item.id, newStatus);
    } catch (error) {
      console.log("❌ handleToggleMissed error:", error);
    }
  };
  /////////////////////////////////////////////////////////
  // ITEM RENDER
  /////////////////////////////////////////////////////////
  const renderMedicine = ({ item }: { item: Medicine }) => {
    const takenToday = isTakenToday(item);
    const missedToday = isMissedToday(item);

    let borderColor = "transparent";
    let borderWidth = 0;
    if (takenToday) {
      borderColor = "#22c55e";
      borderWidth = 1.5;
    } else if (missedToday) {
      borderColor = "#ef4444";
      borderWidth = 1.5;
    }

    return (
      <View
        style={[
          styles.medCard,
          {
            backgroundColor: c.card,
            borderWidth,
            borderColor,
          },
        ]}
      >
        <View style={styles.medContent}>
          <View style={styles.medInfo}>
            <View style={styles.medHeader}>
              <Text style={[styles.medName, { color: c.text }]}>
                {item.name}
              </Text>

              {takenToday && (
                <View style={styles.statusBadgeSmall}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={[styles.statusTextSmall, { color: "#22c55e" }]}>Taken</Text>
                </View>
              )}

              {missedToday && (
                <View style={styles.statusBadgeSmall}>
                  <Ionicons name="close-circle" size={14} color="#ef4444" />
                  <Text style={[styles.statusTextSmall, { color: "#ef4444" }]}>Missed</Text>
                </View>
              )}

              {!takenToday && !missedToday && (
                <View style={styles.statusBadgeSmall}>
                  <Ionicons name="ellipse-outline" size={14} color={c.sub} />
                  <Text style={[styles.statusTextSmall, { color: c.sub }]}>Pending</Text>
                </View>
              )}

              {item.reminder === 1 && !takenToday && !missedToday && (
                <Ionicons name="notifications" size={16} color={c.accent} />
              )}
            </View>

            <Text style={[styles.medDose, { color: c.sub }]}>
              {item.dose}
            </Text>

            <View style={styles.dateRangeRow}>
              <Ionicons name="calendar-outline" size={12} color={c.sub} />
              <Text style={[styles.dateRangeText, { color: c.sub }]}>
                {formatDateString(item.startDate)} — {formatDateString(item.endDate)}
              </Text>
            </View>

            <View style={styles.medFooter}>
              <View
                style={[
                  styles.timeBadge,
                  { backgroundColor: c.accent + "20" },
                ]}
              >
                <Ionicons name="time" size={12} color={c.accent} />
                <Text style={[styles.medTime, { color: c.accent }]}>
                  {item.time}
                </Text>
              </View>

              {item.meal && (
                <View
                  style={[styles.mealBadge, { backgroundColor: c.border }]}
                >
                  <Text style={[styles.mealText, { color: c.sub }]}>
                    {item.meal === "before" ? "🍽️ Before" : "🍽️ After"}
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.scheduleBadge,
                  {
                    backgroundColor:
                      item.frequency === "once" ? "#f472b620" : "#22c55e20",
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: item.frequency === "once" ? "#f472b6" : "#22c55e",
                  }}
                >
                  {item.frequency.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.statusButton,
                takenToday && { backgroundColor: "#22c55e20" }
              ]}
              onPress={() => handleToggleTaken(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={takenToday ? "checkmark-circle" : "checkmark-circle-outline"}
                size={22}
                color={takenToday ? "#22c55e" : c.sub}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.statusButton,
                missedToday && { backgroundColor: "#ef444420" }
              ]}
              onPress={() => handleToggleMissed(item)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={missedToday ? "close-circle" : "close-circle-outline"}
                size={22}
                color={missedToday ? "#ef4444" : c.sub}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  /////////////////////////////////////////////////////////
  // UI
  /////////////////////////////////////////////////////////

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <Header />

      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: c.text }]}>
            Medication Vault
          </Text>

          <View style={styles.headerButtons}>
            {medicines.length > 0 && (
              <TouchableOpacity
                style={[styles.historyButton, { backgroundColor: c.card }]}
                onPress={handleDeleteAll}
              >
                <Ionicons name="trash-outline" size={24} color="#ef4444" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.historyButton, { backgroundColor: c.card }]}
              onPress={() => router.push("/MedicineHistory" as any)}
            >
              <Ionicons name="time-outline" size={24} color={c.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: c.accent }]}
              onPress={() => router.push("/AddMedicine" as any)}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ✅ Alarm Settings Card */}
        <VaultAlarmCard c={c} accent={c.accent} />

        {/* ✅ Status Switcher (Active / Completed) */}
        <View style={[styles.statusToggleContainer, { backgroundColor: c.card }]}>
          <TouchableOpacity
            style={[
              styles.statusTab,
              statusFilter === "active" && { backgroundColor: c.accent }
            ]}
            onPress={() => setStatusFilter("active")}
          >
            <Text style={[styles.statusTabTxt, { color: statusFilter === "active" ? "#fff" : c.sub }]}>
              ACTIVE MEDICATIONS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.statusTab,
              statusFilter === "completed" && { backgroundColor: c.accent }
            ]}
            onPress={() => setStatusFilter("completed")}
          >
            <Text style={[styles.statusTabTxt, { color: statusFilter === "completed" ? "#fff" : c.sub }]}>
              COMPLETED
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.filterBar, { backgroundColor: c.card }]}>
          {(["all", "regular", "once"] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterTab,
                filter === type && {
                  borderBottomColor: c.accent,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setFilter(type)}
            >
              <Text
                style={{
                  color: filter === type ? c.accent : c.sub,
                  fontWeight: "600",
                }}
              >
                {type === "all"
                  ? "ALL"
                  : type === "regular"
                  ? "DAILY"
                  : "ONCE"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filteredMedicines}
          renderItem={renderMedicine}
          keyExtractor={(item) => String(item.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      </View>
    </SafeAreaView>
  );
}

////////////////////////////////////////////////////////////

const styles = StyleSheet.create({
  safe: { flex: 1 },

  container: {
    flex: 1,
    padding: 16,
    paddingTop: 90,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
  },

  headerButtons: {
    flexDirection: "row",
    gap: 12,
  },

  historyButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },

  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  filterBar: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },

  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },

  list: {
    paddingBottom: 20,
  },

  medCard: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
  },

  medContent: {
    flexDirection: "row",
    padding: 16,
    alignItems: "center",
  },

  medInfo: { flex: 1 },

  medHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },

  medName: {
    fontSize: 16,
    fontWeight: "600",
  },

  medDose: {
    fontSize: 14,
    marginBottom: 8,
  },

  medFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  timeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },

  medTime: {
    fontSize: 12,
    fontWeight: "500",
  },

  mealBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  mealText: {
    fontSize: 12,
  },

  scheduleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  actionButtons: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 10,
  },

  deleteButton: {
    padding: 8,
  },

  emptyState: {
    alignItems: "center",
    padding: 32,
    borderRadius: 16,
    marginTop: 20,
  },

  emptyText: {
    marginTop: 12,
    fontSize: 16,
    marginBottom: 20,
  },

  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },

  emptyButtonText: {
    color: "#fff",
    fontWeight: "600",
  },

  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  dateRangeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  statusToggleContainer: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
  },
  statusTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  statusTabTxt: {
    fontWeight: "700",
    fontSize: 12,
  },
  statusButton: {
    padding: 8,
    borderRadius: 20,
  },
  statusBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "transparent",
    marginLeft: 8,
  },
  statusTextSmall: {
    fontSize: 12,
    fontWeight: "700",
  },
});