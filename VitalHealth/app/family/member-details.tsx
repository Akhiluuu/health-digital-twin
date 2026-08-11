// app/family/member-details.tsx
// Production member details screen with:
// – Live Firestore subscription for real-time health updates
// – Theme support
// – Profile-switch CTA
// – Proper "Switch Profile" button to view everything in their context
// – Dependent profile editing and BioGears Twin recalibration directly from the details page
// – Option to unlink/remove the member directly

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
} from "react-native";
let Clipboard: { setString: (text: string) => void } = {
  setString: (text: string) => {
    try {
      const ExpoClipboard = require("expo-clipboard");
      ExpoClipboard.setStringAsync(text);
    } catch {
      try {
        const NativeClipboard = require("@react-native-clipboard/clipboard").default;
        NativeClipboard.setString(text);
      } catch {}
    }
  },
};
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";

import { useFamily } from "../../context/FamilyContext";
import { useTheme } from "../../context/ThemeContext";
import { colors as globalColors } from "../../theme/colors";
import {
  fetchMemberHealthData,
  subscribeToMemberHealth,
  updateDependentProfile,
} from "../../services/familySync";
import { registerTwin } from "../../services/biogears";
import { getTwinId } from "../../utils/twinUtils";
import { FamilyMember } from "../../types/FamilyMember";
import { useStackBackHandler } from "../../hooks/useStackBackHandler";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAge(dob?: any): string {
  if (!dob || typeof dob !== "string") return "--";
  try {
    let date: Date;
    if (dob.includes("/")) {
      const [d, m, y] = dob.split("/").map(Number);
      date = new Date(y < 100 ? 2000 + y : y, m - 1, d);
    } else {
      date = new Date(dob);
    }
    const age = Math.floor(
      (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000)
    );
    return age > 0 && age < 130 ? `${age}` : "--";
  } catch {
    return "--";
  }
}

function getInitials(member: Partial<FamilyMember>): string {
  const first = (member.firstName ?? "").charAt(0).toUpperCase();
  const last  = (member.lastName  ?? "").charAt(0).toUpperCase();
  return first + last || "?";
}

const MONTHS = [
  { label: "January", value: "01" },
  { label: "February", value: "02" },
  { label: "March", value: "03" },
  { label: "April", value: "04" },
  { label: "May", value: "05" },
  { label: "June", value: "06" },
  { label: "July", value: "07" },
  { label: "August", value: "08" },
  { label: "September", value: "09" },
  { label: "October", value: "10" },
  { label: "November", value: "11" },
  { label: "December", value: "12" },
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 121 }, (_, i) => String(CURRENT_YEAR - i));

const daysInMonth = (year: string, month: string) => {
  const y = parseInt(year, 10) || CURRENT_YEAR;
  const m = parseInt(month, 10) || 1;
  return new Date(y, m, 0).getDate();
};

const monthLabel = (value: string) => MONTHS.find((m) => m.value === value)?.label || "";

type PickerType = null | "year" | "month" | "day" | "bloodGroup";

// ─── Reusable Section ─────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
  c,
  rightAction,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  c: any;
  rightAction?: () => void;
}) {
  return (
    <View style={[styles.section, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
          <View style={[styles.sectionIconBg, { backgroundColor: c.accent + "18" }]}>
            <Ionicons name={icon} size={16} color={c.accent} />
          </View>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
        </View>
        {rightAction ? (
          <TouchableOpacity onPress={rightAction} style={{ padding: 4 }}>
            <Ionicons name="create-outline" size={18} color={c.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  value,
  icon,
  c,
  onPress,
  rightIcon,
}: {
  label: string;
  value: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  c: any;
  onPress?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      style={[styles.infoRow, { borderBottomColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.infoLabel, { color: c.sub }]}>{label}</Text>
      <View style={styles.infoValueRow}>
        {icon ? (
          <MaterialCommunityIcons name={icon} size={14} color={c.sub} style={{ marginRight: 4 }} />
        ) : null}
        <Text style={[styles.infoValue, { color: c.text, marginRight: rightIcon ? 6 : 0 }]}>{value}</Text>
        {rightIcon ? (
          <Ionicons name={rightIcon} size={15} color={c.active} />
        ) : null}
      </View>
    </Container>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MemberDetailsScreen() {
  useStackBackHandler();
  const { theme } = useTheme();
  const c = globalColors[theme];

  // ── Custom Alert State ──────────────────────────────────────────────────────
  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[];
  } | null>(null);

  const Alert = {
    alert: (
      title: string,
      message?: string,
      buttons?: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[]
    ) => {
      setCustomAlert({
        visible: true,
        title,
        message: message || "",
        buttons: buttons || [{ text: "OK" }],
      });
    }
  };

  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const memberId = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";

  const {
    members,
    getMemberById,
    isLoaded,
    switchToMember,
    isSwitched,
    activeMemberId,
    switchToSelf,
    removeMember,
    refreshMembers,
  } = useFamily();

  // Base member from context (has name/relation but may lack live health data)
  const baseMember = getMemberById(memberId) ??
    members.find((m) => m.id?.toString() === memberId || m.uid?.toString() === memberId);

  const memberUid = baseMember?.uid ?? baseMember?.id ?? memberId;

  // Live-fetched health data merged on top of base member
  const [liveData, setLiveData]   = useState<Partial<FamilyMember> | null>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  // Edit Dependent profile states
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [depFirstName, setDepFirstName] = useState("");
  const [depLastName, setDepLastName] = useState("");
  const [depYear, setDepYear] = useState("");
  const [depMonth, setDepMonth] = useState("");
  const [depDay, setDepDay] = useState("");
  const [depDob, setDepDob] = useState("");           // derived YYYY-MM-DD
  const [depGender, setDepGender] = useState<"Male" | "Female">("Male");
  const [depBloodGroup, setDepBloodGroup] = useState("");
  const [depHeight, setDepHeight] = useState("");      // cm
  const [depWeight, setDepWeight] = useState("");      // kg
  const [depRelation, setDepRelation] = useState("");
  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [editLoading, setEditLoading] = useState(false);

  // ── Load initial data ──────────────────────────────────────────────────────
  const loadHealthData = useCallback(async () => {
    if (!memberUid) { setLoading(false); return; }
    try {
      const data = await fetchMemberHealthData(memberUid);
      setLiveData(data);
    } catch (e) {
      console.log("❌ MemberDetails fetchMemberHealthData error:", e);
    } finally {
      setLoading(false);
    }
  }, [memberUid]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const loadDataAndSubscribe = async () => {
      try {
        const data = await fetchMemberHealthData(memberUid);
        if (!active) return;
        setLiveData(data);
      } catch (e) {
        console.log("❌ MemberDetails fetchMemberHealthData error:", e);
      } finally {
        if (active) setLoading(false);
      }

      if (memberUid && active) {
        const unsub = subscribeToMemberHealth(memberUid, (update) => {
          if (active && update) {
            setLiveData((prev) => ({ ...(prev ?? {}), ...update }));
          }
        });
        if (!active) {
          unsub();
        } else {
          unsubRef.current = unsub;
        }
      }
    };

    if (memberUid) {
      loadDataAndSubscribe();
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
      if (unsubRef.current) unsubRef.current();
    };
  }, [memberUid]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHealthData();
    setRefreshing(false);
  }, [loadHealthData]);

  // Keep depDob in sync whenever year/month/day are all chosen
  useEffect(() => {
    if (depYear && depMonth && depDay) {
      setDepDob(`${depYear}-${depMonth}-${depDay}`);
    } else {
      setDepDob("");
    }
  }, [depYear, depMonth, depDay]);

  // If the chosen day no longer fits the chosen month/year (e.g. Feb 30), reset it
  useEffect(() => {
    if (depDay && depYear && depMonth) {
      const maxDay = daysInMonth(depYear, depMonth);
      if (parseInt(depDay, 10) > maxDay) {
        setDepDay("");
      }
    }
  }, [depYear, depMonth]);

  // ── Merged member data ─────────────────────────────────────────────────────
  const member: Partial<FamilyMember> = { ...(baseMember ?? {}), ...(liveData ?? {}) };

  const fullName =
    `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim() ||
    member.name ||
    "Family Member";
  const relation = member.relation ?? member.relationship ?? "Family";
  const age      = getAge(member.dateOfBirth ?? member.dob);

  const handleShareId = (label: string, idVal: string) => {
    Alert.alert(
      `${label} Options`,
      `What would you like to do with this ${label}?`,
      [
        {
          text: "Copy to Clipboard",
          onPress: () => {
            Clipboard.setString(idVal);
            Alert.alert("Copied", `${label} copied to clipboard.`);
          },
        },
        {
          text: "Share via Apps",
          onPress: () => {
            Share.share({
              message: `VitalTwin Profile Details:\nName: ${fullName}\n${label}: ${idVal}`,
              title: `Share ${label}`,
            });
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const isThisMemberActive = isSwitched && activeMemberId === memberUid;

  // ── Handle switch ──────────────────────────────────────────────────────────
  const handleSwitchProfile = useCallback(async () => {
    if (isThisMemberActive) {
      await switchToSelf();
      return;
    }
    if (!baseMember) return;
    Alert.alert(
      "Switch Profile",
      `Switch to ${fullName}'s profile? All health data (medicines, symptoms, Clinical Twin) will reflect their account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            await switchToMember(memberUid);
            if (router.canGoBack()) { router.back(); } else { router.replace("/family"); }
          },
        },
      ]
    );
  }, [isThisMemberActive, baseMember, fullName, switchToMember, switchToSelf]);

  // ── Handle Edit Dependent Modal ─────────────────────────────────────────────
  const openEditModal = () => {
    setDepFirstName(member.firstName || "");
    setDepLastName(member.lastName || "");
    setDepRelation(relation);
    setDepGender(member.gender === "Female" ? "Female" : "Male");
    setDepBloodGroup(member.bloodGroup || "");
    setDepHeight(member.height ? String(member.height) : "");
    setDepWeight(member.weight ? String(member.weight) : "");

    const dobStr = member.dateOfBirth || member.dob || "";
    if (dobStr && dobStr.includes("-")) {
      const parts = dobStr.split("-");
      if (parts.length === 3) {
        setDepYear(parts[0]);
        setDepMonth(parts[1]);
        setDepDay(parts[2]);
      }
    } else {
      setDepYear("");
      setDepMonth("");
      setDepDay("");
    }

    setEditModalVisible(true);
  };

  const handleSaveDependent = async () => {
    if (!depFirstName.trim() || !depLastName.trim()) {
      Alert.alert("Error", "Please enter first and last name.");
      return;
    }
    if (!depDob.trim() || !depHeight.trim() || !depWeight.trim()) {
      Alert.alert("Error", "Please select date of birth and fill in height and weight.");
      return;
    }
    if (!depRelation.trim()) {
      Alert.alert("Error", "Please enter relationship.");
      return;
    }

    const birthDate = new Date(depDob.trim());
    const age = Math.max(
      1,
      Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    );

    if (age < 18 || age > 80) {
      Alert.alert("Registration Error", "Digital Twin calibration requires age to be between 18 and 80 years.");
      return;
    }

    const h = parseFloat(depHeight);
    if (isNaN(h) || h < 140 || h > 220) {
      Alert.alert("Registration Error", "Digital Twin calibration requires height to be between 140 and 220 cm.");
      return;
    }

    const w = parseFloat(depWeight);
    if (isNaN(w) || w < 30 || w > 200) {
      Alert.alert("Registration Error", "Digital Twin calibration requires weight to be between 30 and 200 kg.");
      return;
    }

    setEditLoading(true);
    try {
      const success = await updateDependentProfile(memberUid, {
        firstName: depFirstName.trim(),
        lastName: depLastName.trim(),
        dateOfBirth: depDob.trim(),
        gender: depGender,
        bloodGroup: depBloodGroup.trim(),
        height: depHeight.trim(),
        weight: depWeight.trim(),
        relation: depRelation.trim(),
      });

      if (!success) {
        Alert.alert("Error", "Failed to update profile. Please try again.");
        return;
      }

      // Check if physiological metrics changed to trigger twin recalibration
      const isPhysiologyChanged =
        depGender !== member.gender ||
        depDob !== (member.dateOfBirth || member.dob) ||
        parseFloat(depHeight) !== parseFloat(String(member.height || 0)) ||
        parseFloat(depWeight) !== parseFloat(String(member.weight || 0));

      if (isPhysiologyChanged) {
        await registerTwin({
          user_id: getTwinId({
            firstName: depFirstName.trim(),
            lastName: depLastName.trim(),
            phone: member.phone || "",
          } as any),
          profile_name: `${depFirstName.trim()} ${depLastName.trim()}`.trim(),
          age,
          weight: w,
          height: h,
          sex: depGender,
        });
        await setDoc(doc(db, "users", memberUid), { biogears_registered: true }, { merge: true });
      }

      await refreshMembers();
      await loadHealthData();
      setEditModalVisible(false);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (e: any) {
      console.log("❌ Update profile error:", e);
      Alert.alert("Error", e.message || "An error occurred while saving profile.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleRemoveMember = () => {
    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${fullName} from your family health network?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setEditModalVisible(false);
            setLoading(true);
            try {
              await removeMember(memberUid);
              if (router.canGoBack()) { router.back(); } else { router.replace("/family"); }
            } catch (e) {
              console.log("❌ removeMember error:", e);
              Alert.alert("Error", "Could not remove member.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderDropdownField = (value: string, placeholder: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.input, styles.dropdownField, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <Text style={{ color: value ? c.text : c.sub, fontSize: 14 }}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={16} color={c.sub} />
    </TouchableOpacity>
  );

  const pickerOptions: { label: string; value: string }[] =
    activePicker === "year"
      ? YEARS.map((y) => ({ label: y, value: y }))
      : activePicker === "month"
      ? MONTHS
      : activePicker === "day"
      ? Array.from({ length: daysInMonth(depYear, depMonth) }, (_, i) => {
          const d = String(i + 1).padStart(2, "0");
          return { label: d, value: d };
        })
      : activePicker === "bloodGroup"
      ? BLOOD_GROUPS.map((b) => ({ label: b, value: b }))
      : [];

  const pickerTitle =
    activePicker === "year"
      ? "Select Year"
      : activePicker === "month"
      ? "Select Month"
      : activePicker === "day"
      ? "Select Day"
      : "Select Blood Group";

  const handlePickerSelect = (value: string) => {
    if (activePicker === "year") setDepYear(value);
    if (activePicker === "month") setDepMonth(value);
    if (activePicker === "day") setDepDay(value);
    if (activePicker === "bloodGroup") setDepBloodGroup(value);
    setActivePicker(null);
  };

  // ── Loading / not-found states ─────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (!baseMember && !memberId) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Ionicons name="alert-circle-outline" size={60} color={c.danger ?? "#ef4444"} />
        <Text style={[styles.errorText, { color: c.text }]}>Member not found</Text>
        <Text style={[styles.errorSub, { color: c.sub }]}>
          Please go back and select a valid family member.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />

      <View style={[styles.container, { backgroundColor: c.bg }]}>
        {/* ── Header ── */}
        <LinearGradient
          colors={theme === "dark" ? ["#1e3a5f", "#0c1929"] : ["#2563eb", "#7c3aed"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/family"); } }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Avatar */}
          {member.profileImage ? (
            <Image source={{ uri: member.profileImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{getInitials(member)}</Text>
            </View>
          )}

          <Text style={styles.headerName}>{fullName}</Text>
          <Text style={styles.headerMeta}>
            {relation}{age !== "--" ? ` · ${age} yrs` : ""}{" "}
            {member.gender ? `· ${member.gender}` : ""}
          </Text>

          {/* Switch Profile Button */}
          <TouchableOpacity
            style={[
              styles.switchBtn,
              isThisMemberActive
                ? { backgroundColor: "rgba(239,68,68,0.25)" }
                : { backgroundColor: "rgba(255,255,255,0.2)" },
            ]}
            onPress={handleSwitchProfile}
          >
            <Ionicons
              name={isThisMemberActive ? "swap-horizontal" : "swap-horizontal-outline"}
              size={15}
              color="#fff"
            />
            <Text style={styles.switchBtnText}>
              {isThisMemberActive ? "Back to My Profile" : "Switch Profile"}
            </Text>
          </TouchableOpacity>
        </LinearGradient>

        {/* ── Content ── */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.accent}
              colors={[c.accent]}
            />
          }
        >
          {loading && !liveData ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={c.accent} />
              <Text style={[styles.loadingText, { color: c.sub }]}>
                Loading live health data...
              </Text>
            </View>
          ) : null}

          {/* Personal Information */}
          <Section
            title="Personal Information"
            icon="person-outline"
            c={c}
            rightAction={member.isDependent ? openEditModal : undefined}
          >
            <InfoRow label="Blood Group" value={member.bloodGroup ?? "--"} c={c} />
            <InfoRow label="Height"      value={member.height ? `${member.height} cm` : "--"} c={c} />
            <InfoRow label="Weight"      value={member.weight ? `${member.weight} kg` : "--"} c={c} />
            {member.dateOfBirth || member.dob ? (
              <InfoRow label="Date of Birth" value={member.dateOfBirth ?? member.dob ?? "--"} c={c} />
            ) : null}
            {member.inviteCode || baseMember?.inviteCode ? (
              <InfoRow
                label="Health ID"
                value={member.inviteCode || baseMember?.inviteCode || ""}
                c={c}
                rightIcon="share-social-outline"
                onPress={() => handleShareId("Health ID", member.inviteCode || baseMember?.inviteCode || "")}
              />
            ) : null}
            {memberUid ? (
              <InfoRow
                label="Profile ID"
                value={memberUid}
                c={c}
                rightIcon="share-social-outline"
                onPress={() => handleShareId("Profile ID", memberUid)}
              />
            ) : null}
          </Section>

          {/* Vital Signs */}
          <Section title="Vital Signs" icon="heart-outline" c={c}>
            <InfoRow
              label="Heart Rate"
              value={member.heartRate ? `${member.heartRate} bpm` : "--"}
              icon="heart-pulse"
              c={c}
            />
            <InfoRow
              label="SpO₂"
              value={member.spo2 ? `${member.spo2}%` : "--"}
              icon="pulse"
              c={c}
            />
            <InfoRow
              label="Blood Pressure"
              value={member.bloodPressure ?? "--"}
              icon="gauge"
              c={c}
            />
            <InfoRow
              label="Temperature"
              value={member.temperature ? `${member.temperature} °C` : "--"}
              icon="thermometer"
              c={c}
            />
          </Section>

          {/* Medicines */}
          <Section title="Medicines" icon="medkit-outline" c={c}>
            {member.medicines?.length ? (
              member.medicines.map((med: any, idx: number) => {
                const name = typeof med === "string" ? med : med.name ?? "Unknown";
                const dose = med.dosage ?? med.dose ?? "";
                const freq = med.frequency ?? "";
                return (
                  <View
                    key={`med-${idx}`}
                    style={[styles.listItem, { borderLeftColor: "#f59e0b" }]}
                  >
                    <MaterialCommunityIcons name="pill" size={16} color="#f59e0b" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.listItemTitle, { color: c.text }]}>{name}</Text>
                      {(dose || freq) ? (
                        <Text style={[styles.listItemSub, { color: c.sub }]}>
                          {[dose, freq].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: c.sub }]}>No medicines recorded</Text>
            )}
          </Section>

          {/* Active Symptoms */}
          <Section title="Active Symptoms" icon="fitness-outline" c={c}>
            {member.symptoms?.length ? (
              member.symptoms.map((sym: any, idx: number) => {
                const name     = sym.name ?? sym ?? "Unknown";
                const severity = sym.severity ?? "";
                const sevColor =
                  severity === "severe" || severity === "emergency"
                    ? "#ef4444"
                    : severity === "moderate"
                    ? "#f59e0b"
                    : "#22c55e";
                return (
                  <View key={`sym-${idx}`} style={[styles.listItem, { borderLeftColor: sevColor }]}>
                    <MaterialCommunityIcons name="stethoscope" size={16} color={sevColor} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.listItemTitle, { color: c.text }]}>{name}</Text>
                      {severity ? (
                        <View style={[styles.severityBadge, { backgroundColor: sevColor + "20" }]}>
                          <Text style={[styles.severityText, { color: sevColor }]}>
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: c.sub }]}>No active symptoms</Text>
            )}
          </Section>

          {/* Lifestyle */}
          <Section title="Activity & Hydration" icon="water-outline" c={c}>
            <InfoRow
              label="Daily Steps"
              value={member.steps ? member.steps.toLocaleString() : "--"}
              icon="shoe-print"
              c={c}
            />
            <InfoRow
              label="Calories"
              value={member.calories ? `${member.calories} kcal` : "--"}
              icon="fire"
              c={c}
            />
            <InfoRow
              label="Hydration"
              value={member.hydration ? `${member.hydration} ml` : "--"}
              icon="water"
              c={c}
            />
          </Section>

          {/* Last Updated */}
          {member.updatedAt ? (
            <Text style={[styles.updatedAt, { color: c.sub }]}>
              Last updated: {new Date(member.updatedAt).toLocaleString()}
            </Text>
          ) : null}
        </ScrollView>
      </View>

      {/* Edit Dependent Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[styles.modalSheet, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Edit Dependent Profile</Text>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: c.text }]}>First Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                placeholderTextColor={c.sub}
                value={depFirstName}
                onChangeText={setDepFirstName}
              />

              <Text style={[styles.label, { color: c.text }]}>Last Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                placeholderTextColor={c.sub}
                value={depLastName}
                onChangeText={setDepLastName}
              />

              <Text style={[styles.label, { color: c.text }]}>Relationship</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                placeholder="e.g. Son, Daughter, Mother"
                placeholderTextColor={c.sub}
                value={depRelation}
                onChangeText={setDepRelation}
              />

              <Text style={[styles.label, { color: c.text }]}>Date of Birth</Text>
              <View style={styles.dobRow}>
                <View style={{ flex: 1 }}>
                  {renderDropdownField(depYear, "Year", () => setActivePicker("year"))}
                </View>
                <View style={{ flex: 1.3 }}>
                  {renderDropdownField(monthLabel(depMonth), "Month", () => setActivePicker("month"))}
                </View>
                <View style={{ flex: 1 }}>
                  {renderDropdownField(depDay, "Day", () => setActivePicker("day"))}
                </View>
              </View>

              <Text style={[styles.label, { color: c.text }]}>Gender</Text>
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
                {(["Male", "Female"] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setDepGender(g)}
                    style={[
                      styles.genderBtn,
                      {
                        flex: 1,
                        backgroundColor: depGender === g ? c.accent : c.bg,
                        borderColor: c.border,
                      },
                    ]}
                  >
                    <Text style={{ color: depGender === g ? "#fff" : c.text, fontWeight: "600", fontSize: 13 }}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { color: c.text }]}>Height (cm)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                keyboardType="numeric"
                placeholderTextColor={c.sub}
                value={depHeight}
                onChangeText={setDepHeight}
              />

              <Text style={[styles.label, { color: c.text }]}>Weight (kg)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                keyboardType="numeric"
                placeholderTextColor={c.sub}
                value={depWeight}
                onChangeText={setDepWeight}
              />

              <Text style={[styles.label, { color: c.text }]}>Blood Group</Text>
              {renderDropdownField(depBloodGroup, "Select blood group", () => setActivePicker("bloodGroup"))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.removeBtn, { borderColor: c.danger }]}
              onPress={handleRemoveMember}
            >
              <Ionicons name="trash-outline" size={16} color={c.danger} />
              <Text style={[styles.removeBtnText, { color: c.danger }]}>Remove Member</Text>
            </TouchableOpacity>

            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: c.bg }]}
                onPress={() => setEditModalVisible(false)}
                disabled={editLoading}
              >
                <Text style={[styles.modalBtnText, { color: c.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: c.accent }]}
                onPress={handleSaveDependent}
                disabled={editLoading}
              >
                {editLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: "#fff" }]}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Picker Modal — shared by Year / Month / Day / Blood Group */}
      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setActivePicker(null)}
        >
          <View style={[styles.modalPickerSheet, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>{pickerTitle}</Text>
            <FlatList
              data={pickerOptions}
              keyExtractor={(item) => item.value}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomColor: c.border }]}
                  onPress={() => handlePickerSelect(item.value)}
                >
                  <Text style={{ color: c.text, fontSize: 15 }}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Themed Custom Alert Modal */}
      <Modal
        visible={customAlert !== null && customAlert.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomAlert(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center"
          }}
          onPress={() => setCustomAlert(null)}
        >
          <Pressable
            style={{
              backgroundColor: c.card,
              borderRadius: 24,
              padding: 20,
              width: "85%",
              maxWidth: 320,
              borderWidth: 1,
              borderColor: c.border,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 10
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "bold",
                marginBottom: 8,
                color: c.text,
                textAlign: 'center'
              }}
            >
              {customAlert?.title}
            </Text>
            {customAlert?.message ? (
              <Text
                style={{
                  fontSize: 14,
                  color: c.sub,
                  textAlign: 'center',
                  marginBottom: 16
                }}
              >
                {customAlert.message}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: customAlert?.buttons && customAlert.buttons.length > 2 ? 'column' : 'row',
                justifyContent: 'center',
                gap: 10,
                width: '100%'
              }}
            >
              {customAlert?.buttons.map((btn, idx) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                const isStack = customAlert.buttons.length > 2;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      {
                        padding: 14,
                        borderRadius: 12,
                        alignItems: "center"
                      },
                      isDestructive
                        ? { backgroundColor: '#ef4444' }
                        : isCancel
                        ? { backgroundColor: c.border }
                        : { backgroundColor: c.accent },
                      isStack && { width: '100%', justifyContent: 'center' },
                      !isStack && { flex: 1 }
                    ]}
                    onPress={() => {
                      setCustomAlert(null);
                      if (btn.onPress) btn.onPress();
                    }}
                  >
                    <Text
                      style={{
                        color: isCancel ? c.text : '#fff',
                        fontWeight: 'bold',
                        fontSize: 14,
                        textAlign: 'center'
                      }}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  errorSub: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
  },
  headerGradient: {
    paddingTop: 52,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    position: "relative",
  },
  backBtn: {
    position: "absolute",
    top: 52,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.5)",
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  headerName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  headerMeta: {
    fontSize: 14,
    color: "rgba(255,255,255,0.75)",
    marginTop: 4,
    textAlign: "center",
  },
  switchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  switchBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 13,
  },
  section: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoLabel: {
    fontSize: 14,
  },
  infoValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  listItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  severityBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyText: {
    fontStyle: "italic",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 8,
  },
  updatedAt: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSheet: {
    width: "88%",
    maxHeight: "85%",
    borderRadius: 20,
    padding: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  modalPickerSheet: {
    width: "80%",
    maxHeight: "60%",
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  modalScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  modalOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 8,
  },
  dropdownField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dobRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  genderBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    marginBottom: 16,
    marginTop: 8,
  },
  removeBtnText: {
    fontWeight: "700",
    fontSize: 14,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: {
    fontWeight: "700",
    fontSize: 14,
  },
});