// app/AddMedicine.tsx
// ADD MEDICINE — Professional UI with Regular & One-time Schedule Types

import React, { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch, 
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";

import { useMedicine } from "../context/MedicineContext";
import { log, error } from "../utils/logger"; import { addToMedicineHistory } from "../utils/medicineHistory";
import { useTheme } from "./../context/ThemeContext";
import { colors } from "./../theme/colors";

export default function AddMedicine() {
  const router = useRouter();
  const { addMedicine } = useMedicine();

  const { theme } = useTheme();
  const c = colors[theme];

  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [schedule, setSchedule] = useState<"regular" | "once">("regular");
  const [reminder, setReminder] = useState(true);
  const [meal, setMeal] = useState<"before" | "after">("before");

  const [time, setTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const formatted = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const save = async () => {
    if (saving) return; // 🚫 prevent multiple clicks
    
    if (!name.trim()) {
      Alert.alert("Missing Information", "Please enter medicine name");
      return;
    }

    if (!dose.trim()) {
      Alert.alert("Missing Information", "Please enter dosage");
      return;
    }

    try {
      setSaving(true);
      
      /////////////////////////////////////////////////
      // BUILD TIMESTAMP FROM SELECTED TIME
      /////////////////////////////////////////////////

      const now = new Date();

      const selectedDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        time.getHours(),
        time.getMinutes(),
        0,
        0
      );

      const timestamp = selectedDate.getTime();

      /////////////////////////////////////////////////
      // DERIVED DATABASE FIELDS
      /////////////////////////////////////////////////

      const type = "tablet"; // default (future: dropdown)
      const frequency = schedule === "regular" ? "daily" : "once";

      const startDate = now.toISOString();

      const endDate =
        schedule === "once"
          ? selectedDate.toISOString()
          : "ongoing";

      /////////////////////////////////////////////////
      // SAVE INTO DATABASE VIA CONTEXT
      /////////////////////////////////////////////////

      log("Adding medicine:", name.trim(), frequency);

      await addMedicine(
        name.trim(),
        dose.trim(),
        type,
        formatted,
        timestamp,
        meal,
        frequency,
        startDate,
        endDate,
        reminder ? 1 : 0
      );

      log("Medicine added successfully");

      /////////////////////////////////////////////////
      // ADD TO MEDICINE HISTORY
      /////////////////////////////////////////////////

      await addToMedicineHistory({
        medicineId: Date.now(),
        medicineName: name.trim(),
        dose: dose.trim(),
        time: formatted,
        status: "taken"
      });

      /////////////////////////////////////////////////
      // SUCCESS MESSAGE
      /////////////////////////////////////////////////

      const scheduleText =
        schedule === "regular" ? "daily" : "one-time";

      Alert.alert(
        "Success",
        `${name.trim()} has been added as a ${scheduleText} medicine`,
        [{ text: "OK", onPress: () => router.back() }]
      );

    } catch (err) {
      error("Save error:", err as Error);
      Alert.alert("Error", "Failed to save medicine");
    } finally {
      setSaving(false); // ✅ reset loading
    }
  };

  ///////////////////////////////////////////////////////////

  const getScheduleDescription = () => {
    return schedule === "regular"
      ? "You'll be reminded every day at this time"
      : "You'll be reminded once today at this time";
  };

  const testReminder = () => {
    Alert.alert(
      "Reminder Preview",
      "Time to take your medicine"
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color={c.text} />
          <Text style={[styles.backText, { color: c.text }]}>
            Back
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: c.text }]}>
          New Medication
        </Text>

        {/* NAME */}
        <Text style={[styles.label, { color: c.sub }]}>
          MEDICINE IDENTITY
        </Text>

        <TextInput
          placeholder="e.g. Paracetamol"
          placeholderTextColor={c.sub}
          style={[
            styles.input,
            { backgroundColor: c.card, color: c.text },
          ]}
          value={name}
          onChangeText={setName}
        />

        {/* DOSE */}
        <Text style={[styles.label, { color: c.sub }]}>
          DOSAGE CONFIG
        </Text>

        <TextInput
          placeholder="e.g. 500mg or 10ml"
          placeholderTextColor={c.sub}
          style={[
            styles.input,
            { backgroundColor: c.card, color: c.text },
          ]}
          value={dose}
          onChangeText={setDose}
        />

        {/* SCHEDULE TYPE */}
        <Text style={[styles.label, { color: c.sub }]}>
          SCHEDULE TYPE
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.scheduleCard,
              { backgroundColor: c.card },
              schedule === "regular" && {
                borderColor: c.accent,
                borderWidth: 2,
              },
            ]}
            onPress={() => setSchedule("regular")}
          >
            <Ionicons name="repeat" size={26} color={c.accent} />
            <Text style={[styles.cardTitle, { color: c.accent }]}>
              REGULAR
            </Text>
            <Text style={[styles.cardSub, { color: c.sub }]}>
              EVERYDAY REMINDER
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scheduleCard,
              { backgroundColor: c.card },
              schedule === "once" && {
                borderColor: "#f472b6",
                borderWidth: 2,
              },
            ]}
            onPress={() => setSchedule("once")}
          >
            <Ionicons name="timer-outline" size={26} color="#f472b6" />
            <Text style={[styles.cardTitle, { color: "#f472b6" }]}>
              ONE TIME
            </Text>
            <Text style={[styles.cardSub, { color: c.sub }]}>
              SINGLE DOSE ONLY
            </Text>
          </TouchableOpacity>
        </View>

        {/* Schedule Info Note */}
        <View style={[styles.scheduleNote, { backgroundColor: schedule === "regular" ? c.accent + '20' : '#f472b620' }]}>
          <Ionicons 
            name={schedule === "regular" ? "repeat" : "timer-outline"} 
            size={16} 
            color={schedule === "regular" ? c.accent : "#f472b6"} 
          />
          <Text style={[styles.scheduleNoteText, { color: c.sub }]}>
            {getScheduleDescription()}
          </Text>
        </View>

        {/* REMINDER CARD */}
        <View style={[styles.reminderContainer, { backgroundColor: c.card }]}>
          {/* Reminder Header with Switch */}
          <View style={styles.reminderHeader}>
            <View>
              <Text style={[styles.remTitle, { color: c.text }]}>
                Voice Reminders
              </Text>
              <Text style={[styles.remSub, { color: c.sub }]}>
                Get voice notification: "Time to take your medicine"
              </Text>
            </View>

            <Switch
              value={reminder}
              onValueChange={setReminder}
              trackColor={{ false: c.border, true: c.accent }}
              thumbColor="#fff"
            />
          </View>

          {/* Test Voice Button */}
          {reminder && (
            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: c.bg }]}
              onPress={testReminder}
            >
              <Ionicons name="volume-high" size={18} color={c.accent} />
              <Text style={[styles.testButtonText, { color: c.accent }]}>
                Test Voice Reminder
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* TIME */}
        <Text style={[styles.label, { color: c.sub }]}>
          REMINDER TIME
        </Text>

        <TouchableOpacity
          style={[
            styles.timePanel,
            { backgroundColor: c.card },
          ]}
          onPress={() => setShowPicker(true)}
        >
          <View
            style={[
              styles.timeBox,
              { borderColor: c.border },
            ]}
          >
            <Text
              style={[
                styles.timeText,
                { color: c.accent },
              ]}
            >
              {formatted}
            </Text>
          </View>
          <Text style={[styles.timeHint, { color: c.sub }]}>
            Tap to change time
          </Text>
        </TouchableOpacity>

        {showPicker && (
          <DateTimePicker
            value={time}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={(e, selected) => {
              setShowPicker(false);
              if (selected) setTime(selected);
            }}
          />
        )}

        {/* MEAL TIMING */}
        <Text style={[styles.label, { color: c.sub }]}>
          MEAL TIMING
        </Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.mealBtn,
              { backgroundColor: c.card },
              meal === "before" && {
                backgroundColor: c.accent,
              },
            ]}
            onPress={() => setMeal("before")}
          >
            <Text style={[
              styles.mealText, 
              { color: meal === "before" ? "#fff" : c.text }
            ]}>
              BEFORE FOOD
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.mealBtn,
              { backgroundColor: c.card },
              meal === "after" && {
                backgroundColor: c.accent,
              },
            ]}
            onPress={() => setMeal("after")}
          >
            <Text style={[
              styles.mealText, 
              { color: meal === "after" ? "#fff" : c.text }
            ]}>
              AFTER FOOD
            </Text>
          </TouchableOpacity>
        </View>

        {/* INFO NOTE */}
        <View style={[styles.infoNote, { backgroundColor: c.accent + '20' }]}>
          <Ionicons name="information-circle" size={20} color={c.accent} />
          <Text style={[styles.infoText, { color: c.sub }]}>
            {schedule === "regular" 
              ? `Daily reminder at ${formatted}`
              : `One-time reminder today at ${formatted}`
            }
            {!reminder && " (reminders are disabled)"}
          </Text>
        </View>

        <View style={{ height: 180 }} />
      </ScrollView>

      {/* BOTTOM PANEL */}
      <View
        style={[
          styles.bottomPanel,
          {
            backgroundColor: c.bg,
            borderColor: c.border,
          },
        ]}
      >
        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={[styles.discard, { color: c.sub }]}>
              DISCARD
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              {
                backgroundColor: saving ? "#999" : c.accent,
                opacity: saving ? 0.7 : 1,
              },
            ]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <Text style={styles.saveText}>SAVING...</Text>
            ) : (
              <Text style={styles.saveText}>SAVE</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

///////////////////////////////////////////////////////////

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },

  header: { paddingHorizontal: 15, marginBottom: 10 },

  backRow: { flexDirection: "row", alignItems: "center", gap: 4 },

  backText: { fontSize: 16 },

  title: {
    fontSize: 32,
    fontWeight: "700",
    paddingHorizontal: 20,
  },

  label: {
    letterSpacing: 3,
    fontSize: 12,
    marginTop: 30,
    marginBottom: 12,
    paddingHorizontal: 20,
  },

  input: {
    borderRadius: 40,
    padding: 20,
    marginHorizontal: 20,
  },

  row: { flexDirection: "row", gap: 14, paddingHorizontal: 20 },

  scheduleCard: {
    flex: 1,
    padding: 24,
    borderRadius: 28,
    alignItems: "center",
  },

  cardTitle: { marginTop: 10, fontWeight: "700" },
  cardSub: { fontSize: 12, marginTop: 4 },

  scheduleNote: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    gap: 8,
  },

  scheduleNoteText: {
    flex: 1,
    fontSize: 12,
  },

  reminderContainer: {
    marginTop: 30,
    marginHorizontal: 20,
    borderRadius: 30,
    overflow: 'hidden',
  },

  reminderHeader: {
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  remTitle: { 
    fontWeight: "600", 
    fontSize: 16,
    marginBottom: 4,
  },
  
  remSub: { 
    fontSize: 12,
    maxWidth: "80%",
  },

  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 25,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },

  testButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },

  timePanel: {
    marginHorizontal: 20,
    marginTop: 15,
    borderRadius: 30,
    padding: 30,
    alignItems: "center",
  },

  timeBox: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },

  timeText: { fontSize: 28, fontWeight: "700" },

  timeHint: {
    marginTop: 8,
    fontSize: 12,
  },

  mealBtn: {
    flex: 1,
    padding: 20,
    borderRadius: 24,
    alignItems: "center",
    marginTop: 25,
  },

  mealText: { fontWeight: "600" },

  infoNote: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  infoText: {
    flex: 1,
    fontSize: 12,
  },

  bottomPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    borderTopWidth: 1,
  },

  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  discard: { letterSpacing: 3 },

  saveBtn: {
    paddingHorizontal: 45,
    paddingVertical: 18,
    borderRadius: 40,
  },

  saveText: { color: "#fff", fontWeight: "700", letterSpacing: 3 },
});