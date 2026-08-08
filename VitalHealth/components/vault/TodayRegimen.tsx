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
    const slots: Record<string, { label: string; meds: Medicine[] }> = {
      Morning: { label: "Morning (6 AM - 12 PM)", meds: [] },
      Afternoon: { label: "Afternoon (12 PM - 5 PM)", meds: [] },
      Evening: { label: "Evening (5 PM - 9 PM)", meds: [] },
      Night: { label: "Night (9 PM - 6 AM)", meds: [] },
    };

    dailyMeds.forEach((med) => {
      const [hour] = med.time.split(":").map(Number);
      if (hour >= 6 && hour < 12) slots.Morning.meds.push(med);
      else if (hour >= 12 && hour < 17) slots.Afternoon.meds.push(med);
      else if (hour >= 17 && hour < 21) slots.Evening.meds.push(med);
      else slots.Night.meds.push(med);
    });

    return slots;
  }, [dailyMeds]);

  const isDark = theme === "dark";

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
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
            <View
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                backgroundColor: c.accent + "18",
                borderWidth: 1.5,
                borderColor: c.accent + "30",
                justifyContent: "center",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <Ionicons name="medical" size={42} color={c.accent} />
            </View>
            <Text style={[styles.placeholderTitle, { fontSize: 22, fontWeight: "800", marginBottom: 8, color: c.text }]}>
              Medication Vault Empty
            </Text>
            <Text style={[styles.placeholderSub, { textAlign: "center", paddingHorizontal: 36, marginBottom: 28, color: c.sub, lineHeight: 20 }]}>
              Log your active prescriptions, schedules, and digital twin simulation links for total health tracking.
            </Text>
            <TouchableOpacity
              style={[styles.actionPillButton, { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 28 }]}
              onPress={onNavigateToAdd}
            >
              <Ionicons name="add" size={22} color="#ffffff" />
              <Text style={{ color: "#ffffff", fontWeight: "800", fontSize: 16 }}>Add Medication</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Highlighted Hero Glassmorphic Adherence Card */}
            <LinearGradient
              colors={isDark ? ["#111d3a", "#0b1329"] : ["#2563eb", "#1d4ed8"]}
              style={styles.heroCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={[styles.heroBadgeLabel, { color: isDark ? c.accent : "#bfdbfe" }]}>
                    DAILY REGIMEN ADHERENCE
                  </Text>
                  <Text style={styles.heroTitle}>
                    {stats.complianceRate}% Compliance
                  </Text>
                  <Text style={[styles.heroSub, { color: isDark ? c.sub : "#eff6ff" }]}>
                    {stats.complianceRate === 100
                      ? "🏆 Perfect compliance! All doses taken."
                      : stats.complianceRate >= 80
                      ? "👍 Excellent progress! Staying right on track."
                      : "⚠️ Don't forget to log remaining doses today."}
                  </Text>
                </View>

                {/* Circular Badge Display */}
                <View
                  style={[
                    styles.heroRing,
                    {
                      borderColor: stats.complianceRate >= 80 ? "#22c55e" : "#f59e0b",
                    },
                  ]}
                >
                  <Ionicons
                    name={stats.complianceRate === 100 ? "trophy" : "heart"}
                    size={30}
                    color={stats.complianceRate >= 80 ? "#4ade80" : "#fbbf24"}
                  />
                </View>
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: "rgba(255, 255, 255, 0.15)", marginVertical: 16 }} />

              {/* Stat Badges Grid */}
              <View style={styles.statBadgesRow}>
                {/* Taken Badge */}
                <View style={styles.statBadgeItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#4ade80" />
                  <Text style={styles.statBadgeVal}>{stats.taken}</Text>
                  <Text style={[styles.statBadgeLbl, { color: isDark ? c.sub : "#dbeafe" }]}>Taken</Text>
                </View>

                {/* Remaining/Pending Badge */}
                <View style={styles.statBadgeItem}>
                  <Ionicons name="time" size={20} color="#60a5fa" />
                  <Text style={styles.statBadgeVal}>{stats.remaining}</Text>
                  <Text style={[styles.statBadgeLbl, { color: isDark ? c.sub : "#dbeafe" }]}>Pending</Text>
                </View>

                {/* Missed Badge */}
                <View style={styles.statBadgeItem}>
                  <Ionicons name="close-circle" size={20} color="#f87171" />
                  <Text style={styles.statBadgeVal}>{stats.missed}</Text>
                  <Text style={[styles.statBadgeLbl, { color: isDark ? c.sub : "#dbeafe" }]}>Missed</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Next Scheduled Medicine Spotlight Card */}
            {nextDose ? (
              <LinearGradient
                colors={isDark ? ["#1e294b", "#0f172a"] : ["#3b82f6", "#1d4ed8"]}
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
                      size={34}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.nextDoseName}>{nextDose.name}</Text>
                    <Text style={styles.nextDoseDose}>
                      {nextDose.dose} · {metadataCache[nextDose.id]?.strength || ""}
                    </Text>
                    <Text style={styles.nextDoseReason} numberOfLines={1}>
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
                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                    <Text style={styles.nextActionTxt}>Take Now</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.nextActionBtn, { backgroundColor: "#ef4444" }]}
                    onPress={() => {
                      onLogDose(nextDose, "missed");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    }}
                  >
                    <Ionicons name="close" size={18} color="#ffffff" />
                    <Text style={styles.nextActionTxt}>Skip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.nextActionBtn, { backgroundColor: "rgba(255, 255, 255, 0.18)" }]}
                    onPress={() => onDelayDose(nextDose)}
                  >
                    <Ionicons name="time-outline" size={18} color="#ffffff" />
                    <Text style={styles.nextActionTxt}>Delay 15m</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            ) : (
              <View style={styles.nextDoseCardPlaceholder}>
                <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
                <Text style={styles.placeholderTitle}>All Doses Logged!</Text>
                <Text style={styles.placeholderSub}>Your schedule is completely clear for today.</Text>
              </View>
            )}

            {/* Regimen Chronological Windows */}
            <Text style={styles.sectionTitle}>Today's Schedule</Text>
            {Object.entries(timeSlots).map(([slotKey, { label, meds }]) => {
              if (meds.length === 0) return null;
              return (
                <View key={slotKey} style={styles.regimenSlotContainer}>
                  <Text style={styles.regimenSlotTitle}>{label}</Text>
                  {meds.map((med) => {
                    const meta = metadataCache[med.id] || {};
                    const taken = med.taken === 1;
                    const missed = med.taken === -1;

                    return (
                      <TouchableOpacity
                        key={med.id}
                        style={styles.regimenCard}
                        onPress={() => onSelectMedicine(med)}
                        activeOpacity={0.7}
                      >
                        <PillAvatar type={med.type} color={meta.color || c.accent} size={38} />
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
                          <View style={{ backgroundColor: "#22c55e20", padding: 10, borderRadius: 12 }}>
                            <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
                          </View>
                        ) : missed ? (
                          <View style={{ backgroundColor: "#ef444420", padding: 10, borderRadius: 12 }}>
                            <Ionicons name="close-circle" size={22} color="#ef4444" />
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

            {/* PRN As-Needed Section */}
            {prnMeds.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.sectionTitle}>As-Needed (PRN)</Text>
                {prnMeds.map((med) => {
                  const meta = metadataCache[med.id] || {};
                  return (
                    <View key={med.id} style={styles.regimenCard}>
                      <PillAvatar type={med.type} color={meta.color || c.accent} size={38} />
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
