// app/symptom-log.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  TextInput,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../context/ThemeContext";
import { useSymptoms } from "../context/SymptomContext";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 48) / 2;

/**
 * Ensure these types match the keys in symptomDB (symptomData.ts)
 */
type SymptomType =
  | "headache"
  | "heart"
  | "breathing"
  | "stomach"
  | "ent"
  | "vision"
  | "dental"
  | "sleep"
  | "urinary"
  | "muscle"
  | "skin"
  | "other";

interface SymptomItem {
  label: string;
  icon: string;
  type: SymptomType;
  color: string;
}

const symptoms: SymptomItem[] = [
  { label: "HEADACHE", icon: "brain", type: "headache", color: "#a78bfa" },
  { label: "HEART/CHEST", icon: "heart-pulse", type: "heart", color: "#f43f5e" },
  { label: "BREATHING", icon: "lungs", type: "breathing", color: "#22c55e" },
  { label: "STOMACH", icon: "stomach", type: "stomach", color: "#eab308" },
  { label: "EAR/NOSE/THROAT", icon: "ear-hearing", type: "ent", color: "#14b8a6" },
  { label: "VISION/EYES", icon: "eye", type: "vision", color: "#06b6d4" },
  { label: "DENTAL/ORAL", icon: "tooth", type: "dental", color: "#f472b6" },
  { label: "SLEEP/ENERGY", icon: "sleep", type: "sleep", color: "#6366f1" },
  { label: "URINARY", icon: "water", type: "urinary", color: "#3b82f6" },
  { label: "MUSCLE/JOINT", icon: "arm-flex", type: "muscle", color: "#f97316" },
  { label: "SKIN/DERMA", icon: "bandage", type: "skin", color: "#fb923c" },
  { label: "OTHERS", icon: "plus", type: "other", color: "#64748b" },
];

export default function SymptomLogScreen() {
  useStackBackHandler();
  const router = useRouter();
  const { theme } = useTheme();
  const { logCustomSymptom } = useSymptoms();

  const [showModal, setShowModal] = useState(false);
  const [symptomName, setSymptomName] = useState("");
  const [customSymptom, setCustomSymptom] = useState("");

  const colors =
    theme === "light"
      ? {
          bg: "#f8fafc",
          card: "#ffffff",
          text: "#020617",
          sub: "#64748b",
          border: "#e2e8f0",
          accent: "#38bdf8",
        }
      : {
          bg: "#020617",
          card: "#0b1220",
          text: "#e2e8f0",
          sub: "#64748b",
          border: "#1e293b",
          accent: "#38bdf8",
        };

  /**
   * Handles navigation to the symptom flow
   */
  const openSymptom = (type: SymptomType) => {
    if (type === "other") {
      setShowModal(true);
      return;
    }

    router.push({
      pathname: "/symptom-flow",
      params: { type },
    });
  };

  /**
   * Starts diagnosis for custom symptoms
   */
  const handleCustomDiagnosis = async () => {
    if (!symptomName.trim()) {
      Alert.alert("Input Required", "Please enter a name for your symptom.");
      return;
    }

    if (!customSymptom.trim()) {
      Alert.alert("Input Required", "Please describe your health issue.");
      return;
    }

    const symptomText = customSymptom.trim();

    await logCustomSymptom(symptomText, "mild");
    setShowModal(false);
    setSymptomName("");
    setCustomSymptom("");
    Alert.alert("Symptom Logged", "Your symptom has been saved to your health history.");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}>
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Symptom Log
        </Text>

        <TouchableOpacity onPress={() => router.push("/symptom-history")}>
          <Ionicons
            name="time-outline"
            size={24}
            color={colors.accent}
          />
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.subTitle, { color: colors.sub }]}>
          SELECT PRIMARY NODE
        </Text>

        <View style={styles.grid}>
          {symptoms.map((item) => (
            <TouchableOpacity
              key={item.type}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderLeftColor: item.color,
                  borderLeftWidth: 4,
                },
              ]}
              onPress={() => openSymptom(item.type)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconContainer, { backgroundColor: item.color + "15" }]}>
                <MaterialCommunityIcons name={item.icon as any} size={26} color={item.color} />
              </View>
              <Text style={[styles.label, { color: colors.text }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* MODAL FOR "OTHERS" */}
      <Modal visible={showModal} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.modalContainer,
                { backgroundColor: colors.card },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Describe Your Health Issue
              </Text>

              <Text style={[styles.modalSubtitle, { color: colors.sub }]}>
                Use your own words. Voice input can be added for hands-free narration.
              </Text>

              {/* SYMPTOM NAME INPUT */}
              <Text style={[styles.inputLabel, { color: colors.sub }]}>
                SYMPTOM NAME
              </Text>
              <TextInput
                placeholder="e.g. Eye twitch, Chest tightness..."
                placeholderTextColor={colors.sub}
                value={symptomName}
                onChangeText={setSymptomName}
                style={[
                  styles.nameInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                  },
                ]}
              />

              {/* SYMPTOM DESCRIPTION INPUT */}
              <Text style={[styles.inputLabel, { color: colors.sub }]}>
                DESCRIPTION
              </Text>
              <TextInput
                placeholder="e.g. Muscle twitching in left eyelid..."
                placeholderTextColor={colors.sub}
                value={customSymptom}
                onChangeText={setCustomSymptom}
                multiline
                style={[
                  styles.input,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.bg,
                  },
                ]}
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    { borderColor: colors.border },
                  ]}
                  onPress={() => {
                    setShowModal(false);
                    setSymptomName("");
                    setCustomSymptom("");
                  }}
                >
                  <Text style={{ color: colors.text }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: colors.accent },
                  ]}
                  onPress={handleCustomDiagnosis}
                >
                  <Text style={styles.submitText}>
                    Start Diagnosis
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ===== STYLES =====

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
  },

  scroll: {
    padding: 16,
    paddingBottom: 60,
  },

  subTitle: {
    letterSpacing: 3,
    fontWeight: "600",
    marginBottom: 18,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },

  card: {
    height: 120,
    width: CARD_WIDTH,
    borderRadius: 26,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(56, 189, 248, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },

  label: {
    fontWeight: "600",
    textAlign: "center",
    fontSize: 12,
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },

  modalContainer: {
    borderRadius: 16,
    padding: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 6,
  },

  modalSubtitle: {
    fontSize: 13,
    marginBottom: 16,
  },

  inputLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 2,
    marginBottom: 6,
  },

  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    height: 48,
    marginBottom: 14,
  },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
  },

  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    marginRight: 8,
  },

  submitButton: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginLeft: 8,
  },

  submitText: {
    color: "#fff",
    fontWeight: "bold",
  },
});