import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";
import TimePicker from "../components/twin/TimePicker";
import { scheduleDailyLogReminder } from "../services/notifeeService";

export default function Notifications() {
  const { theme } = useTheme();

  const colors = globalColors[theme];

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    meds: true,
    alerts: true,
    steps: true,
    hydration: true,
    reports: true,
    twinReminder: true,
  });
  const [twinReminderTime, setTwinReminderTime] = useState("22:00");

  useEffect(() => {
    async function loadSettings() {
      try {
        const medsRaw = await AsyncStorage.getItem("@meds_reminder_enabled");
        const alertsRaw = await AsyncStorage.getItem("@alerts_reminder_enabled");
        const stepsRaw = await AsyncStorage.getItem("@steps_reminder_enabled");
        const hydrationRaw = await AsyncStorage.getItem("@hydration_reminder_enabled");
        const reportsRaw = await AsyncStorage.getItem("@reports_reminder_enabled");
        const twinRaw = await AsyncStorage.getItem("@twin_reminder_enabled");
        const twinTimeRaw = await AsyncStorage.getItem("@twin_reminder_time");

        setSettings({
          meds: medsRaw === null ? true : medsRaw === "true",
          alerts: alertsRaw === null ? true : alertsRaw === "true",
          steps: stepsRaw === null ? true : stepsRaw === "true",
          hydration: hydrationRaw === null ? true : hydrationRaw === "true",
          reports: reportsRaw === null ? true : reportsRaw === "true",
          twinReminder: twinRaw === null ? true : twinRaw === "true",
        });

        if (twinTimeRaw) {
          setTwinReminderTime(twinTimeRaw);
        }
      } catch (err) {
        console.warn("Failed to load notification settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const toggle = async (key: keyof typeof settings) => {
    const nextVal = !settings[key];
    setSettings(prev => ({
      ...prev,
      [key]: nextVal,
    }));

    try {
      if (key === "meds") await AsyncStorage.setItem("@meds_reminder_enabled", String(nextVal));
      if (key === "alerts") await AsyncStorage.setItem("@alerts_reminder_enabled", String(nextVal));
      if (key === "steps") await AsyncStorage.setItem("@steps_reminder_enabled", String(nextVal));
      if (key === "hydration") await AsyncStorage.setItem("@hydration_reminder_enabled", String(nextVal));
      if (key === "reports") await AsyncStorage.setItem("@reports_reminder_enabled", String(nextVal));
      if (key === "twinReminder") {
        await AsyncStorage.setItem("@twin_reminder_enabled", String(nextVal));
        await scheduleDailyLogReminder();
      }
    } catch (err) {
      console.warn("Failed to save notification settings:", err);
    }
  };

  const handleTimeChange = async (newTime: string) => {
    setTwinReminderTime(newTime);
    try {
      await AsyncStorage.setItem("@twin_reminder_time", newTime);
      await scheduleDailyLogReminder();
    } catch (err) {
      console.warn("Failed to save reminder time:", err);
    }
  };

  const Row = ({
    label,
    value,
    onToggle,
  }: any) => (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: colors.text },
        ]}
      >
        {label}
      </Text>

      <Switch value={value} onValueChange={onToggle} />
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bg },
      ]}
    >
      <Header />

      <View style={styles.content}>
        <Row
          label="Medication Reminders"
          value={settings.meds}
          onToggle={() => toggle("meds")}
        />

        <Row
          label="Critical Alerts"
          value={settings.alerts}
          onToggle={() => toggle("alerts")}
        />

        <Row
          label="Step Goal"
          value={settings.steps}
          onToggle={() => toggle("steps")}
        />

        <Row
          label="Hydration"
          value={settings.hydration}
          onToggle={() => toggle("hydration")}
        />

        <Row
          label="Weekly Reports"
          value={settings.reports}
          onToggle={() => toggle("reports")}
        />

        <View style={[styles.mergedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.mergedHeader}>
            <Text style={[styles.text, { color: colors.text }]}>Daily Twin Sync Reminder</Text>
            <Switch value={settings.twinReminder} onValueChange={() => toggle("twinReminder")} />
          </View>
          {settings.twinReminder && (
            <>
              <View style={[styles.mergedDivider, { backgroundColor: colors.border }]} />
              <View style={styles.mergedBody}>
                <Text style={[styles.timeLabel, { color: colors.text }]}>Reminder Time</Text>
                <TimePicker value={twinReminderTime} onChange={handleTimeChange} accent="#0ea5e9" />
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    paddingTop: 110,
    padding: 16,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },

  timeLabel: {
    fontSize: 15,
    fontWeight: "500",
  },

  text: {
    fontSize: 15,
    fontWeight: "500",
  },

  mergedCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },

  mergedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },

  mergedDivider: {
    height: 1,
    width: "100%",
  },

  mergedBody: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
