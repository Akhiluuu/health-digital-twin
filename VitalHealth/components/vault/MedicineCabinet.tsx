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
import { useThemeAlert } from "../../context/ThemeAlertContext";
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
  const { showAlert, showToast } = useThemeAlert();

  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null);

  const formatDateRange = (med: Medicine) => {
    const start = med.startDate ? new Date(med.startDate).toLocaleDateString() : "N/A";
    const end = med.endDate && med.endDate !== "ongoing" ? new Date(med.endDate).toLocaleDateString() : "Ongoing";
    return `${start} — ${end}`;
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
      {/* Active Medications Header */}
      <View style={styles.cabinetHeaderRow}>
        <Text style={styles.cabinetSectionTitle}>Active Medications</Text>
        <TouchableOpacity
          style={styles.actionPillButton}
          onPress={onNavigateToAdd}
        >
          <Ionicons name="add" size={18} color="#ffffff" />
          <Text style={styles.actionPillText}>Add Med</Text>
        </TouchableOpacity>
      </View>

      {medicines.length === 0 ? (
        <View style={styles.nextDoseCardPlaceholder}>
          <Ionicons name="medical-outline" size={36} color={c.sub} />
          <Text style={styles.placeholderTitle}>Cabinet is Empty</Text>
          <Text style={styles.placeholderSub}>Add medications to view them in your cabinet.</Text>
          <TouchableOpacity
            style={[styles.actionPillButton, { marginTop: 16, paddingHorizontal: 18, paddingVertical: 10 }]}
            onPress={onNavigateToAdd}
          >
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={{ color: "#ffffff", fontWeight: "800", fontSize: 13 }}>Add Medication</Text>
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
                  borderColor: lowStock ? "#ef4444" : c.border,
                  borderWidth: lowStock ? 1.5 : 1,
                  paddingVertical: 14,
                },
              ]}
              onPress={() => onSelectMedicine(med)}
              activeOpacity={0.7}
            >
              <PillAvatar type={med.type} color={meta.color || c.accent} size={38} />
              
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.regimenCardName}>{med.name}</Text>
                  {lowStock && (
                    <View style={styles.lowStockBadge}>
                      <Text style={styles.lowStockTxt}>LOW STOCK</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.regimenCardDetails}>
                  {med.dose} · {meta.strength || ""}
                </Text>
                <Text style={{ fontSize: 11, color: c.sub, marginTop: 3 }}>
                  Duration: {formatDateRange(med)}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.refillButton,
                  { backgroundColor: lowStock ? "#ef4444" : c.accent },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  showAlert({
                    title: "Order Refill",
                    message: `Do you want to send a refill request for ${med.name} to ${meta.doctor || "your doctor"}?`,
                    type: "info",
                    buttons: [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Request Refill",
                        onPress: () => {
                          showToast({ message: `Refill request sent for ${med.name} 💊`, type: "success" });
                        },
                      },
                    ],
                  });
                }}
              >
                <Text style={styles.refillButtonTxt}>Refill</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })
      )}

      {/* Prescription Document Repository */}
      <View style={[styles.cabinetHeaderRow, { marginTop: 22 }]}>
        <Text style={styles.cabinetSectionTitle}>Scanned Prescriptions</Text>
        <TouchableOpacity
          style={[styles.actionPillButton, { backgroundColor: c.card, borderWidth: 1, borderColor: c.accent }]}
          onPress={onScanPrescription}
        >
          <Ionicons name="camera" size={16} color={c.accent} />
          <Text style={[styles.actionPillText, { color: c.accent }]}>Scan Rx</Text>
        </TouchableOpacity>
      </View>

      {prescriptions.length === 0 ? (
        <View style={styles.nextDoseCardPlaceholder}>
          <Ionicons name="document-text-outline" size={36} color={c.sub} />
          <Text style={styles.placeholderTitle}>No Saved Documents</Text>
          <Text style={styles.placeholderSub}>Snap a photo of your doctor's order sheet to extract schedules.</Text>
        </View>
      ) : (
        prescriptions.map((pres) => (
          <TouchableOpacity
            key={pres.id}
            style={[styles.regimenCard, { paddingVertical: 14 }]}
            onPress={() => setSelectedPrescription(pres)}
            activeOpacity={0.7}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent + "15", justifyContent: "center", alignItems: "center" }}>
              <Ionicons name="document-text" size={24} color={c.accent} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.regimenCardName} numberOfLines={1}>
                {pres.file_name || pres.fileName || "Scanned Prescription"}
              </Text>
              <Text style={styles.regimenCardDetails} numberOfLines={1}>
                {pres.doctor_name || pres.doctor || "Unknown Doctor"} · {pres.hospital || "Facility"}
              </Text>
            </View>
            <View style={{ backgroundColor: "#22c55e15", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}>
              <Text style={{ color: "#22c55e", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>VERIFIED</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      {/* Prescription View Modal */}
      {selectedPrescription && (
        <Modal transparent animationType="slide" visible={!!selectedPrescription}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={styles.treatmentTitle}>Prescription Dossier</Text>
                <TouchableOpacity onPress={() => setSelectedPrescription(null)}>
                  <Ionicons name="close" size={24} color={c.text} />
                </TouchableOpacity>
              </View>

              <View style={{ backgroundColor: c.bg, padding: 14, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: c.border }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: c.accent, marginBottom: 6, letterSpacing: 0.5 }}>EXTRACTED OCR LOG</Text>
                <Text style={{ fontSize: 13, color: c.text, lineHeight: 18 }}>
                  {selectedPrescription.raw_ocr_text || selectedPrescription.summary || "No OCR logs loaded."}
                </Text>
              </View>

              <View style={{ gap: 10, marginBottom: 24 }}>
                <Text style={{ color: c.sub, fontSize: 13 }}>Doctor: <Text style={{ fontWeight: "700", color: c.text }}>{selectedPrescription.doctor_name || selectedPrescription.doctor || "Unknown"}</Text></Text>
                <Text style={{ color: c.sub, fontSize: 13 }}>Facility: <Text style={{ fontWeight: "700", color: c.text }}>{selectedPrescription.hospital || "Unknown"}</Text></Text>
                <Text style={{ color: c.sub, fontSize: 13 }}>Date Logged: <Text style={{ fontWeight: "700", color: c.text }}>{selectedPrescription.created_at ? new Date(selectedPrescription.created_at).toLocaleDateString() : "N/A"}</Text></Text>
              </View>

              <TouchableOpacity
                style={styles.reorderButton}
                onPress={() => setSelectedPrescription(null)}
              >
                <Text style={styles.reorderTxt}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}
