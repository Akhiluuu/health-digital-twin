import React from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import PillAvatar from "./shared/PillAvatar";
import { getVaultStyles } from "./shared/VaultStyles";
import { Medicine } from "../../context/MedicineContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";

interface MedicationDetailProps {
  medicine: Medicine;
  metadata: any;
  onDelete: (id: number, reason?: string) => Promise<void>;
  onClose: () => void;
}

export default function MedicationDetail({
  medicine,
  metadata,
  onDelete,
  onClose,
}: MedicationDetailProps) {
  const { theme } = useTheme();
  const c = colors[theme];
  const styles = getVaultStyles(c);

  const [deleteModalVisible, setDeleteModalVisible] = React.useState(false);
  const [deleteReason, setDeleteReason] = React.useState("");
  const [selectedPreset, setSelectedPreset] = React.useState("");

  const presets = [
    "Doctor advised to stop",
    "Completed medication course",
    "Experiencing side effects",
    "Switched to alternative drug",
    "Incorrect dose/schedule details",
  ];

  const confirmDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setDeleteModalVisible(true);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      {/* Header Back Link */}
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 18, gap: 6 }}
        onPress={onClose}
      >
        <Ionicons name="arrow-back" size={22} color={c.text} />
        <Text style={{ fontSize: 15, fontWeight: "700", color: c.text }}>Back to Regimen</Text>
      </TouchableOpacity>

      {/* Pill Inspector Hero Card */}
      <View style={[styles.nextDoseCardPlaceholder, { padding: 24, borderRadius: 24 }]}>
        <PillAvatar type={medicine.type} color={metadata.color || c.accent} size={64} />
        <Text style={[styles.placeholderTitle, { fontSize: 24, marginTop: 14 }]}>{medicine.name}</Text>
        <Text style={[styles.placeholderSub, { fontSize: 15, fontWeight: "600" }]}>
          {medicine.dose} · {metadata.strength || "Standard Dose"}
        </Text>

        <View style={{ width: "100%", height: 1, backgroundColor: c.border, marginVertical: 18 }} />

        {/* Info Grid */}
        <View style={{ width: "100%", gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: "600" }}>SCHEDULE TYPE</Text>
            <Text style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>
              {medicine.frequency.toUpperCase()} at {medicine.time}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: "600" }}>DIETARY GUIDANCE</Text>
            <Text style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>
              {medicine.meal === "after" ? "Take After Meals" : "Take Before Meals"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: "600" }}>LINKED CONDITION</Text>
            <Text style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>
              {metadata.diseaseLinked || "General Wellness"}
            </Text>
          </View>
        </View>
      </View>

      {/* Clinical Safety Guidelines */}
      <Text style={styles.sectionTitle}>Clinical Safety Guidelines</Text>

      <View style={[styles.nextDoseCardPlaceholder, { padding: 18, alignItems: "flex-start", gap: 14, borderRadius: 20 }]}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Ionicons name="alert-circle" size={16} color="#f59e0b" />
            <Text style={{ fontSize: 11, fontWeight: "800", color: "#f59e0b", letterSpacing: 0.5 }}>WARNING DETAILS</Text>
          </View>
          <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
            {metadata.warnings || "No critical contraindications logged for this dosage."}
          </Text>
        </View>

        <View style={{ width: "100%", height: 1, backgroundColor: c.border }} />

        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Ionicons name="pulse" size={16} color={c.accent} />
            <Text style={{ fontSize: 11, fontWeight: "800", color: c.accent, letterSpacing: 0.5 }}>COMMON SIDE EFFECTS</Text>
          </View>
          <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
            {metadata.sideEffects || "Mild drowsiness or slight dry mouth may occur."}
          </Text>
        </View>

        <View style={{ width: "100%", height: 1, backgroundColor: c.border }} />

        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <Ionicons name="shield-checkmark" size={16} color={c.sub} />
            <Text style={{ fontSize: 11, fontWeight: "800", color: c.sub, letterSpacing: 0.5 }}>STORAGE ENVIRONMENT</Text>
          </View>
          <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
            {metadata.storage || "Keep dry at room temperature away from direct moisture."}
          </Text>
        </View>
      </View>

      {/* Prescribing Clinician Info */}
      <Text style={styles.sectionTitle}>Prescriber Information</Text>
      <View style={[styles.nextDoseCardPlaceholder, { padding: 18, alignItems: "flex-start", borderRadius: 20 }]}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: c.text }}>{metadata.doctor || "Primary Care Physician"}</Text>
        <Text style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{metadata.hospital || "Community Health Center"}</Text>
        <Text style={{ fontSize: 12, color: c.sub, marginTop: 4 }}>Therapeutic Focus: {metadata.purpose || "Maintenance Therapy"}</Text>
      </View>

      {/* Deletion Action */}
      <TouchableOpacity
        style={[
          styles.reorderButton,
          {
            backgroundColor: "#ef4444",
            height: 52,
            borderRadius: 16,
            justifyContent: "center",
            alignItems: "center",
            marginTop: 24,
            marginBottom: 40,
          },
        ]}
        onPress={confirmDelete}
      >
        <Text style={[styles.reorderTxt, { fontSize: 15, fontWeight: "800" }]}>Delete Medication</Text>
      </TouchableOpacity>

      {/* Deletion Reason Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}
        >
          <View style={{ width: "90%", backgroundColor: c.card, borderRadius: 24, padding: 22, borderWidth: 1, borderColor: c.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: c.text }}>Remove Medication</Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <Ionicons name="close" size={24} color={c.sub} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: c.sub, marginBottom: 16, lineHeight: 18 }}>
              Please select or type a reason for removing <Text style={{ fontWeight: "800", color: c.text }}>{medicine.name}</Text>. This log will update your clinical compliance history.
            </Text>

            {/* Presets List */}
            <View style={{ gap: 8, marginBottom: 16 }}>
              {presets.map((preset) => {
                const isSelected = selectedPreset === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isSelected ? c.accent : c.border,
                      backgroundColor: isSelected ? c.accent + "15" : c.card,
                    }}
                    onPress={() => {
                      setSelectedPreset(preset);
                      setDeleteReason(preset);
                    }}
                  >
                    <Text style={{ fontSize: 13, color: isSelected ? c.accent : c.text, fontWeight: isSelected ? "700" : "500" }}>
                      {preset}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Input */}
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 14,
                padding: 12,
                fontSize: 13,
                color: c.text,
                backgroundColor: c.bg,
                minHeight: 60,
                textAlignVertical: "top",
                marginBottom: 20,
              }}
              placeholder="Or type a custom reason..."
              placeholderTextColor={c.sub}
              multiline
              value={deleteReason}
              onChangeText={(text) => {
                setDeleteReason(text);
                setSelectedPreset("");
              }}
            />

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={{ color: c.sub, fontWeight: "700", fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  backgroundColor: "#ef4444",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={async () => {
                  const finalReason = deleteReason.trim() || "No reason specified";
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  await onDelete(medicine.id, finalReason);
                  setDeleteModalVisible(false);
                  onClose();
                }}
              >
                <Text style={{ color: "#ffffff", fontWeight: "800", fontSize: 14 }}>Confirm Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
