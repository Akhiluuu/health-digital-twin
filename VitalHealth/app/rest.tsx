// app/rest.tsx

import React, { useEffect, useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../context/ThemeContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";

const STORAGE_KEY = "vt_rest_reminders";

type Alarm = {
  enabled: boolean;
  time: string;
};

export default function RestScreen() {
  const router = useRouter();
  const { theme } = useTheme();
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
        }
      : {
          bg: "#020617",
          card: "#0b1220",
          text: "#ffffff",
          sub: "#94a3b8",
          border: "#1e293b",
          accent: "#38bdf8",
        };

  const [sleepAlarm, setSleepAlarm] = useState<Alarm>({
    enabled: false,
    time: "10:30 PM",
  });

  const [wakeAlarm, setWakeAlarm] = useState<Alarm>({
    enabled: false,
    time: "06:30 AM",
  });

  const [duration, setDuration] = useState("7.5");
  const [quality, setQuality] = useState(2);

  const [modalType, setModalType] = useState<"sleep" | "wake" | null>(null);
  const [tempTime, setTempTime] = useState("10:30 PM");
  const [tempEnabled, setTempEnabled] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const data = JSON.parse(saved);
    setSleepAlarm(data.sleep);
    setWakeAlarm(data.wake);
  };

  const saveData = async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sleep: sleepAlarm,
        wake: wakeAlarm,
      })
    );
  };

  useEffect(() => {
    saveData();
  }, [sleepAlarm, wakeAlarm]);

  const openModal = (type: "sleep" | "wake") => {
    const alarm = type === "sleep" ? sleepAlarm : wakeAlarm;

    setTempTime(alarm.time);
    setTempEnabled(alarm.enabled);
    setModalType(type);
  };

  const confirmCalibration = () => {
    if (!modalType) return;

    const alarm = {
      enabled: tempEnabled,
      time: tempTime,
    };

    modalType === "sleep"
      ? setSleepAlarm(alarm)
      : setWakeAlarm(alarm);

    setModalType(null);
  };

  const logSleep = () => {
    const hrs = parseFloat(duration);

    if (!hrs || hrs <= 0 || hrs > 14) {
      Alert.alert("Invalid Duration", "Please enter a valid sleep duration (0.5 – 14 hours).");
      return;
    }

    try {
      // wallTime = estimated sleep start (now minus sleep duration)
      // This places the sleep event at the correct physiological timestamp
      // so BioGears models HR drop and glucose reset at the right time.
      const sleepStartMs = Date.now() - hrs * 3600 * 1000;
      const sleepStart   = new Date(sleepStartMs);
      const pad = (n: number) => String(n).padStart(2, "0");
      const wallTime = `${pad(sleepStart.getHours())}:${pad(sleepStart.getMinutes())}`;

      // BioGears SleepData: value = hours of sleep. No duration_seconds needed.
      addEvent({
        event_type: "sleep",
        value: hrs,
        wallTime,
        displayLabel: `Sleep · ${hrs}h`,
        displayIcon: "😴",
      });

      Alert.alert("✅ Sleep Logged", `${hrs}h sleep synced with BioGears Digital Twin.`);
    } catch (error) {
      console.error("BioGears Sleep Sync Error:", error);
      Alert.alert("Sync Error", "Failed to sync sleep session with BioGears.");
    }
  };

  const qualityIcons = ["😴", "🥱", "😊", "🤩"];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          REST RECORD
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ALARM GRID */}
        <View style={styles.grid}>
          <AlarmCard
            icon="🌙"
            label="Rest Signal"
            alarm={sleepAlarm}
            color="#7c3aed"
            onPress={() => openModal("sleep")}
            colors={colors}
          />

          <AlarmCard
            icon="🌅"
            label="Wake Signal"
            alarm={wakeAlarm}
            color="#f59e0b"
            onPress={() => openModal("wake")}
            colors={colors}
          />
        </View>

        {/* PANEL */}
        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={{ color: colors.sub }}>Duration</Text>

          <View style={styles.durationRow}>
            <TextInput
              value={duration}
              onChangeText={setDuration}
              keyboardType="numeric"
              style={[
                styles.durationInput,
                { color: colors.text },
              ]}
            />
            <Text style={{ color: colors.accent, fontSize: 24 }}>h</Text>
          </View>

          <Text style={{ color: colors.sub, marginTop: 10 }}>
            Signal Quality
          </Text>

          <View style={styles.qualityRow}>
            {qualityIcons.map((icon, i) => (
              <TouchableOpacity key={i} onPress={() => setQuality(i)}>
                <Text
                  style={[
                    styles.qualityIcon,
                    quality === i && styles.qualityActive,
                  ]}
                >
                  {icon}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.logBtn}
            onPress={logSleep}
          >
            <Text style={styles.logText}>LOG SESSION DATA</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* MODAL */}
      <Modal visible={!!modalType} animationType="slide">
        <View style={[styles.modal, { backgroundColor: colors.bg }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            Circadian Calibration
          </Text>

          <TextInput
            value={tempTime}
            onChangeText={setTempTime}
            style={[
              styles.timeInput,
              {
                backgroundColor: colors.card,
                color: colors.text,
              },
            ]}
          />

          <TouchableOpacity
            style={[styles.toggle, { backgroundColor: colors.accent }]}
            onPress={() => setTempEnabled(!tempEnabled)}
          >
            <Text style={{ color: "#fff" }}>
              {tempEnabled ? "ACTIVE" : "OFF"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.confirmBtn}
            onPress={confirmCalibration}
          >
            <Text style={styles.confirmText}>
              CONFIRM CALIBRATION
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setModalType(null)}>
            <Text style={[styles.cancel, { color: colors.sub }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function AlarmCard({
  icon,
  label,
  alarm,
  color,
  onPress,
  colors,
}: any) {
  return (
    <TouchableOpacity
      style={[
        styles.alarmCard,
        {
          backgroundColor: colors.card,
          borderColor: alarm.enabled ? color : colors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text style={{ fontSize: 32 }}>{icon}</Text>

      <Text style={{ color: colors.sub, marginTop: 8 }}>
        {label}
      </Text>

      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
        {alarm.time}
      </Text>

      <Text
        style={{
          color: alarm.enabled ? "#22c55e" : colors.sub,
        }}
      >
        {alarm.enabled ? "ACTIVE" : "OFF"}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginLeft: 16,
  },

  scroll: { padding: 16 },

  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  alarmCard: {
    width: "48%",
    padding: 18,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
  },

  panel: {
    borderRadius: 30,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
  },

  durationRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  durationInput: {
    fontSize: 50,
    fontWeight: "900",
  },

  qualityRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginVertical: 16,
  },

  qualityIcon: {
    fontSize: 34,
    opacity: 0.3,
  },

  qualityActive: {
    opacity: 1,
    transform: [{ scale: 1.3 }],
  },

  logBtn: {
    backgroundColor: "#6366f1",
    padding: 16,
    borderRadius: 30,
    alignItems: "center",
  },

  logText: {
    color: "#fff",
    fontWeight: "900",
  },

  modal: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },

  modalTitle: {
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },

  timeInput: {
    padding: 16,
    borderRadius: 20,
    marginVertical: 20,
    textAlign: "center",
  },

  toggle: {
    padding: 14,
    borderRadius: 20,
    alignItems: "center",
  },

  confirmBtn: {
    backgroundColor: "#22c55e",
    padding: 16,
    borderRadius: 24,
    marginTop: 20,
    alignItems: "center",
  },

  confirmText: {
    color: "#fff",
    fontWeight: "900",
  },

  cancel: {
    textAlign: "center",
    marginTop: 20,
  },
});