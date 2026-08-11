import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  Platform,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker from "@react-native-community/datetimepicker";

import PillAvatar from "./shared/PillAvatar";
import { getVaultStyles } from "./shared/VaultStyles";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";
import { getLocalDateString } from "../../utils/twinUtils";

interface AddMedicationFlowProps {
  onCancel: () => void;
  onAddMedicine: (details: {
    name: string;
    brand: string;
    generic: string;
    dose: string;
    strength: string;
    form: string;
    meal: "before" | "after";
    frequency: string;
    time: string;
    times?: string[];
    diseaseLinked: string;
    reviewInterval: string;
    refillCount: string;
    inventoryCount: string;
    startDate: string;
    endDateMode: "ongoing" | "specific";
    endDate: string;
  }) => void;
  onOCRScan: () => void;
}

export default function AddMedicationFlow({
  onCancel,
  onAddMedicine,
  onOCRScan,
}: AddMedicationFlowProps) {
  const { theme } = useTheme();
  const c = colors[theme];
  const styles = getVaultStyles(c);

  const [step, setStep] = useState(0);

  // Form states
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [generic, setGeneric] = useState("");
  
  // Interactive Dose quantity & units
  const [doseQty, setDoseQty] = useState(1);
  const [doseUnit, setDoseUnit] = useState("tablet");
  const [strength, setStrength] = useState("");
  
  const [form, setForm] = useState("Tablet");
  const [meal, setMeal] = useState<"before" | "after">("after");
  const [frequency, setFrequency] = useState("daily");
  
  // Multi-time schedule list
  const [times, setTimes] = useState<string[]>(["08:00"]);

  // Date and Time Picker States
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<"start" | "end" | "time">("start");
  const [activeTimeIndex, setActiveTimeIndex] = useState<number | null>(null);
  const [pickerDate, setPickerDate] = useState(new Date());

  const [diseaseLinked, setDiseaseLinked] = useState("General Health");
  const [reviewInterval, setReviewInterval] = useState("90 days");
  
  // Inventory tracking states
  const [trackInventory, setTrackInventory] = useState(false);
  const [refillCount, setRefillCount] = useState("3");
  const [inventoryCount, setInventoryCount] = useState("30");
  
  const [startDate, setStartDate] = useState(() => getLocalDateString());
  const [endDateMode, setEndDateMode] = useState<"ongoing" | "specific">("ongoing");
  const [endDate, setEndDate] = useState("");

  const totalSteps = 5;

  const getDoseUnitsForForm = (formType: string) => {
    switch (formType.toLowerCase()) {
      case "tablet":
        return ["tablet", "mg", "g"];
      case "capsule":
        return ["capsule", "mg"];
      case "injection":
        return ["ml", "mg", "injection", "unit"];
      case "drops":
        return ["drop", "ml", "mg"];
      case "inhaler":
        return ["puff", "dose", "inhalation"];
      case "syrup":
        return ["ml", "teaspoon", "tablespoon", "mg"];
      default:
        return ["tablet", "capsule", "ml", "mg", "puff", "drop"];
    }
  };

  const handleFormChange = (newForm: string) => {
    setForm(newForm);
    const availableUnits = getDoseUnitsForForm(newForm);
    setDoseUnit(availableUnits[0]);
  };

  const nextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1 && !name.trim()) {
      Alert.alert("Missing Fields", "Please enter the medication name.");
      return;
    }
    if (step < totalSteps - 1) {
      setStep((prev) => prev + 1);
    } else {
      const finalDose = `${doseQty} ${doseUnit}${doseQty > 1 && !doseUnit.endsWith("s") ? "s" : ""}`;
      onAddMedicine({
        name,
        brand,
        generic,
        dose: finalDose,
        strength,
        form,
        meal,
        frequency,
        time: times[0] || "08:00",
        times,
        diseaseLinked,
        reviewInterval,
        refillCount: trackInventory ? refillCount : "0",
        inventoryCount: trackInventory ? inventoryCount : "0",
        startDate,
        endDateMode,
        endDate,
      });
    }
  };

  const prevStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 0) {
      setStep((prev) => prev - 1);
    } else {
      onCancel();
    }
  };

  const progressPct = ((step + 1) / totalSteps) * 100;

  const renderDateTimePicker = () => {
    if (!showDatePicker) return null;

    if (Platform.OS === "ios") {
      return (
        <Modal transparent animationType="slide" visible={showDatePicker}>
          <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: c.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: c.text }}>
                  {datePickerMode === "time" ? "Select Time" : "Select Date"}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={{ backgroundColor: c.accent, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerDate}
                mode={datePickerMode === "time" ? "time" : "date"}
                display="spinner"
                is24Hour={true}
                onChange={(event, date) => {
                  if (date) {
                    setPickerDate(date);
                    if (datePickerMode === "start") {
                      setStartDate(getLocalDateString(date));
                    } else if (datePickerMode === "end") {
                      setEndDate(getLocalDateString(date));
                    } else if (datePickerMode === "time" && activeTimeIndex !== null) {
                      const hh = String(date.getHours()).padStart(2, "0");
                      const mm = String(date.getMinutes()).padStart(2, "0");
                      const updated = [...times];
                      updated[activeTimeIndex] = `${hh}:${mm}`;
                      setTimes(updated);
                    }
                  }
                }}
              />
            </View>
          </View>
        </Modal>
      );
    }

    return (
      <DateTimePicker
        value={pickerDate}
        mode={datePickerMode === "time" ? "time" : "date"}
        display="default"
        is24Hour={true}
        onChange={(event, date) => {
          setShowDatePicker(false);
          if (date) {
            if (datePickerMode === "start") {
              setStartDate(getLocalDateString(date));
            } else if (datePickerMode === "end") {
              setEndDate(getLocalDateString(date));
            } else if (datePickerMode === "time" && activeTimeIndex !== null) {
              const hh = String(date.getHours()).padStart(2, "0");
              const mm = String(date.getMinutes()).padStart(2, "0");
              const updated = [...times];
              updated[activeTimeIndex] = `${hh}:${mm}`;
              setTimes(updated);
            }
          }
        }}
      />
    );
  };

  const openDatePickerFor = (mode: "start" | "end", currentVal: string) => {
    setDatePickerMode(mode);
    const parts = currentVal.split("-").map(Number);
    if (parts.length === 3) {
      setPickerDate(new Date(parts[0], parts[1] - 1, parts[2]));
    } else {
      setPickerDate(new Date());
    }
    setShowDatePicker(true);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        {/* Visual Segmented Progress Bar */}
        <View style={styles.wizardProgressContainer}>
          <View style={styles.wizardProgressTrack}>
            <View
              style={[
                styles.wizardProgressBar,
                { width: `${progressPct}%`, backgroundColor: c.accent },
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: c.accent, letterSpacing: 0.5 }}>
              STEP {step + 1} OF {totalSteps}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: c.sub }}>
              {Math.round(progressPct)}% Completed
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.wizardScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Step 0: Method Intake Choice */}
        {step === 0 && (
          <View>
            <Text style={styles.wizardTitle}>Add Medication</Text>
            <Text style={styles.wizardSubtitle}>
              Choose how you want to add your medication schedule to the vault.
            </Text>

            <View style={styles.wizardMethodGrid}>
              <TouchableOpacity
                style={[styles.methodCard, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={onOCRScan}
              >
                <View style={[styles.methodIconContainer, { backgroundColor: c.accent + "18" }]}>
                  <Ionicons name="document-text" size={26} color={c.accent} />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodTitle}>Scan Prescription</Text>
                  <Text style={[styles.methodDesc, { color: c.sub }]}>
                    Snap a photo of your doctor's order to extract schedules automatically.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.methodCard, { backgroundColor: c.card, borderColor: c.border }]}
                onPress={nextStep}
              >
                <View style={[styles.methodIconContainer, { backgroundColor: c.accent + "18" }]}>
                  <Ionicons name="create" size={26} color={c.accent} />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodTitle}>Enter Details Manually</Text>
                  <Text style={[styles.methodDesc, { color: c.sub }]}>
                    Type dosage, schedule, and linked treatments step-by-step.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <View>
            <Text style={styles.wizardTitle}>Medication Identity</Text>
            <Text style={styles.wizardSubtitle}>
              Enter name and strength details. Dose size will be configured in the next step.
            </Text>

            <Text style={styles.wizardFormLabel}>MEDICATION NAME *</Text>
            <TextInput
              placeholder="e.g. Metformin"
              placeholderTextColor={c.sub}
              style={[styles.wizardFormInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.wizardFormLabel}>BRAND NAME (OPTIONAL)</Text>
            <TextInput
              placeholder="e.g. Glucophage"
              placeholderTextColor={c.sub}
              style={[styles.wizardFormInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={brand}
              onChangeText={setBrand}
            />

            <Text style={styles.wizardFormLabel}>GENERIC INGREDIENT (OPTIONAL)</Text>
            <TextInput
              placeholder="e.g. Metformin Hydrochloride"
              placeholderTextColor={c.sub}
              style={[styles.wizardFormInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={generic}
              onChangeText={setGeneric}
            />

            <Text style={styles.wizardFormLabel}>STRENGTH / CONCENTRATION</Text>
            <TextInput
              placeholder="e.g. 500mg, 10mcg, 1.2%"
              placeholderTextColor={c.sub}
              style={[styles.wizardFormInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={strength}
              onChangeText={setStrength}
            />
          </View>
        )}

        {/* Step 2: Physical Form factor & Interactive Dose selection */}
        {step === 2 && (
          <View>
            <Text style={styles.wizardTitle}>Form & Dose Size</Text>
            <Text style={styles.wizardSubtitle}>
              Specify the physical medication type and the dose amount you will take at each time.
            </Text>

            <Text style={styles.wizardFormLabel}>PHYSICAL FORM FACTOR</Text>
            <View style={styles.formPillGrid}>
              {["Tablet", "Capsule", "Injection", "Drops", "Inhaler", "Syrup"].map((option) => {
                const isSelected = form === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.formPillChip,
                      {
                        backgroundColor: isSelected ? c.accent : c.card,
                        borderColor: isSelected ? c.accent : c.border,
                      },
                    ]}
                    onPress={() => handleFormChange(option)}
                  >
                    <Text style={[styles.formPillText, { color: isSelected ? "#fff" : c.text }]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Dose Quantity Counter */}
            <Text style={styles.wizardFormLabel}>DOSE QUANTITY</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <TouchableOpacity
                style={styles.qtyCounterBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (doseQty > 0.5) setDoseQty((prev) => prev - 0.5);
                }}
              >
                <Ionicons name="remove" size={24} color={c.text} />
              </TouchableOpacity>

              <View style={{ minWidth: 60, alignItems: "center" }}>
                <Text style={styles.qtyCounterVal}>{doseQty}</Text>
              </View>

              <TouchableOpacity
                style={styles.qtyCounterBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDoseQty((prev) => prev + 0.5);
                }}
              >
                <Ionicons name="add" size={24} color={c.text} />
              </TouchableOpacity>
            </View>

            {/* Adaptive Units Selection */}
            <Text style={styles.wizardFormLabel}>DOSE UNIT</Text>
            <View style={styles.formPillGrid}>
              {getDoseUnitsForForm(form).map((unit) => {
                const isSelected = doseUnit === unit;
                return (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.formPillChip,
                      {
                        backgroundColor: isSelected ? c.accent : c.card,
                        borderColor: isSelected ? c.accent : c.border,
                      },
                    ]}
                    onPress={() => setDoseUnit(unit)}
                  >
                    <Text style={[styles.formPillText, { color: isSelected ? "#fff" : c.text }]}>
                      {unit}{doseQty > 1 && !unit.endsWith("s") ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Dose Summary Box */}
            <View
              style={{
                backgroundColor: c.accent + "10",
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: c.accent + "30",
                alignItems: "center",
                marginTop: 14,
              }}
            >
              <PillAvatar type={form} color={c.accent} size={48} />
              <Text style={{ fontSize: 12, color: c.sub, marginTop: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                SCHEDULE DOSE PREVIEW
              </Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.text, marginTop: 4, textAlign: "center" }}>
                Take {doseQty} {doseUnit}{doseQty > 1 && !doseUnit.endsWith("s") ? "s" : ""} of{" "}
                <Text style={{ color: c.accent }}>{name || "Medication"}</Text>
                {strength ? ` (${strength})` : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Step 3: Frequency & Schedules */}
        {step === 3 && (
          <View>
            <Text style={styles.wizardTitle}>Intake Schedule & Timing</Text>
            <Text style={styles.wizardSubtitle}>
              Configure when and how often you will take your medicine throughout the day.
            </Text>

            <Text style={styles.wizardFormLabel}>FREQUENCY</Text>
            <View style={styles.formPillGrid}>
              {["daily", "weekly", "as-needed"].map((freq) => {
                const isSelected = frequency === freq;
                return (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.formPillChip,
                      {
                        backgroundColor: isSelected ? c.accent : c.card,
                        borderColor: isSelected ? c.accent : c.border,
                      },
                    ]}
                    onPress={() => setFrequency(freq)}
                  >
                    <Text style={[styles.formPillText, { color: isSelected ? "#fff" : c.text }]}>
                      {freq.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {frequency !== "as-needed" && (
              <>
                <Text style={styles.wizardFormLabel}>DAILY INTAKE TIMES</Text>
                {times.map((t, index) => (
                  <View key={index} style={{ flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[
                        styles.wizardFormInput,
                        {
                          flex: 1,
                          backgroundColor: c.card,
                          borderColor: c.border,
                          justifyContent: "center",
                        },
                      ]}
                      onPress={() => {
                        setDatePickerMode("time");
                        setActiveTimeIndex(index);
                        const [h, m] = t.split(":").map(Number);
                        const d = new Date();
                        d.setHours(h);
                        d.setMinutes(m);
                        setPickerDate(d);
                        setShowDatePicker(true);
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>{t}</Text>
                        <Ionicons name="time-outline" size={22} color={c.sub} />
                      </View>
                    </TouchableOpacity>

                    {times.length > 1 && (
                      <TouchableOpacity
                        style={{
                          height: 52,
                          width: 52,
                          borderRadius: 16,
                          backgroundColor: "#ef444415",
                          borderWidth: 1,
                          borderColor: "#ef444430",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setTimes(times.filter((_, i) => i !== index));
                        }}
                      >
                        <Ionicons name="trash-outline" size={22} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: c.accent,
                    backgroundColor: c.accent + "10",
                    alignSelf: "flex-start",
                    marginTop: 4,
                    marginBottom: 20,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const lastTime = times[times.length - 1] || "08:00";
                    const [h, m] = lastTime.split(":").map(Number);
                    const newHour = (h + 4) % 24;
                    const formatted = `${String(newHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    setTimes([...times, formatted]);
                  }}
                >
                  <Ionicons name="add" size={18} color={c.accent} />
                  <Text style={{ fontSize: 13, fontWeight: "800", color: c.accent }}>Add Another Time</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.wizardFormLabel}>DIETARY CONNECTION</Text>
            <View style={styles.wizardFormRow}>
              <TouchableOpacity
                style={[
                  styles.formPillChip,
                  {
                    flex: 1,
                    backgroundColor: meal === "after" ? c.accent : c.card,
                    borderColor: meal === "after" ? c.accent : c.border,
                  },
                ]}
                onPress={() => setMeal("after")}
              >
                <Text style={[styles.formPillText, { color: meal === "after" ? "#fff" : c.text }]}>
                  Take After Meals
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formPillChip,
                  {
                    flex: 1,
                    backgroundColor: meal === "before" ? c.accent : c.card,
                    borderColor: meal === "before" ? c.accent : c.border,
                  },
                ]}
                onPress={() => setMeal("before")}
              >
                <Text style={[styles.formPillText, { color: meal === "before" ? "#fff" : c.text }]}>
                  Take Before Meals
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 4: Duration & Refills */}
        {step === 4 && (
          <View>
            <Text style={styles.wizardTitle}>Duration & Refills</Text>
            <Text style={styles.wizardSubtitle}>
              Set active dates, safety review cycles, and optional inventory tracking.
            </Text>

            <Text style={styles.wizardFormLabel}>START DATE</Text>
            <TouchableOpacity
              style={[
                styles.wizardFormInput,
                { backgroundColor: c.card, borderColor: c.border, justifyContent: "center" },
              ]}
              onPress={() => openDatePickerFor("start", startDate)}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.text, fontWeight: "700" }}>{startDate}</Text>
                <Ionicons name="calendar-outline" size={20} color={c.sub} />
              </View>
            </TouchableOpacity>

            <Text style={styles.wizardFormLabel}>END DATE</Text>
            <View style={[styles.wizardFormRow, { marginBottom: 12 }]}>
              <TouchableOpacity
                style={[
                  styles.formPillChip,
                  {
                    flex: 1,
                    backgroundColor: endDateMode === "ongoing" ? c.accent : c.card,
                    borderColor: endDateMode === "ongoing" ? c.accent : c.border,
                  },
                ]}
                onPress={() => {
                  setEndDateMode("ongoing");
                  setEndDate("");
                }}
              >
                <Text style={[styles.formPillText, { color: endDateMode === "ongoing" ? "#fff" : c.text }]}>
                  Ongoing / Long-term
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.formPillChip,
                  {
                    flex: 1,
                    backgroundColor: endDateMode === "specific" ? c.accent : c.card,
                    borderColor: endDateMode === "specific" ? c.accent : c.border,
                  },
                ]}
                onPress={() => {
                  setEndDateMode("specific");
                  openDatePickerFor("end", endDate || getLocalDateString());
                }}
              >
                <Text style={[styles.formPillText, { color: endDateMode === "specific" ? "#fff" : c.text }]}>
                  Set End Date
                </Text>
              </TouchableOpacity>
            </View>

            {endDateMode === "specific" && (
              <TouchableOpacity
                style={[
                  styles.wizardFormInput,
                  { backgroundColor: c.card, borderColor: c.border, justifyContent: "center" },
                ]}
                onPress={() => openDatePickerFor("end", endDate || getLocalDateString())}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: endDate ? c.text : c.sub, fontWeight: "700" }}>
                    {endDate || "Select End Date"}
                  </Text>
                  <Ionicons name="calendar-outline" size={20} color={c.sub} />
                </View>
              </TouchableOpacity>
            )}

            <Text style={styles.wizardFormLabel}>LINKED HEALTH CONDITION</Text>
            <TextInput
              placeholder="e.g. Type 2 Diabetes"
              placeholderTextColor={c.sub}
              style={[styles.wizardFormInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
              value={diseaseLinked}
              onChangeText={setDiseaseLinked}
            />

            <Text style={styles.wizardFormLabel}>SAFETY REVIEW CYCLE</Text>
            <View style={styles.formPillGrid}>
              {["7 days", "30 days", "90 days", "180 days"].map((cycle) => {
                const isSelected = reviewInterval === cycle;
                return (
                  <TouchableOpacity
                    key={cycle}
                    style={[
                      styles.formPillChip,
                      {
                        backgroundColor: isSelected ? c.accent : c.card,
                        borderColor: isSelected ? c.accent : c.border,
                      },
                    ]}
                    onPress={() => setReviewInterval(cycle)}
                  >
                    <Text style={[styles.formPillText, { color: isSelected ? "#fff" : c.text }]}>
                      {cycle.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Inventory Tracker Toggle Switch */}
            <View style={{ height: 1, backgroundColor: c.border, marginVertical: 18 }} />

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 6 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>Track Pill Inventory</Text>
                <Text style={{ fontSize: 12, color: c.sub, marginTop: 2, lineHeight: 16 }}>
                  Keep track of remaining medication stock and receive notifications before you run out.
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: trackInventory ? c.accent : c.border,
                  padding: 3,
                  justifyContent: "center",
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setTrackInventory(!trackInventory);
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: "#ffffff",
                    alignSelf: trackInventory ? "flex-end" : "flex-start",
                  }}
                />
              </TouchableOpacity>
            </View>

            {trackInventory && (
              <View style={[styles.wizardFormRow, { marginTop: 14 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wizardFormLabel}>CURRENT PILL COUNT</Text>
                  <TextInput
                    placeholder="e.g. 30"
                    placeholderTextColor={c.sub}
                    style={[styles.wizardFormHalfInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
                    value={inventoryCount}
                    onChangeText={setInventoryCount}
                    keyboardType="numeric"
                  />
                  <Text style={{ fontSize: 11, color: c.sub, marginTop: 4 }}>Total doses currently in hand</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wizardFormLabel}>REFILLS REMAINING</Text>
                  <TextInput
                    placeholder="e.g. 3"
                    placeholderTextColor={c.sub}
                    style={[styles.wizardFormHalfInput, { backgroundColor: c.card, color: c.text, borderColor: c.border }]}
                    value={refillCount}
                    onChangeText={setRefillCount}
                    keyboardType="numeric"
                  />
                  <Text style={{ fontSize: 11, color: c.sub, marginTop: 4 }}>Prescription refills allowed</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Wizard Bottom Buttons */}
        <View style={styles.wizardActions}>
          <TouchableOpacity style={[styles.wizardBackBtn, { borderColor: c.border }]} onPress={prevStep}>
            <Text style={[styles.wizardBackBtnTxt, { color: c.sub }]}>
              {step === 0 ? "Cancel" : "Back"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.wizardNextBtn, { backgroundColor: c.accent }]} onPress={nextStep}>
            <Text style={styles.wizardNextBtnTxt}>
              {step === totalSteps - 1 ? "Save Schedule" : "Continue"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Datetime Pickers */}
      {renderDateTimePicker()}
    </View>
    </KeyboardAvoidingView>
  );
}
