import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import PillAvatar from "./shared/PillAvatar";
import { getVaultStyles } from "./shared/VaultStyles";
import { Medicine } from "../../context/MedicineContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";

interface MedicineCabinetProps {
  medicines: Medicine[];
  metadataCache: Record<number, any>;
  prescriptions: any[];
  onSelectMedicine: (med: Medicine) => void;
  onScanPrescription: () => void;
  onNavigateToAdd: () => void;
}

export default function MedicineCabinet({
  medicines,
  metadataCache,
  prescriptions,
  onSelectMedicine,
  onScanPrescription,
  onNavigateToAdd,
}: MedicineCabinetProps) {
  const { theme } = useTheme();
  const c = colors[theme];
  const styles = getVaultStyles(c);

  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null);

  const formatDateRange = (med: Medicine) => {
    const start = med.startDate ? new Date(med.startDate).toLocaleDateString() : "N/A";
    const end = med.endDate && med.endDate !== "ongoing" ? new Date(med.endDate).toLocaleDateString() : "Ongoing";
    return `${start} — ${end}`;
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Active Medications</Text>
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.accent,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            gap: 4
          }}
          onPress={onNavigateToAdd}
        >
          <Ionicons name="add" size={16} color="#ffffff" />
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 11 }}>Add Med</Text>
        </TouchableOpacity>
      </View>

      {medicines.length === 0 ? (
        <View style={styles.nextDoseCardPlaceholder}>
          <Ionicons name="medical-outline" size={32} color={c.sub} />
          <Text style={styles.placeholderTitle}>Cabinet is Empty</Text>
          <Text style={styles.placeholderSub}>Add medications to view them in your cabinet.</Text>
          <TouchableOpacity
            style={{
              marginTop: 14,
              backgroundColor: c.accent,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 6
            }}
            onPress={onNavigateToAdd}
          >
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 13 }}>Add Medication</Text>
          </TouchableOpacity>
        </View>
      ) : (
        medicines.map((med) => {
          const meta = metadataCache[med.id] || {};
          const count = meta.inventoryCount || 0;
          const lowStock = count <= 7;

          return (
            <TouchableOpacity
              key={med.id}
              style={[
                styles.regimenCard,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  borderColor: lowStock ? "#ef4444" : c.border,
                  borderWidth: lowStock ? 1.5 : 1,
                  paddingVertical: 12,
                  marginBottom: 10,
                },
              ]}
              onPress={() => onSelectMedicine(med)}
            >
              <PillAvatar type={med.type} color={meta.color || c.accent} size={36} />
              
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.regimenCardName}>{med.name}</Text>
                  {lowStock && (
                    <View style={{ backgroundColor: "#ef444420", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: "#ef4444", fontSize: 9, fontWeight: "800" }}>LOW STOCK</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regimenCardDetails}>
                  {med.dose} · {meta.strength || ""}
                </Text>
                <Text style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>
                  Duration: {formatDateRange(med)}
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: lowStock ? "#ef4444" : c.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginRight: 6,
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert(
                    "Order Refill",
                    `Do you want to send a refill request for ${med.name} to ${meta.doctor || "your doctor"}?`
                  );
                }}
              >
                <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "700" }}>Refill</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      )}

      {/* Prescription Document Repository */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 }}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Scanned Prescriptions</Text>
        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}
          onPress={onScanPrescription}
        >
          <Ionicons name="camera" size={16} color="#ffffff" />
          <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 11 }}>Scan Rx</Text>
        </TouchableOpacity>
      </View>

      {prescriptions.length === 0 ? (
        <View style={styles.nextDoseCardPlaceholder}>
          <Ionicons name="document-text-outline" size={32} color={c.sub} />
          <Text style={styles.placeholderTitle}>No Saved Documents</Text>
          <Text style={styles.placeholderSub}>Snap a photo of your doctor's order sheet to upload.</Text>
        </View>
      ) : (
        prescriptions.map((pres) => (
          <TouchableOpacity
            key={pres.id}
            style={[styles.regimenCard, { paddingVertical: 12 }]}
            onPress={() => setSelectedPrescription(pres)}
          >
            <Ionicons name="document-text" size={30} color={c.accent} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.regimenCardName} numberOfLines={1}>
                {pres.file_name || pres.fileName || "Scanned Prescription"}
              </Text>
              <Text style={styles.regimenCardDetails} numberOfLines={1}>
                {pres.doctor_name || pres.doctor || "Unknown Doctor"} · {pres.hospital || "Facility"}
              </Text>
            </View>
            <View style={{ backgroundColor: "#22c55e15", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ color: "#22c55e", fontSize: 10, fontWeight: "700" }}>Verified</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Prescription View Modal */}
      {selectedPrescription && (
        <Modal transparent animationType="slide" visible={!!selectedPrescription}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Text style={styles.treatmentTitle}>Prescription Document Details</Text>
                <TouchableOpacity onPress={() => setSelectedPrescription(null)}>
                  <Ionicons name="close" size={24} color={c.text} />
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: c.border, padding: 12, borderRadius: 10, marginBottom: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: c.accent, marginBottom: 6 }}>EXTRACTED RAW TEXT</Text>
                <Text style={{ fontSize: 12, color: c.text, lineHeight: 16 }}>
                  {selectedPrescription.raw_ocr_text || selectedPrescription.summary || "No OCR logs loaded."}
                </Text>
              </View>

              <View style={{ gap: 8, marginBottom: 20 }}>
                <Text style={{ color: c.sub, fontSize: 13 }}>Doctor: <Text style={{ fontWeight: "700", color: c.text }}>{selectedPrescription.doctor_name || selectedPrescription.doctor || "Unknown"}</Text></Text>
                <Text style={{ color: c.sub, fontSize: 13 }}>Hospital: <Text style={{ fontWeight: "700", color: c.text }}>{selectedPrescription.hospital || "Unknown"}</Text></Text>
                <Text style={{ color: c.sub, fontSize: 13 }}>Uploaded: <Text style={{ fontWeight: "700", color: c.text }}>{selectedPrescription.created_at ? new Date(selectedPrescription.created_at).toLocaleDateString() : "N/A"}</Text></Text>
              </View>

              <TouchableOpacity
                style={[styles.reorderButton, { height: 44, justifyContent: "center", alignItems: "center" }]}
                onPress={() => setSelectedPrescription(null)}
              >
                <Text style={styles.reorderTxt}>Dismiss View</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}
