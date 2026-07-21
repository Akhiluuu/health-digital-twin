import React from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Alert,
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
        <Ionicons name="arrow-back" size={20} color={c.text} />
        <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>Back to Vault</Text>
      </TouchableOpacity>

      {/* Pill Card Block */}
      <View style={[styles.nextDoseCard, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}>
        <View style={{ alignItems: "center", marginVertical: 14 }}>
          <PillAvatar type={medicine.type} color={metadata.color || c.accent} size={64} />
          <Text style={[styles.placeholderTitle, { fontSize: 22, marginTop: 14 }]}>{medicine.name}</Text>
          <Text style={[styles.placeholderSub, { fontSize: 14 }]}>
            {medicine.dose} · {metadata.strength || ""}
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />

        {/* Info Grid */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.sub, fontSize: 13 }}>Schedule Type</Text>
            <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
              {medicine.frequency.toUpperCase()} at {medicine.time}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.sub, fontSize: 13 }}>Dietary Guidance</Text>
            <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
              {medicine.meal === "after" ? "Take After Meals" : "Take Before Meals"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.sub, fontSize: 13 }}>Disease Focus</Text>
            <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
              {metadata.diseaseLinked || "General Wellness"}
            </Text>
          </View>
        </View>
      </View>

      {/* Clinical Cautions */}
      <Text style={styles.sectionTitle}>Clinical Safety Guidelines</Text>

      <View style={[styles.scoreCard, { gap: 12 }]}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#eab308", marginBottom: 4 }}>
            WARNING DETAILS
          </Text>
          <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
            {metadata.warnings || "No specific warning logs found."}
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: c.border }} />

        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.accent, marginBottom: 4 }}>
            COMMON SIDE EFFECTS
          </Text>
          <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
            {metadata.sideEffects || "No side effects registered."}
          </Text>
        </View>

        <View style={{ height: 1, backgroundColor: c.border }} />

        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.sub, marginBottom: 4 }}>
            STORAGE ENVIRONMENT
          </Text>
          <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
            {metadata.storage || "Keep dry at room temperature."}
          </Text>
        </View>
      </View>

      {/* Prescribing Clinician info */}
      <Text style={styles.sectionTitle}>Prescriber Details</Text>
      <View style={styles.scoreCard}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: c.text }}>{metadata.doctor || "Primary Care Physician"}</Text>
        <Text style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>{metadata.hospital || "Community Hospital"}</Text>
        <Text style={{ fontSize: 12, color: c.sub, marginTop: 2 }}>Purpose: {metadata.purpose || "General Therapy"}</Text>
      </View>

      {/* Danger Zone Actions */}
      <TouchableOpacity
        style={[
          styles.reorderButton,
          {
            backgroundColor: "#ef4444",
            height: 48,
            justifyContent: "center",
            alignItems: "center",
            marginTop: 20,
            marginBottom: 40,
          },
        ]}
        onPress={confirmDelete}
      >
        <Text style={styles.reorderTxt}>Delete Medication</Text>
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
          <View style={{ width: "90%", backgroundColor: c.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: c.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: c.text }}>Remove Medication</Text>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)}>
                <Ionicons name="close" size={24} color={c.sub} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: c.sub, marginBottom: 16, lineHeight: 18 }}>
              Please select or type a reason for removing <Text style={{ fontWeight: "700", color: c.text }}>{medicine.name}</Text>. This reason will be logged in your medication history.
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
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: isSelected ? c.accent : c.border,
                      backgroundColor: isSelected ? c.accent + "10" : c.card,
                    }}
                    onPress={() => {
                      setSelectedPreset(preset);
                      setDeleteReason(preset);
                    }}
                  >
                    <Text style={{ fontSize: 13, color: isSelected ? c.accent : c.text, fontWeight: isSelected ? "600" : "400" }}>
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
                borderRadius: 10,
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
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={{ color: c.sub, fontWeight: "600", fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
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
                <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 14 }}>Confirm Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
