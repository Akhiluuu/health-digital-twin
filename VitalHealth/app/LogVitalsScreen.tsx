// app/LogVitalsScreen.tsx
// Screen for logging and editing manual vitals entries.

import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useTheme } from "../context/ThemeContext";
import { colors } from "../theme/colors";
import { useFamily } from "../context/FamilyContext";
import DatePicker from "../components/twin/DatePicker";
import TimePicker from "../components/twin/TimePicker";
import {
  addVitalsRecord,
  updateVitalsRecord,
  deleteVitalsRecord,
  getVitalsRecordById,
  VitalsRecord,
} from "../database/vitalsDB";
import { log, error } from "../utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../services/firebase";
import { getUserId } from "../services/firebaseSync";

export default function LogVitalsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const recordId = params.id;

  const { theme } = useTheme();
  const c = colors[theme];
  const { activeMemberId, isSwitched } = useFamily();
  const memberOwnerId = isSwitched && activeMemberId ? activeMemberId : "self";

  // ─── STATE VARIABLES ───
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  const [heartRate, setHeartRate] = useState("");
  const [bpSystolic, setBpSystolic] = useState("");
  const [bpDiastolic, setBpDiastolic] = useState("");
  const [spo2, setSpo2] = useState("");
  const [temperature, setTemperature] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [weight, setWeight] = useState("");
  const [bloodGlucose, setBloodGlucose] = useState("");
  const [feeling, setFeeling] = useState<string>("");
  const [medicationTaken, setMedicationTaken] = useState<number | null>(null); // null = unselected, 1 = Yes, 0 = No
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [savedRecord, setSavedRecord] = useState<VitalsRecord | null>(null);

  // ─── LOAD RECORD IF EDIT MODE ───
  useEffect(() => {
    if (recordId) {
      loadExistingRecord(recordId);
    }
  }, [recordId]);

  const loadExistingRecord = async (id: string) => {
    try {
      setLoadingRecord(true);
      const rec = await getVitalsRecordById(id);
      if (rec) {
        setDate(rec.date);
        setTime(rec.time);
        setHeartRate(rec.heartRate !== null && rec.heartRate !== undefined ? String(rec.heartRate) : "");
        setBpSystolic(rec.bpSystolic !== null && rec.bpSystolic !== undefined ? String(rec.bpSystolic) : "");
        setBpDiastolic(rec.bpDiastolic !== null && rec.bpDiastolic !== undefined ? String(rec.bpDiastolic) : "");
        setSpo2(rec.spo2 !== null && rec.spo2 !== undefined ? String(rec.spo2) : "");
        setTemperature(rec.temperature !== null && rec.temperature !== undefined ? String(rec.temperature) : "");
        setRespiratoryRate(rec.respiratoryRate !== null && rec.respiratoryRate !== undefined ? String(rec.respiratoryRate) : "");
        setWeight(rec.weight !== null && rec.weight !== undefined ? String(rec.weight) : "");
        setBloodGlucose(rec.bloodGlucose !== null && rec.bloodGlucose !== undefined ? String(rec.bloodGlucose) : "");
        setFeeling(rec.feeling || "");
        setMedicationTaken(rec.medicationTaken ?? null);
        setNotes(rec.notes || "");
      } else {
        Alert.alert("Error", "Record not found.");
        router.back();
      }
    } catch (err) {
      error("Failed to load record:", err);
      Alert.alert("Error", "Failed to load record.");
    } finally {
      setLoadingRecord(false);
    }
  };

  // ─── FORMATTERS ON BLUR ───
  const formatTemperature = () => {
    if (temperature) {
      const parsed = parseFloat(temperature);
      if (!isNaN(parsed)) {
        setTemperature(parsed.toFixed(1));
      }
    }
  };

  const formatWeight = () => {
    if (weight) {
      const parsed = parseFloat(weight);
      if (!isNaN(parsed)) {
        setWeight(parsed.toFixed(1));
      }
    }
  };

  // ─── INPUT CLEANERS ───
  const handleWholeNumberChange = (val: string, setter: (v: string) => void) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setter(cleaned);
  };

  const handleDecimalChange = (val: string, setter: (v: string) => void) => {
    let cleaned = val.replace(/[^0-9.]/g, "");
    // Ensure only one decimal point and one decimal place
    if (/^\d*\.?\d{0,1}$/.test(cleaned)) {
      setter(cleaned);
    }
  };

  const handleNotesChange = (val: string) => {
    // Automatically remove leading spaces
    const cleaned = val.replace(/^\s+/g, "");
    if (cleaned.length <= 500) {
      setNotes(cleaned);
    }
  };

  // ─── CLINICAL RANGE WARNING CALCULATORS ───
  const getHeartRateWarning = (): string => {
    if (!heartRate) return "";
    const val = Number(heartRate);
    if (val < 30 || val > 220) return "This value appears outside the measurable range.";
    if (val < 60) return "Lower than the normal resting range.";
    if (val > 100) return "Higher than the normal resting range.";
    return "";
  };

  const getSpO2Warning = (): string => {
    if (!spo2) return "";
    const val = Number(spo2);
    if (val < 70 || val > 100) return "This value appears outside the measurable range.";
    if (val >= 91 && val <= 94) return "Slightly below the normal range.";
    if (val < 90) return "Low oxygen saturation.";
    return "";
  };

  const getSystolicWarning = (): string => {
    if (!bpSystolic) return "";
    const val = Number(bpSystolic);
    if (val < 60 || val > 250) return "This value appears outside the measurable range.";
    if (val > 180) return "Very high blood pressure.";
    if (val < 90) return "Lower than the normal range.";
    return "";
  };

  const getDiastolicWarning = (): string => {
    if (!bpDiastolic) return "";
    const val = Number(bpDiastolic);
    if (val < 40 || val > 150) return "This value appears outside the measurable range.";
    if (val > 120) return "Very high blood pressure.";
    return "";
  };

  const getTemperatureWarning = (): string => {
    if (!temperature) return "";
    const val = Number(temperature);
    if (val < 30 || val > 45) return "This value appears outside the measurable range.";
    if (val < 35) return "Low body temperature.";
    if (val > 38 && val <= 40) return "Fever detected.";
    if (val > 40) return "High fever.";
    return "";
  };

  const getRespiratoryRateWarning = (): string => {
    if (!respiratoryRate) return "";
    const val = Number(respiratoryRate);
    if (val < 5 || val > 60) return "This value appears outside the measurable range.";
    if (val < 10) return "Below normal range.";
    if (val > 24) return "Higher than normal.";
    return "";
  };

  const getWeightWarning = (): string => {
    if (!weight) return "";
    const val = Number(weight);
    if (val < 1 || val > 500) return "This value appears outside the measurable range.";
    return "";
  };

  const getBloodGlucoseWarning = (): string => {
    if (!bloodGlucose) return "";
    const val = Number(bloodGlucose);
    if (val < 10 || val > 1000) return "This value appears outside the measurable range.";
    if (val < 70) return "Low blood sugar.";
    if (val > 180) return "High blood sugar.";
    return "";
  };

  // ─── SAVE / EDIT ACTION ───
  const handleSave = async () => {
    if (saving) return;

    // Check if absolutely no values were entered
    const hasData =
      heartRate.trim() ||
      bpSystolic.trim() ||
      bpDiastolic.trim() ||
      spo2.trim() ||
      temperature.trim() ||
      respiratoryRate.trim() ||
      weight.trim() ||
      bloodGlucose.trim() ||
      feeling ||
      medicationTaken !== null ||
      notes.trim();

    if (!hasData) {
      Alert.alert("Empty Entry", "Please enter at least one health measurement.");
      return;
    }

    // Trigger haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      setSaving(true);

      const recordData = {
        date,
        time,
        heartRate: heartRate ? Number(heartRate) : null,
        bpSystolic: bpSystolic ? Number(bpSystolic) : null,
        bpDiastolic: bpDiastolic ? Number(bpDiastolic) : null,
        spo2: spo2 ? Number(spo2) : null,
        temperature: temperature ? Number(temperature) : null,
        respiratoryRate: respiratoryRate ? Number(respiratoryRate) : null,
        weight: weight ? Number(weight) : null,
        bloodGlucose: bloodGlucose ? Number(bloodGlucose) : null,
        feeling: feeling || null,
        medicationTaken,
        notes: notes.trim() || null,
      };

      // Sync vitals to Firebase and AsyncStorage for Live Telemetry Grid
      if (recordData.heartRate || recordData.spo2) {
        try {
          const uid = isSwitched && activeMemberId ? activeMemberId : await getUserId();
          if (uid) {
            const updates: any = { updatedAt: new Date().toISOString() };
            if (recordData.heartRate) {
              updates.heartRate = recordData.heartRate;
              updates.heartRateTimestamp = new Date().toISOString();
              await AsyncStorage.setItem(`latest_heartRate_${uid}`, JSON.stringify({ value: recordData.heartRate, timestamp: new Date().toISOString() }));
            }
            if (recordData.spo2) {
              updates.spo2 = recordData.spo2;
              updates.spo2Timestamp = new Date().toISOString();
              await AsyncStorage.setItem(`latest_spo2_${uid}`, JSON.stringify({ value: recordData.spo2, timestamp: new Date().toISOString() }));
            }
            await setDoc(doc(db, "users", uid), updates, { merge: true });
          }
        } catch (e) {
          log("⚠️ Failed to sync logged vitals to Firebase/AsyncStorage:", e);
        }
      }

      if (recordId) {
        // Edit Mode
        const updatedRecord: VitalsRecord = {
          id: recordId,
          timestamp: Date.now(), // update timestamp
          member_id: memberOwnerId,
          ...recordData,
        };
        await updateVitalsRecord(updatedRecord);
        Alert.alert("Success", "Vitals updated successfully.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        // Create Mode
        const newId = await addVitalsRecord(recordData, memberOwnerId);
        const record = {
          id: newId,
          timestamp: Date.now(),
          member_id: memberOwnerId,
          ...recordData,
        };
        setSavedRecord(record);
        setShowSuccess(true);
      }
    } catch (err) {
      error("Failed to save vitals:", err);
      Alert.alert("Unable to save your vitals.", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ─── DELETE ACTION ───
  const handleDelete = () => {
    if (!recordId) return;

    Alert.alert(
      "Delete Record?",
      "This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteVitalsRecord(recordId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            } catch (err) {
              error("Failed to delete record:", err);
              Alert.alert("Error", "Failed to delete record.");
            }
          },
        },
      ]
    );
  };

  // ─── RENDER WARNING ROW ───
  const renderWarning = (message: string) => {
    if (!message) return null;
    const isError = message.includes("outside the measurable range");
    return (
      <View style={styles.warningContainer}>
        <Ionicons
          name="warning"
          size={14}
          color={isError ? c.danger : "#f59e0b"}
        />
        <Text style={[styles.warningText, { color: isError ? c.danger : "#f59e0b" }]}>
          {message}
        </Text>
      </View>
    );
  };

  // ─── RENDER SUCCESS VIEW ───
  if (showSuccess && savedRecord) {
    // Format Recorded DateTime
    const getSuccessDateTimeStr = () => {
      const [y, m, d] = savedRecord.date.split("-").map(Number);
      const [h, min] = savedRecord.time.split(":").map(Number);
      const dateObj = new Date(y, m - 1, d, h, min);
      const formattedDate = dateObj.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      const formattedTime = `${h12}:${String(min).padStart(2, "0")} ${ampm}`;
      return { date: formattedDate, time: formattedTime };
    };

    const dtStr = getSuccessDateTimeStr();

    return (
      <LinearGradient
        colors={theme === "dark" ? ["#0b1329", "#080c1a"] : ["#f8fafc", "#f1f5f9", "#e0f2fe"]}
        style={styles.successContainer}
      >
        <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
          {/* Illustration */}
          <View style={styles.successIconWrapper}>
            <View style={styles.pulseRing1} />
            <View style={styles.pulseRing2} />
            <View style={[styles.successCircle, { backgroundColor: "#10b981" }]}>
              <Ionicons name="checkmark-sharp" size={48} color="#fff" />
            </View>
          </View>

          <Text style={[styles.successTitle, { color: c.text }]}>Vitals Saved</Text>
          <Text style={[styles.successSubtitle, { color: c.sub }]}>
            Your health measurements have been logged.
          </Text>

          {/* Value Summary Card */}
          <View style={[styles.summaryCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.summaryHeader, { color: c.sub }]}>SUMMARY</Text>
            
            {savedRecord.heartRate !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Heart Rate</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.heartRate} BPM</Text>
              </View>
            )}

            {savedRecord.bpSystolic !== null && savedRecord.bpDiastolic !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Blood Pressure</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>
                  {savedRecord.bpSystolic} / {savedRecord.bpDiastolic} mmHg
                </Text>
              </View>
            )}

            {savedRecord.spo2 !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>SpO₂</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.spo2}%</Text>
              </View>
            )}

            {savedRecord.temperature !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Body Temperature</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.temperature}°C</Text>
              </View>
            )}

            {savedRecord.respiratoryRate !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Respiratory Rate</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.respiratoryRate} Breaths/min</Text>
              </View>
            )}

            {savedRecord.weight !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Weight</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.weight} kg</Text>
              </View>
            )}

            {savedRecord.bloodGlucose !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Blood Glucose</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.bloodGlucose} mg/dL</Text>
              </View>
            )}

            {savedRecord.feeling !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Feeling Today</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>{savedRecord.feeling}</Text>
              </View>
            )}

            {savedRecord.medicationTaken !== null && (
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Meds Taken Before</Text>
                <Text style={[styles.summaryVal, { color: c.text }]}>
                  {savedRecord.medicationTaken === 1 ? "Yes" : "No"}
                </Text>
              </View>
            )}

            {savedRecord.notes !== null && (
              <View style={[styles.summaryItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={[styles.summaryLabel, { color: c.sub }]}>Notes</Text>
                <Text style={[styles.summaryVal, { color: c.text, textAlign: "right", maxWidth: "60%" }]}>
                  {savedRecord.notes}
                </Text>
              </View>
            )}

            <View style={[styles.divider, { backgroundColor: c.border }]} />

            {/* Recorded timestamp */}
            <View style={styles.recordedTimeContainer}>
              <Text style={[styles.recordedLabel, { color: c.sub }]}>Recorded</Text>
              <Text style={[styles.recordedDateVal, { color: c.text }]}>{dtStr.date}</Text>
              <Text style={[styles.recordedTimeVal, { color: c.sub }]}>{dtStr.time}</Text>
            </View>
          </View>

          {/* Success Buttons */}
          <View style={styles.successBtnContainer}>
            <TouchableOpacity
              style={[styles.btnDone, { backgroundColor: c.accent }]}
              onPress={() => router.replace("/(tabs)" as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnDoneTxt}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnHistory, { borderColor: c.border, borderWidth: 1.5 }]}
              onPress={() => router.replace("/VitalsHistoryScreen" as any)}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnHistoryTxt, { color: c.text }]}>View History</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // ─── RENDER FORM VIEW ───
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: c.border }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={c.text} />
          </TouchableOpacity>
          <View style={styles.titleWrapper}>
            <Text style={[styles.title, { color: c.text }]}>
              {recordId ? "Edit Vitals" : "Log Vitals"}
            </Text>
            <Text style={[styles.subtitle, { color: c.sub }]}>
              {recordId ? "Update your health measurements." : "Record your latest health measurements."}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/VitalsHistoryScreen" as any)}
          activeOpacity={0.7}
          style={[styles.headerIconWrapper, { backgroundColor: c.accent + "12" }]}
          accessibilityLabel="View Vitals History"
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Ionicons name="time-outline" size={24} color={c.accent} />
        </TouchableOpacity>
      </View>

      {loadingRecord ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={{ color: c.sub, marginTop: 10 }}>Loading record details...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.formScroll}
        >
          {/* SECTION 1: MEASUREMENT DETAILS */}
          <Text style={[styles.sectionHeader, { color: c.sub }]}>MEASUREMENT DETAILS</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.pickerRow}>
              <View style={styles.pickerCol}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Date</Text>
                <DatePicker value={date} onChange={setDate} accent={c.accent} />
              </View>
              <View style={styles.pickerCol}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Time</Text>
                <TimePicker value={time} onChange={setTime} accent={c.accent} />
              </View>
            </View>
          </View>

          {/* SECTION 2: VITAL SIGNS */}
          <Text style={[styles.sectionHeader, { color: c.sub }]}>VITAL SIGNS</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            
            {/* Heart Rate */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Heart Rate</Text>
                <Text style={[styles.unitText, { color: c.sub }]}>BPM</Text>
              </View>
              <TextInput
                placeholder="72"
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                accessibilityLabel="Heart Rate in beats per minute"
                style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                value={heartRate}
                onChangeText={(val) => handleWholeNumberChange(val, setHeartRate)}
              />
              {renderWarning(getHeartRateWarning())}
            </View>

            {/* Blood Pressure */}
            <View style={styles.fieldBlock}>
              <Text style={[styles.inputLabel, { color: c.text, marginBottom: 8 }]}>Blood Pressure</Text>
              <View style={styles.bpRow}>
                <View style={styles.bpCol}>
                  <Text style={[styles.bpSubLabel, { color: c.sub }]}>Systolic (mmHg)</Text>
                  <TextInput
                    placeholder="120"
                    placeholderTextColor={c.placeholder}
                    keyboardType="numeric"
                    accessibilityLabel="Systolic blood pressure"
                    style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                    value={bpSystolic}
                    onChangeText={(val) => handleWholeNumberChange(val, setBpSystolic)}
                  />
                  {renderWarning(getSystolicWarning())}
                </View>

                <View style={styles.bpCol}>
                  <Text style={[styles.bpSubLabel, { color: c.sub }]}>Diastolic (mmHg)</Text>
                  <TextInput
                    placeholder="80"
                    placeholderTextColor={c.placeholder}
                    keyboardType="numeric"
                    accessibilityLabel="Diastolic blood pressure"
                    style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                    value={bpDiastolic}
                    onChangeText={(val) => handleWholeNumberChange(val, setBpDiastolic)}
                  />
                  {renderWarning(getDiastolicWarning())}
                </View>
              </View>
            </View>

            {/* SpO2 */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>SpO₂</Text>
                <Text style={[styles.unitText, { color: c.sub }]}>%</Text>
              </View>
              <TextInput
                placeholder="98"
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                accessibilityLabel="Oxygen Saturation percentage"
                style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                value={spo2}
                onChangeText={(val) => handleWholeNumberChange(val, setSpo2)}
              />
              {renderWarning(getSpO2Warning())}
            </View>

            {/* Body Temperature */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Body Temperature</Text>
                <Text style={[styles.unitText, { color: c.sub }]}>°C</Text>
              </View>
              <TextInput
                placeholder="36.8"
                placeholderTextColor={c.placeholder}
                keyboardType="decimal-pad"
                accessibilityLabel="Body Temperature in Celsius"
                style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                value={temperature}
                onChangeText={(val) => handleDecimalChange(val, setTemperature)}
                onBlur={formatTemperature}
              />
              {renderWarning(getTemperatureWarning())}
            </View>

            {/* Respiratory Rate */}
            <View style={[styles.fieldBlock, { marginBottom: 0 }]}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Respiratory Rate</Text>
                <Text style={[styles.unitText, { color: c.sub }]}>Breaths/min</Text>
              </View>
              <TextInput
                placeholder="16"
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                accessibilityLabel="Respiratory Rate in breaths per minute"
                style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                value={respiratoryRate}
                onChangeText={(val) => handleWholeNumberChange(val, setRespiratoryRate)}
              />
              {renderWarning(getRespiratoryRateWarning())}
            </View>

          </View>

          {/* SECTION 3: ADDITIONAL MEASUREMENTS */}
          <Text style={[styles.sectionHeader, { color: c.sub }]}>ADDITIONAL MEASUREMENTS</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            
            {/* Weight */}
            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Weight</Text>
                <Text style={[styles.unitText, { color: c.sub }]}>kg</Text>
              </View>
              <TextInput
                placeholder="72.4"
                placeholderTextColor={c.placeholder}
                keyboardType="decimal-pad"
                accessibilityLabel="Weight in kilograms"
                style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                value={weight}
                onChangeText={(val) => handleDecimalChange(val, setWeight)}
                onBlur={formatWeight}
              />
              {renderWarning(getWeightWarning())}
            </View>

            {/* Blood Glucose */}
            <View style={[styles.fieldBlock, { marginBottom: 0 }]}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Blood Glucose</Text>
                <Text style={[styles.unitText, { color: c.sub }]}>mg/dL</Text>
              </View>
              <TextInput
                placeholder="110"
                placeholderTextColor={c.placeholder}
                keyboardType="numeric"
                accessibilityLabel="Blood Glucose in milligrams per deciliter"
                style={[styles.textInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                value={bloodGlucose}
                onChangeText={(val) => handleWholeNumberChange(val, setBloodGlucose)}
              />
              {renderWarning(getBloodGlucoseWarning())}
            </View>

          </View>

          {/* SECTION 4: HEALTH STATUS */}
          <Text style={[styles.sectionHeader, { color: c.sub }]}>HEALTH STATUS</Text>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            
            {/* Feeling Today */}
            <View style={styles.fieldBlock}>
              <Text style={[styles.inputLabel, { color: c.text, marginBottom: 10 }]}>Feeling Today</Text>
              <View style={styles.chipRow}>
                {["Excellent", "Good", "Normal", "Unwell", "Critical"].map((option) => {
                  const isSelected = feeling === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? c.accent : c.bg,
                          borderColor: isSelected ? c.accent : c.border,
                        },
                      ]}
                      onPress={() => setFeeling(feeling === option ? "" : option)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          {
                            color: isSelected ? "#fff" : c.text,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Medication Taken before measurement */}
            <View style={styles.fieldBlock}>
              <Text style={[styles.inputLabel, { color: c.text, marginBottom: 10 }]}>
                Medication Taken Before Measurement
              </Text>
              <View style={styles.toggleRow}>
                {[
                  { label: "Yes", val: 1 },
                  { label: "No", val: 0 },
                ].map((option) => {
                  const isSelected = medicationTaken === option.val;
                  return (
                    <TouchableOpacity
                      key={option.label}
                      style={[
                        styles.toggleBtn,
                        {
                          backgroundColor: isSelected ? c.accent : c.bg,
                          borderColor: isSelected ? c.accent : c.border,
                        },
                      ]}
                      onPress={() => setMedicationTaken(medicationTaken === option.val ? null : option.val)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.toggleBtnText,
                          {
                            color: isSelected ? "#fff" : c.text,
                            fontWeight: isSelected ? "700" : "500",
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View style={[styles.fieldBlock, { marginBottom: 0 }]}>
              <View style={styles.labelRow}>
                <Text style={[styles.inputLabel, { color: c.text }]}>Notes</Text>
                <Text style={[styles.charCount, { color: c.sub }]}>{notes.length} / 500</Text>
              </View>
              <TextInput
                placeholder="Measured during regular hospital visit."
                placeholderTextColor={c.placeholder}
                multiline
                numberOfLines={3}
                accessibilityLabel="Additional health notes"
                style={[
                  styles.multilineInput,
                  {
                    backgroundColor: c.bg,
                    color: c.text,
                    borderColor: c.border,
                    height: 80,
                    textAlignVertical: "top",
                  },
                ]}
                value={notes}
                onChangeText={handleNotesChange}
              />
            </View>

          </View>

          {/* EDIT MODE: DELETE RECORD BUTTON */}
          {recordId && (
            <TouchableOpacity
              style={[styles.btnDelete, { borderColor: c.danger }]}
              onPress={handleDelete}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color={c.danger} />
              <Text style={[styles.btnDeleteTxt, { color: c.danger }]}>Delete Record</Text>
            </TouchableOpacity>
          )}

          {/* Spacer */}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* BOTTOM SAVE BAR */}
      {!loadingRecord && (
        <View style={[styles.bottomBar, { backgroundColor: c.bg, borderTopColor: c.border }]}>
          <TouchableOpacity
            style={[styles.btnSave, { backgroundColor: saving ? "#cbd5e1" : c.accent }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnSaveText}>
                {recordId ? "Update Vitals" : "Save Vitals"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  titleWrapper: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99,
    elevation: 9,
  },
  centerLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  formScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginTop: 20,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 16,
  },
  pickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  pickerCol: {
    flex: 1,
  },
  fieldBlock: {
    gap: 6,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  bpSubLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 4,
  },
  unitText: {
    fontSize: 12,
    fontWeight: "700",
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "600",
  },
  bpRow: {
    flexDirection: "row",
    gap: 16,
  },
  bpCol: {
    flex: 1,
    gap: 2,
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  warningText: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: {
    fontSize: 12,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 12,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  toggleBtnText: {
    fontSize: 14,
  },
  charCount: {
    fontSize: 11,
    fontWeight: "600",
  },
  multilineInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "500",
  },
  btnDelete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginTop: 24,
  },
  btnDeleteTxt: {
    fontSize: 15,
    fontWeight: "800",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    borderTopWidth: 1,
  },
  btnSave: {
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSaveText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // ─── SUCCESS SCREEN STYLES ───
  successContainer: {
    flex: 1,
  },
  successScroll: {
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: "center",
  },
  successIconWrapper: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    position: "relative",
  },
  pulseRing1: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  pulseRing2: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
  },
  successCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginBottom: 30,
    paddingHorizontal: 16,
  },
  summaryCard: {
    width: "100%",
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryHeader: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.03)",
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: "800",
  },
  divider: {
    height: 1.5,
    marginVertical: 16,
  },
  recordedTimeContainer: {
    alignItems: "center",
  },
  recordedLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  recordedDateVal: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 2,
  },
  recordedTimeVal: {
    fontSize: 13,
    fontWeight: "600",
  },
  successBtnContainer: {
    width: "100%",
    gap: 12,
  },
  btnDone: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDoneTxt: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  btnHistory: {
    width: "100%",
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  btnHistoryTxt: {
    fontSize: 16,
    fontWeight: "800",
  },
});
