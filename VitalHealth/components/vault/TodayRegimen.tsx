import React, { useMemo } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import PillAvatar from "./shared/PillAvatar";
import { getVaultStyles } from "./shared/VaultStyles";
import { Medicine } from "../../context/MedicineContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";
import { getLocalDateString } from "../../utils/twinUtils";

interface TodayRegimenProps {
  medicines: Medicine[];
  metadataCache: Record<number, any>;
  selfProfile: any;
  activeProfile: any;
  isSwitched: boolean;
  members: any[];
  switchToMember: (uid: string) => void;
  switchToSelf: () => void;
  onLogDose: (med: Medicine, status: "taken" | "missed") => Promise<void>;
  onDelayDose: (med: Medicine) => Promise<void>;
  onSelectMedicine: (med: Medicine) => void;
  onNavigateToAdd: () => void;
  onNavigateToTab: (tab: any) => void;
}

export default function TodayRegimen({
  medicines,
  metadataCache,
  selfProfile,
  activeProfile,
  isSwitched,
  members,
  switchToMember,
  switchToSelf,
  onLogDose,
  onDelayDose,
  onSelectMedicine,
  onNavigateToAdd,
  onNavigateToTab,
}: TodayRegimenProps) {
  const { theme } = useTheme();
  const c = colors[theme];
  const styles = getVaultStyles(c);

  const todayStr = getLocalDateString();

  // Filter medicines active today based on date range
  const activeMedsToday = useMemo(() => {
    return medicines.filter((med) => {
      if (med.startDate && todayStr < med.startDate) {
        return false;
      }
      if (med.endDate && med.endDate !== "ongoing" && todayStr > med.endDate) {
        return false;
      }
      return true;
    });
  }, [medicines, todayStr]);

  // Filter daily and PRN medicines
  const { dailyMeds, prnMeds } = useMemo(() => {
    const daily = activeMedsToday.filter((m) => m.frequency.toLowerCase() !== "as-needed");
    const prn = activeMedsToday.filter((m) => m.frequency.toLowerCase() === "as-needed");
    return { dailyMeds: daily, prnMeds: prn };
  }, [activeMedsToday]);

  // Adherence Calculations
  const stats = useMemo(() => {
    const total = dailyMeds.length;
    const taken = dailyMeds.filter((m) => m.taken === 1).length;
    const missed = dailyMeds.filter((m) => m.taken === -1).length;
    const remaining = total - taken - missed;
    const complianceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

    return { total, taken, missed, remaining, complianceRate };
  }, [dailyMeds]);

  // Next Upcoming Dose
  const nextDose = useMemo(() => {
    const pending = dailyMeds.filter((m) => m.taken === 0);
    if (pending.length === 0) return null;
    return [...pending].sort((a, b) => {
      const [hA, mA] = a.time.split(":").map(Number);
      const [hB, mB] = b.time.split(":").map(Number);
      return hA * 60 + mA - (hB * 60 + mB);
    })[0];
  }, [dailyMeds]);

  // Group daily meds by timeslot
  const timeSlots = useMemo(() => {
    const slots: Record<string, Medicine[]> = {
      Morning: [],
      Afternoon: [],
      Evening: [],
      Night: [],
    };

    dailyMeds.forEach((med) => {
      const [hour] = med.time.split(":").map(Number);
      if (hour >= 6 && hour < 12) slots.Morning.push(med);
      else if (hour >= 12 && hour < 17) slots.Afternoon.push(med);
      else if (hour >= 17 && hour < 21) slots.Evening.push(med);
      else slots.Night.push(med);
    });

    return slots;
  }, [dailyMeds]);

  return (
    <View style={{ flex: 1 }}>
      {/* Care Circle Profile Row - Hidden unless actively switched or managing family profiles */}
      {isSwitched && (
        <View style={styles.careCircleContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
            {/* Self */}
            <TouchableOpacity
              style={styles.avatarTouch}
              onPress={() => {
                switchToSelf();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <View
                style={[
                  styles.avatarRing,
                  {
                    borderColor: !isSwitched ? c.accent : c.border,
                    backgroundColor: !isSwitched ? c.accent : c.card,
                  },
                ]}
              >
                <Text style={[styles.avatarLetter, { color: !isSwitched ? "#fff" : c.text }]}>
                  {selfProfile?.firstName?.charAt(0) || "U"}
                </Text>
              </View>
              <Text
                style={[
                  styles.avatarName,
                  {
                    color: !isSwitched ? c.accent : c.sub,
                    fontWeight: !isSwitched ? "700" : "500",
                  },
                ]}
              >
                {selfProfile?.firstName || "Me"}
              </Text>
            </TouchableOpacity>

            {/* Members */}
            {members.map((member) => {
              const isSelected = isSwitched && activeProfile?.uid === member.uid;
              return (
                <TouchableOpacity
                  key={member.uid}
                  style={styles.avatarTouch}
                  onPress={() => {
                    switchToMember(member.uid);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <View
                    style={[
                      styles.avatarRing,
                      {
                        borderColor: isSelected ? c.accent : c.border,
                        backgroundColor: isSelected ? c.accent : c.card,
                      },
                    ]}
                  >
                    <Text style={[styles.avatarLetter, { color: isSelected ? "#fff" : c.text }]}>
                      {member.firstName?.charAt(0) || "F"}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.avatarName,
                      {
                        color: isSelected ? c.accent : c.sub,
                        fontWeight: isSelected ? "700" : "500",
                      },
                    ]}
                  >
                    {member.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollPadding}>
        {medicines.length === 0 ? (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 80 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.accent + "15", justifyContent: "center", alignItems: "center", marginBottom: 20 }}>
              <Ionicons name="medical" size={40} color={c.accent} />
            </View>
            <Text style={[styles.placeholderTitle, { fontSize: 20, fontWeight: "700", marginBottom: 8, color: c.text }]}>Start Your Medication Vault</Text>
            <Text style={[styles.placeholderSub, { textAlign: "center", paddingHorizontal: 40, marginBottom: 24, color: c.sub, lineHeight: 18 }]}>
              Keep track of your active prescriptions, schedules, and digital twin simulation connections.
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: c.accent,
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                elevation: 3,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
              onPress={onNavigateToAdd}
            >
              <Ionicons name="add" size={20} color="#ffffff" />
              <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15 }}>Add Medication</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Highlighted Premium Adherence Score Display */}
            <LinearGradient
              colors={theme === "light" ? ["#3b82f6", "#1d4ed8"] : ["#1e293b", "#0f172a"]}
              style={{
                borderRadius: 20,
                padding: 20,
                marginBottom: 20,
                elevation: 4,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
              }}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 11, fontWeight: "800", color: theme === "light" ? "#bfdbfe" : c.accent, letterSpacing: 0.5 }}>
                    DAILY REGIMEN ADHERENCE
                  </Text>
                  <Text style={{ fontSize: 24, fontWeight: "800", color: "#ffffff", marginTop: 4 }}>
                    {stats.complianceRate}% Compliance
                  </Text>
                  <Text style={{ fontSize: 13, color: theme === "light" ? "#eff6ff" : c.sub, marginTop: 8, lineHeight: 18 }}>
                    {stats.complianceRate === 100
                      ? "🏆 Perfect compliance! Excellent job."
                      : stats.complianceRate >= 80
                      ? "👍 Great job! You are staying right on track."
                      : "⚠️ Don't forget to log your remaining doses today."}
                  </Text>
                </View>

                {/* Circular Badge Display */}
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: "rgba(255, 255, 255, 0.15)",
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 2,
                    borderColor: stats.complianceRate >= 80 ? "#22c55e" : "#f59e0b",
                  }}
                >
                  <Ionicons
                    name={stats.complianceRate === 100 ? "trophy" : "heart"}
                    size={28}
                    color={stats.complianceRate >= 80 ? "#4ade80" : "#fbbf24"}
                  />
                </View>
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: "rgba(255, 255, 255, 0.15)", marginVertical: 16 }} />

              {/* Stat Badges Grid */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                {/* Taken Badge */}
                <View style={{ flex: 1, backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: 12, padding: 10, alignItems: "center" }}>
                  <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
                  <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15, marginTop: 4 }}>{stats.taken}</Text>
                  <Text style={{ color: theme === "light" ? "#dbeafe" : c.sub, fontSize: 10, fontWeight: "600", marginTop: 2 }}>Taken</Text>
                </View>

                {/* Remaining/Pending Badge */}
                <View style={{ flex: 1, backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: 12, padding: 10, alignItems: "center" }}>
                  <Ionicons name="time" size={18} color="#60a5fa" />
                  <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15, marginTop: 4 }}>{stats.remaining}</Text>
                  <Text style={{ color: theme === "light" ? "#dbeafe" : c.sub, fontSize: 10, fontWeight: "600", marginTop: 2 }}>Pending</Text>
                </View>

                {/* Missed Badge */}
                <View style={{ flex: 1, backgroundColor: "rgba(255, 255, 255, 0.1)", borderRadius: 12, padding: 10, alignItems: "center" }}>
                  <Ionicons name="close-circle" size={18} color="#f87171" />
                  <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 15, marginTop: 4 }}>{stats.missed}</Text>
                  <Text style={{ color: theme === "light" ? "#dbeafe" : c.sub, fontSize: 10, fontWeight: "600", marginTop: 2 }}>Missed</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Next Scheduled Medicine Card */}
            {nextDose ? (
              <LinearGradient
                colors={theme === "light" ? ["#2563eb", "#1d4ed8"] : ["#1e294b", "#0f172a"]}
                style={styles.nextDoseCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.nextDoseHeader}>
                  <View style={styles.nextDoseBadge}>
                    <Text style={styles.nextDoseBadgeText}>UPCOMING DOSE</Text>
                  </View>
                  <Text style={styles.nextDoseTime}>Scheduled: {nextDose.time}</Text>
                </View>

                <View style={styles.nextDoseMain}>
                  <View style={styles.nextDosePillContainer}>
                    <PillAvatar
                      type={nextDose.type}
                      color={metadataCache[nextDose.id]?.color || "#ffffff"}
                      size={32}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.nextDoseName}>{nextDose.name}</Text>
                    <Text style={styles.nextDoseDose}>
                      {nextDose.dose} · {metadataCache[nextDose.id]?.strength || ""}
                    </Text>
                    <Text style={styles.nextDoseReason}>
                      Purpose: {metadataCache[nextDose.id]?.purpose || "General Therapy"}
                    </Text>
                  </View>
                </View>

                <View style={styles.nextDoseActions}>
                  <TouchableOpacity
                    style={[styles.nextActionBtn, { backgroundColor: "#22c55e" }]}
                    onPress={() => {
                      onLogDose(nextDose, "taken");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }}
                  >
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                    <Text style={styles.nextActionTxt}>Take Now</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.nextActionBtn, { backgroundColor: "#ef4444" }]}
                    onPress={() => {
                      onLogDose(nextDose, "missed");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    }}
                  >
                    <Ionicons name="close" size={16} color="#ffffff" />
                    <Text style={styles.nextActionTxt}>Skip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.nextActionBtn, { backgroundColor: "rgba(255, 255, 255, 0.15)" }]}
                    onPress={() => onDelayDose(nextDose)}
                  >
                    <Ionicons name="time-outline" size={16} color="#ffffff" />
                    <Text style={styles.nextActionTxt}>Delay 15m</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.nextDoseCardPlaceholder}>
                <Ionicons name="checkmark-circle" size={32} color="#22c55e" />
                <Text style={styles.placeholderTitle}>All Doses Logged!</Text>
                <Text style={styles.placeholderSub}>Your schedule is completely clear for today.</Text>
              </View>
            )}

            {/* Regimen Chronological Windows */}
            <Text style={styles.sectionTitle}>Today's Schedule</Text>
            {Object.entries(timeSlots).map(([slot, meds]) => {
              if (meds.length === 0) return null;
              return (
                <View key={slot} style={styles.regimenSlotContainer}>
                  <Text style={styles.regimenSlotTitle}>{slot}</Text>
                  {meds.map((med) => {
                    const meta = metadataCache[med.id] || {};
                    const taken = med.taken === 1;
                    const missed = med.taken === -1;

                    return (
                      <TouchableOpacity
                        key={med.id}
                        style={styles.regimenCard}
                        onPress={() => onSelectMedicine(med)}
                      >
                        <PillAvatar type={med.type} color={meta.color || c.accent} size={36} />
                        <View style={styles.regimenCardContent}>
                          <Text style={styles.regimenCardName}>{med.name}</Text>
                          <Text style={styles.regimenCardDetails}>
                            {med.dose} · {meta.strength || ""} · {med.time}
                          </Text>
                          {meta.purpose && (
                            <Text style={styles.regimenCardInstructions}>{meta.purpose}</Text>
                          )}
                        </View>

                        {taken ? (
                          <View style={{ backgroundColor: "#22c55e20", padding: 8, borderRadius: 8 }}>
                            <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                          </View>
                        ) : missed ? (
                          <View style={{ backgroundColor: "#ef444420", padding: 8, borderRadius: 8 }}>
                            <Ionicons name="close-circle" size={20} color="#ef4444" />
                          </View>
                        ) : (
                          <View style={styles.regimenCardActions}>
                            <TouchableOpacity
                              style={styles.logButton}
                              onPress={() => onLogDose(med, "taken")}
                            >
                              <Text style={styles.logButtonTxt}>Log</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.skipButton}
                              onPress={() => onLogDose(med, "missed")}
                            >
                              <Text style={[styles.skipButtonTxt, { color: c.sub }]}>Skip</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}

            {/* PRN Section */}
            {prnMeds.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.sectionTitle}>As-Needed (PRN)</Text>
                {prnMeds.map((med) => {
                  const meta = metadataCache[med.id] || {};
                  return (
                    <View key={med.id} style={styles.regimenCard}>
                      <PillAvatar type={med.type} color={meta.color || c.accent} size={36} />
                      <View style={styles.regimenCardContent}>
                        <Text style={styles.regimenCardName}>{med.name}</Text>
                        <Text style={styles.regimenCardDetails}>
                          {med.dose} · {meta.strength || ""} · Take as needed
                        </Text>
                        {meta.purpose && (
                          <Text style={styles.regimenCardInstructions}>{meta.purpose}</Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.logButton, { backgroundColor: c.accent }]}
                        onPress={() => onLogDose(med, "taken")}
                      >
                        <Text style={styles.logButtonTxt}>Take</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
