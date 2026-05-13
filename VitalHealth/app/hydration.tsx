// app/hydration.tsx
// HYDRATION TRACKER — Water Tracking with Notifications + History

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TimePicker from "../components/twin/TimePicker";
import { useRouter } from "expo-router";
import { log } from "../utils/logger";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useHydration } from "../context/HydrationContext";
import { useTheme } from "../context/ThemeContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import {
  cancelHydrationReminder,
  scheduleHydrationReminder,
} from "../services/hydrationNotification";
import { isExpoGo } from "../utils/expoGo";
import { HydrationEntry } from "../database/hydrationHistoryDB";

const REMINDER_STORAGE_KEY = "hydration_reminder_settings";

type ReminderSettings = {
  enabled: boolean;
  interval: string;
  startTime: Date;
  endTime: Date;
};

///////////////////////////////////////////////////////////
// QUICK ADD BUTTONS CONFIG
///////////////////////////////////////////////////////////
const QUICK_ADD_BUTTONS = [
  { ml: 100, icon: "💧", label: "100ml" },
  { ml: 150, icon: "🥤", label: "150ml" },
  { ml: 200, icon: "🥛", label: "200ml" },
  { ml: 250, icon: "🥛", label: "250ml" },
  { ml: 500, icon: "🍶", label: "500ml" },
  { ml: 750, icon: "🍶", label: "750ml" },
];

///////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////
const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatTime(timestamp);
};

///////////////////////////////////////////////////////////
// MAIN SCREEN
///////////////////////////////////////////////////////////
export default function HydrationScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { water, history, addWater, reset, reloadHistory } = useHydration();
  const { addEvent } = useBiogearsTwin();

  const colors =
    theme === "light"
      ? {
          bg: "#f8fafc",
          card: "#ffffff",
          text: "#020617",
          sub: "#64748b",
          border: "#e2e8f0",
          accent: "#0ea5e9",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          historyBg: "#f1f5f9",
        }
      : {
          bg: "#020617",
          card: "#0f172a",
          text: "#ffffff",
          sub: "#94a3b8",
          border: "#334155",
          accent: "#38bdf8",
          success: "#22c55e",
          warning: "#f59e0b",
          danger: "#ef4444",
          historyBg: "#1e293b",
        };

  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({
    enabled: false,
    interval: "1h",
    startTime: new Date(new Date().setHours(7, 0, 0, 0)),
    endTime: new Date(new Date().setHours(21, 0, 0, 0)),
  });

  const [toast, setToast] = useState("");
  const [isSleepTime, setIsSleepTime] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  ///////////////////////////////////////////////////////////
  // Reload history when app comes to foreground
  ///////////////////////////////////////////////////////////
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") reloadHistory();
    });
    return () => sub.remove();
  }, [reloadHistory]);

  ///////////////////////////////////////////////////////////
  // Reminder scheduling
  ///////////////////////////////////////////////////////////
  const scheduleReminder = async (customInterval?: string) => {
    if (isExpoGo()) {
      setToast("Reminders require a development build");
      setTimeout(() => setToast(""), 2000);
      return;
    }
    try {
      await cancelHydrationReminder();
      if (!reminderSettings.enabled) return;

      const intervalMap: { [key: string]: number } = {
        "30m": 1800,
        "1h": 3600,
        "2h": 7200,
      };

      const intervalToUse = customInterval || reminderSettings.interval;
      const seconds = intervalMap[intervalToUse];
      if (!seconds) return;

      await scheduleHydrationReminder(seconds);
      log(`Reminder scheduled every ${intervalToUse}`);
      setToast(`Reminders set for every ${intervalToUse}`);
      setTimeout(() => setToast(""), 2000);
    } catch (err) {
      console.error("Error scheduling reminder:", err);
      setToast("Failed to set reminders");
      setTimeout(() => setToast(""), 2000);
    }
  };

  useEffect(() => { loadReminderSettings(); }, []);

  useEffect(() => {
    if (!isLoading) saveReminderSettings();
  }, [reminderSettings]);

  useEffect(() => {
    if (reminderSettings.enabled) checkIfSleepTime();
  }, [reminderSettings.enabled, reminderSettings.startTime, reminderSettings.endTime]);

  useEffect(() => {
    if (water > 0) celebrate();
  }, [water]);

  const checkIfSleepTime = () => {
    const now = new Date();
    const start = new Date(reminderSettings.startTime);
    const end = new Date(reminderSettings.endTime);
    start.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    end.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    setIsSleepTime(now < start || now > end);
  };

  const loadReminderSettings = async () => {
    try {
      setIsLoading(true);
      const saved = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setReminderSettings({
          enabled: parsed.enabled || false,
          interval: parsed.interval || "1h",
          startTime: new Date(parsed.startTime) || new Date(new Date().setHours(7, 0, 0, 0)),
          endTime: new Date(parsed.endTime) || new Date(new Date().setHours(21, 0, 0, 0)),
        });
      }
    } catch (err) {
      console.error("Error loading reminder settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveReminderSettings = async () => {
    try {
      await AsyncStorage.setItem(
        REMINDER_STORAGE_KEY,
        JSON.stringify({
          enabled: reminderSettings.enabled,
          interval: reminderSettings.interval,
          startTime: reminderSettings.startTime.toISOString(),
          endTime: reminderSettings.endTime.toISOString(),
        })
      );
    } catch (err) {
      console.error("Error saving reminder settings:", err);
    }
  };

  const toggleReminders = async (value: boolean) => {
    setReminderSettings((prev) => ({ ...prev, enabled: value }));
    if (value) {
      if (isExpoGo()) {
        setToast("Reminders require a development build");
        setTimeout(() => setToast(""), 2000);
        setReminderSettings((prev) => ({ ...prev, enabled: false }));
        return;
      }
      await scheduleReminder(reminderSettings.interval);
    } else {
      await cancelHydrationReminder();
      setToast("Reminders turned off");
      setTimeout(() => setToast(""), 2000);
    }
  };

  const handleIntervalSelect = async (interval: string) => {
    setReminderSettings((prev) => ({ ...prev, interval }));
    if (reminderSettings.enabled) await scheduleReminder(interval);
  };

  const onTimeChange = async (
    type: "start" | "end",
    event: any,
    selectedDate?: Date
  ) => {
    if (type === "start" && selectedDate) {
      setReminderSettings((prev) => ({ ...prev, startTime: selectedDate }));
    } else if (type === "end" && selectedDate) {
      setReminderSettings((prev) => ({ ...prev, endTime: selectedDate }));
    }
    if (reminderSettings.enabled) await scheduleReminder(reminderSettings.interval);
  };

  const celebrate = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.08, duration: 250, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const handleAddWater = (ml: number) => {
    addWater(ml, "manual");
    try {
      const now = new Date();
      addEvent({
        event_type: "water",
        value: ml,
        wallTime: now.toTimeString().slice(0, 5),
        displayLabel: `Water · ${ml} mL`,
        displayIcon: "💧",
      });
    } catch (err) {
      console.error("BioGears Hydration Sync Error:", err);
    }
    setToast(`+${ml}ml added ✓`);
    setTimeout(() => setToast(""), 1500);
  };

  const handleReset = () => {
    Alert.alert(
      "Reset Hydration",
      "Are you sure you want to reset today's water intake and history?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            reset();
            setToast("Reset complete ✓");
            setTimeout(() => setToast(""), 2000);
          },
        },
      ]
    );
  };

  ///////////////////////////////////////////////////////////
  // RENDER
  ///////////////////////////////////////////////////////////
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Hydration
        </Text>
        <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
          <Ionicons name="refresh" size={22} color={colors.sub} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.container}>

        {/* ── WATER DISPLAY CARD ── */}
        {/* ✅ Daily goal, progress bar and goal text removed */}
        <Animated.View style={[styles.waterCard, { transform: [{ scale: pulseAnim }] }]}>
          <View style={[styles.waterContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.waterIconContainer}>
              <Text style={styles.waterIcon}>💧</Text>
            </View>
            <View style={styles.waterInfo}>
              <Text style={[styles.waterLabel, { color: colors.sub }]}>
                Water drunk today
              </Text>
              <Text style={[styles.waterAmount, { color: colors.accent }]}>
                {water} ml
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── QUICK ADD BUTTONS ── */}
        <View style={styles.grid}>
          {QUICK_ADD_BUTTONS.map(({ ml, icon, label }) => (
            <TouchableOpacity
              key={ml}
              style={[styles.btn, { backgroundColor: colors.card }]}
              onPress={() => handleAddWater(ml)}
            >
              <Text style={styles.btnIcon}>{icon}</Text>
              <Text style={[styles.btnText, { color: colors.text }]}>
                +{label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── REMINDER SETTINGS ── */}
        <View style={[styles.module, { backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <View style={styles.moduleHeader}>
              <Ionicons name="notifications-outline" size={20} color={colors.accent} />
              <Text style={[styles.moduleTitle, { color: colors.text }]}>Reminders</Text>
            </View>
            <Switch
              value={reminderSettings.enabled}
              onValueChange={toggleReminders}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={Platform.OS === "ios" ? undefined : colors.card}
            />
          </View>

          {reminderSettings.enabled && (
            <View style={styles.reminderDetails}>

              {/* Interval */}
              <View style={styles.intervalSection}>
                <Text style={[styles.sectionLabel, { color: colors.sub }]}>
                  Remind me every
                </Text>
                <View style={styles.intervalRow}>
                  {["30m", "1h", "2h"].map((interval) => (
                    <TouchableOpacity
                      key={interval}
                      style={[
                        styles.intervalBtn,
                        {
                          backgroundColor:
                            reminderSettings.interval === interval
                              ? colors.accent
                              : colors.border,
                        },
                      ]}
                      onPress={() => handleIntervalSelect(interval)}
                    >
                      <Text
                        style={{
                          color: reminderSettings.interval === interval ? "#fff" : colors.text,
                          fontWeight: reminderSettings.interval === interval ? "bold" : "normal",
                          fontSize: 16,
                        }}
                      >
                        {interval}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Time range */}
              <View style={styles.timeRangeSection}>
                <Text style={[styles.sectionLabel, { color: colors.sub }]}>Between</Text>
                <View style={styles.timeRow}>
                  <TimePicker
                    value={`${reminderSettings.startTime.getHours()}:${reminderSettings.startTime.getMinutes()}`}
                    onChange={(t) => {
                      const [h, m] = t.split(':');
                      const d = new Date(reminderSettings.startTime);
                      d.setHours(parseInt(h, 10), parseInt(m, 10));
                      onTimeChange("start", null, d);
                    }}
                    accent={colors.accent}
                  />

                  <Text style={[styles.timeSeparator, { color: colors.sub }]}>and</Text>

                  <TimePicker
                    value={`${reminderSettings.endTime.getHours()}:${reminderSettings.endTime.getMinutes()}`}
                    onChange={(t) => {
                      const [h, m] = t.split(':');
                      const d = new Date(reminderSettings.endTime);
                      d.setHours(parseInt(h, 10), parseInt(m, 10));
                      onTimeChange("end", null, d);
                    }}
                    accent={colors.accent}
                  />
                </View>

                {isSleepTime && (
                  <View style={[styles.sleepNotice, { backgroundColor: colors.danger + "20" }]}>
                    <Ionicons name="moon" size={16} color={colors.danger} />
                    <Text style={[styles.sleepNoticeText, { color: colors.danger }]}>
                      Outside selected hours — notifications paused
                    </Text>
                  </View>
                )}
              </View>

              {/* Status */}
              <View style={[styles.statusCard, { backgroundColor: colors.border }]}>
                <Ionicons
                  name={reminderSettings.enabled ? "notifications" : "notifications-off"}
                  size={16}
                  color={reminderSettings.enabled ? colors.success : colors.sub}
                />
                <Text style={[styles.statusText, { color: colors.sub }]}>
                  {reminderSettings.enabled
                    ? `Notifications every ${reminderSettings.interval} · tap 100ml, 150ml or 200ml to log`
                    : "Enable reminders to get notified to drink water"}
                </Text>
              </View>
            </View>
          )}
        </View>



        {/* ── SYNC STATUS ── */}
        <View style={[styles.syncStatus, { backgroundColor: colors.card }]}>
          <Ionicons name="sync" size={20} color={colors.accent} />
          <Text style={[styles.syncText, { color: colors.sub }]}>
            Auto-syncs with Home screen
          </Text>
        </View>

        {/* ── HYDRATION HISTORY ── */}
        <View style={[styles.historySection, { backgroundColor: colors.card }]}>

          <View style={styles.historyHeader}>
            <View style={styles.moduleHeader}>
              <Ionicons name="time-outline" size={20} color={colors.accent} />
              <Text style={[styles.moduleTitle, { color: colors.text }]}>
                Today's History
              </Text>
            </View>
            <Text style={[styles.historyCount, { color: colors.sub }]}>
              {history.length} {history.length === 1 ? "entry" : "entries"}
            </Text>
          </View>

          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyIcon}>💧</Text>
              <Text style={[styles.emptyText, { color: colors.sub }]}>
                No water logged yet today.{"\n"}Tap a button above to get started!
              </Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {history.map((entry: HydrationEntry, index: number) => (
                <View key={entry.id}>
                  <View style={styles.historyRow}>

                    {/* Timeline */}
                    <View style={styles.timelineColumn}>
                      <View
                        style={[
                          styles.timelineDot,
                          {
                            backgroundColor:
                              entry.source === "notification"
                                ? colors.warning
                                : colors.accent,
                          },
                        ]}
                      />
                      {index < history.length - 1 && (
                        <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />
                      )}
                    </View>

                    {/* Entry card */}
                    <View style={[styles.historyEntry, { backgroundColor: colors.historyBg }]}>
                      <View style={styles.historyEntryLeft}>
                        <Text style={styles.historyEntryIcon}>
                          {entry.source === "notification" ? "🔔" : "💧"}
                        </Text>
                        <View>
                          <Text style={[styles.historyAmount, { color: colors.text }]}>
                            +{entry.amount} ml
                          </Text>
                          <Text style={[styles.historySource, { color: colors.sub }]}>
                            {entry.source === "notification" ? "From notification" : "Manual"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.historyEntryRight}>
                        <Text style={[styles.historyTime, { color: colors.accent }]}>
                          {formatTime(entry.timestamp)}
                        </Text>
                        <Text style={[styles.historyRelative, { color: colors.sub }]}>
                          {formatRelativeTime(entry.timestamp)}
                        </Text>
                        <Text style={[styles.historyTotal, { color: colors.sub }]}>
                          Total: {entry.total} ml
                        </Text>
                      </View>
                    </View>

                  </View>
                </View>
              ))}

              {/* Summary row */}
              <View
                style={[
                  styles.historySummary,
                  { backgroundColor: colors.accent + "15", borderColor: colors.accent + "40" },
                ]}
              >
                <Ionicons name="analytics" size={16} color={colors.accent} />
                <Text style={[styles.summaryStat, { color: colors.text }]}>
                  <Text style={{ color: colors.accent, fontWeight: "bold" }}>{water} ml</Text>
                  {" "}total ·{" "}
                  <Text style={{ color: colors.accent, fontWeight: "bold" }}>{history.length}</Text>
                  {" "}intakes ·{" "}
                  <Text style={{ color: colors.accent, fontWeight: "bold" }}>
                    {history.filter((e: HydrationEntry) => e.source === "notification").length}
                  </Text>
                  {" "}from notifications
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Toast */}
        {toast !== "" && (
          <View style={[styles.toast, { backgroundColor: colors.accent }]}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

///////////////////////////////////////////////////////////
// STYLES
///////////////////////////////////////////////////////////
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  headerTitle: { fontSize: 20, fontWeight: "bold", flex: 1 },

  resetButton: { padding: 8 },

  container: { paddingBottom: 80, alignItems: "center" },

  // ── Water card ──
  waterCard: { width: "90%", marginVertical: 20 },

  waterContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  waterIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(14, 165, 233, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },

  waterIcon: { fontSize: 32 },
  waterInfo: { flex: 1 },

  waterLabel: { fontSize: 14, fontWeight: "500", marginBottom: 4 },

  waterAmount: { fontSize: 40, fontWeight: "bold" },

  // ── Grid ──
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
    width: "90%",
  },

  btn: {
    width: "30%",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  btnIcon: { fontSize: 22 },
  btnText: { fontWeight: "bold", marginTop: 6, fontSize: 14 },

  // ── Module ──
  module: { width: "90%", marginTop: 20, padding: 16, borderRadius: 18 },

  moduleHeader: { flexDirection: "row", alignItems: "center", gap: 8 },

  moduleTitle: { fontWeight: "bold", fontSize: 16 },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  reminderDetails: { marginTop: 16, gap: 16 },

  intervalSection: { gap: 8 },

  sectionLabel: { fontSize: 14, fontWeight: "500", marginBottom: 4 },

  intervalRow: { flexDirection: "row", justifyContent: "space-around", gap: 8 },

  intervalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },

  timeRangeSection: { gap: 8 },

  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  timeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },

  timeText: { fontSize: 14, fontWeight: "500" },
  timeSeparator: { fontSize: 14, fontWeight: "500" },

  sleepNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },

  sleepNoticeText: { fontSize: 13, flex: 1 },

  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },

  statusText: { flex: 1, fontSize: 12 },

  syncStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    padding: 12,
    borderRadius: 20,
    gap: 8,
  },

  syncText: { fontSize: 14 },

  // ── History ──
  historySection: {
    width: "90%",
    marginTop: 24,
    marginBottom: 8,
    padding: 16,
    borderRadius: 20,
  },

  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  historyCount: { fontSize: 13 },

  emptyHistory: { alignItems: "center", paddingVertical: 28, gap: 10 },

  emptyIcon: { fontSize: 36 },

  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 22 },

  historyList: { gap: 4 },

  historyRow: { flexDirection: "row", gap: 12, minHeight: 80 },

  timelineColumn: { alignItems: "center", width: 16, paddingTop: 8 },

  timelineDot: { width: 10, height: 10, borderRadius: 5 },

  timelineLine: { width: 2, flex: 1, marginTop: 4 },

  historyEntry: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },

  historyEntryLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },

  historyEntryIcon: { fontSize: 22 },

  historyAmount: { fontSize: 16, fontWeight: "bold" },

  historySource: { fontSize: 12, marginTop: 2 },

  historyEntryRight: { alignItems: "flex-end" },

  historyTime: { fontSize: 14, fontWeight: "600" },

  historyRelative: { fontSize: 11, marginTop: 2 },

  historyTotal: { fontSize: 11, marginTop: 2 },

  historySummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },

  summaryStat: { fontSize: 13, flex: 1, lineHeight: 20 },

  toast: {
    position: "absolute",
    bottom: 30,
    padding: 12,
    borderRadius: 20,
    alignSelf: "center",
  },

  toastText: { color: "#fff", fontWeight: "bold" },
});