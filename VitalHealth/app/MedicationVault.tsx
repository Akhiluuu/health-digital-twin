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

import { Medicine, useMedicine } from "../context/MedicineContext";
import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import Header from "./components/Header";

import { deleteMedicine } from "../database/medicineDB";
import { cancelMedicineNotification } from "../services/notificationService";
import { cancelRoutineReminder, scheduleRoutineReminder } from "../services/notifeeService";
import TimePicker from "../components/twin/TimePicker";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { log } from "../utils/logger";
import { addToMedicineHistory } from "../utils/medicineHistory";

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
// Only show taken indicator if takenDate is TODAY.
// Daily medicines from yesterday are never shown as ticked.
///////////////////////////////////////////////////////////
function isTakenToday(medicine: Medicine): boolean {
  if (!medicine.taken) return false;
  if (!medicine.takenDate) return false;
  const today = new Date().toISOString().split("T")[0];
  return medicine.takenDate === today;
}

///////////////////////////////////////////////////////////

export default function MedicationVault() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = colors[theme];

  const { medicines, reloadMedicines, clearAllMedicines } = useMedicine();
  const [filter, setFilter] = useState<"all" | "regular" | "once">("all");

  /////////////////////////////////////////////////////////
  // REFRESH on screen focus
  /////////////////////////////////////////////////////////

  useFocusEffect(
    useCallback(() => {
      reloadMedicines();
    }, [])
  );

  /////////////////////////////////////////////////////////
  // FILTER
  /////////////////////////////////////////////////////////

  const filteredMedicines = medicines.filter((med: Medicine) => {
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
              await addToMedicineHistory({
                medicineId: medicine.id,
                medicineName: medicine.name,
                dose: medicine.dose,
                time: medicine.time,
                status: "deleted",
              });

              if (medicine.notificationId) {
                await cancelMedicineNotification(medicine.notificationId);
              }

              deleteMedicine(medicine.id);
              reloadMedicines();

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

  /////////////////////////////////////////////////////////
  // ITEM RENDER
  /////////////////////////////////////////////////////////

  const renderMedicine = ({ item }: { item: Medicine }) => {
    const takenToday = isTakenToday(item);

    return (
      <View
        style={[
          styles.medCard,
          {
            backgroundColor: c.card,
            // Green border when taken today — visual feedback only
            borderWidth: takenToday ? 1.5 : 0,
            borderColor: takenToday ? "#22c55e" : "transparent",
          },
        ]}
      >
        <View style={styles.medContent}>
          <View style={styles.medInfo}>
            <View style={styles.medHeader}>
              <Text style={[styles.medName, { color: c.text }]}>
                {item.name}
              </Text>

              {/* Green tick next to name — only if taken today */}
              {takenToday && (
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
              )}

              {/* Bell icon — only if reminder set AND not yet taken today */}
              {item.reminder === 1 && !takenToday && (
                <Ionicons name="notifications" size={16} color={c.accent} />
              )}
            </View>

            <Text style={[styles.medDose, { color: c.sub }]}>
              {item.dose}
            </Text>

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

          {/*
            ✅ REMOVED: The taken (✅) button has been removed from the vault.
            The tick mark is now set ONLY when the user taps "Taken"
            on the actual medication reminder notification.
            This prevents accidental manual ticking.
          */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item)}
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
});