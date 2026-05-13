// app/profile.tsx
// PROFESSIONAL PROFILE PAGE — With Family Member Profile Switching
// KEY FIX: All display sections now use `displayProfile` which is:
//   - activeProfile (from FamilyContext) when switched to a member
//   - own profile (from ProfileContext) when on self
// Edit modals always edit YOUR OWN profile only (correct behaviour).

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useFamily } from "../context/FamilyContext";
import {
  ActivityIndicator, Alert, Animated, Dimensions, Image,
  KeyboardAvoidingView, Modal, Platform, ScrollView, Share,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";

import Slider from "@react-native-community/slider";

import { syncMedicinesFromFirebase } from "@/services/medicineSync";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import { useProfile } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";
import { getTwinId } from "../utils/twinUtils";
import {
  fetchLinkedMembers, LinkedMember, unlinkFamilyMember,
} from "../services/familySync";
import { auth, db } from "../services/firebase";
import { findUserByHealthId } from "../services/firebaseService";
import { BiogearsRegistrationPayload } from "../services/biogears";
import { UserProfile, EMPTY_PROFILE } from "../services/profileService";
import { FamilyMember } from "../types/FamilyMember";
import Header from "./components/Header";
import ActiveProfileBanner from "../components/ActiveProfileBanner";

const { width } = Dimensions.get("window");

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = ["Male", "Female"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type AppSettings = {
  notifications: boolean;
  darkMode: boolean;
  biometric: boolean;
  dataSaving: boolean;
  language: string;
};

// ─── Picker components ────────────────────────────────────────────────────────

function DropdownPicker({ visible, options, selected, onSelect, onClose, colors, title }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }}
        activeOpacity={1} onPress={onClose}
      >
        <View style={{ backgroundColor: colors.card, borderRadius: 20, width: width * 0.75, maxHeight: 400, overflow: "hidden" }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" }}>{title}</Text>
          </View>
          <ScrollView>
            {options.map((opt: string) => (
              <TouchableOpacity
                key={opt}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5,
                  borderBottomColor: colors.border,
                  backgroundColor: selected === opt ? colors.accent + "20" : "transparent",
                }}
                onPress={() => { onSelect(opt); onClose(); }}
              >
                <Text style={{ color: selected === opt ? colors.accent : colors.text, fontSize: 15, fontWeight: selected === opt ? "700" : "400" }}>{opt}</Text>
                {selected === opt && <Ionicons name="checkmark" size={18} color={colors.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function DatePickerModal({ visible, value, onConfirm, onClose, colors }: any) {
  const parseDMY = (v: string) => {
    const parts = v?.split("/");
    if (parts?.length === 3) return { day: parseInt(parts[0]) || 1, month: parseInt(parts[1]) || 1, year: parseInt(parts[2]) || 2000 };
    const today = new Date();
    return { day: today.getDate(), month: today.getMonth() + 1, year: today.getFullYear() - 25 };
  };
  const init = parseDMY(value);
  const [day, setDay]     = useState(init.day);
  const [month, setMonth] = useState(init.month);
  const [year, setYear]   = useState(init.year);
  useEffect(() => { if (visible) { const p = parseDMY(value); setDay(p.day); setMonth(p.month); setYear(p.year); } }, [visible]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days  = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const years = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);

  const ColPicker = ({ items, selected, onSelect, label }: any) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.subText, fontSize: 10, textAlign: "center", marginBottom: 4, fontWeight: "600" }}>{label}</Text>
      <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
        {(items as any[]).map((item: any) => {
          const isSelected = item === selected;
          return (
            <TouchableOpacity key={item.toString()} onPress={() => onSelect(item)}
              style={{ paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, backgroundColor: isSelected ? colors.accent : "transparent", marginVertical: 2, alignItems: "center" }}>
              <Text style={{ color: isSelected ? "#fff" : colors.text, fontSize: 14, fontWeight: isSelected ? "700" : "400" }}>{item}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor: colors.card, borderRadius: 24, width: width * 0.88, padding: 20 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center", marginBottom: 16 }}>Select Date of Birth</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ColPicker items={days} selected={day} onSelect={setDay} label="DAY" />
            <ColPicker items={MONTHS} selected={MONTHS[month - 1]} onSelect={(m: string) => setMonth(MONTHS.indexOf(m) + 1)} label="MONTH" />
            <ColPicker items={years} selected={year} onSelect={setYear} label="YEAR" />
          </View>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.border, alignItems: "center" }} onPress={onClose}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center" }}
              onPress={() => {
                const clampedDay = Math.min(day, new Date(year, month, 0).getDate());
                onConfirm(`${String(clampedDay).padStart(2,"0")}/${String(month).padStart(2,"0")}/${year}`);
                onClose();
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const colors = theme === "light"
    ? {
        bg: "#f8fafc", card: "#ffffff", border: "#e2e8f0", text: "#020617",
        subText: "#64748b", accent: "#2563eb", accentLight: "#dbeafe",
        success: "#10b981", warning: "#f59e0b", danger: "#ef4444", purple: "#8b5cf6",
        modalOverlay: "rgba(0,0,0,0.3)", gradientStart: "#2563eb", gradientEnd: "#7c3aed",
        familyBg: "#f0f9ff", familyBorder: "#bae6fd",
      }
    : {
        bg: "#020617", card: "#1e293b", border: "#334155", text: "#f1f5f9",
        subText: "#94a3b8", accent: "#3b82f6", accentLight: "#1e3a8a",
        success: "#22c55e", warning: "#f59e0b", danger: "#ef4444", purple: "#a78bfa",
        modalOverlay: "rgba(0,0,0,0.6)", gradientStart: "#3b82f6", gradientEnd: "#8b5cf6",
        familyBg: "#0c1929", familyBorder: "#1e3a5f",
      };

  // ── Context ─────────────────────────────────────────────────────────────
  const {
    addMember, removeMember, members,
    switchToMember, switchToSelf,
    isSwitched, isSwitchLoading,
    activeMemberId, activeMemberInfo,
    activeProfile,              // ← the profile to DISPLAY (could be member or self)
  } = useFamily();

  const { profile, updateProfile, isLoaded, resetProfile, reloadProfile } = useProfile();
  const { twinStatus, simulationProgress, registerTwin } = useBiogearsTwin();

  // ── OWN profile for editing — always your own, never switched member ──
  const ownSafeProfile: UserProfile = { ...EMPTY_PROFILE, ...(profile || {}) };

  // ── DISPLAY profile — this is what ALL sections render ────────────────
  // When switched: shows activeProfile (fetched from Firebase for that member)
  // When on self:  shows your own profile
  const displayProfile: UserProfile = { ...EMPTY_PROFILE, ...(activeProfile || {}) };

  // localProfile is for EDIT MODALS — always editing your own profile
  const [localProfile, setLocalProfile] = useState<UserProfile>(ownSafeProfile);
  useEffect(() => {
    setLocalProfile({ ...EMPTY_PROFILE, ...(profile || {}) });
  }, [profile]);

  useFocusEffect(
    React.useCallback(() => {
      reloadProfile();
      syncMedicinesFromFirebase();
      loadMyInviteCodeFromFirebase();
    }, [])
  );

  const [settings, setSettings] = useState<AppSettings>({
    notifications: true, darkMode: theme === "dark", biometric: false, dataSaving: true, language: "English",
  });

  // ── Family state ────────────────────────────────────────────────────────
  const [myInviteCode,      setMyInviteCode]      = useState<string>("");
  const [addMemberModal,    setAddMemberModal]     = useState(false);
  const [newMemberName,     setNewMemberName]      = useState("");
  const [newMemberRelation, setNewMemberRelation]  = useState("");
  const [newMemberHealthId, setNewMemberHealthId]  = useState("");
  const [searchLoading,     setSearchLoading]      = useState(false);
  const [searchError,       setSearchError]        = useState("");
  const [linkedMembers,     setLinkedMembers]      = useState<LinkedMember[]>([]);

  // ── Picker state ─────────────────────────────────────────────────────────
  const [showGenderPicker, setShowGenderPicker] = useState(false);
  const [showBloodPicker,  setShowBloodPicker]  = useState(false);
  const [showDatePicker,   setShowDatePicker]   = useState(false);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editMedicalModal, setEditMedicalModal] = useState(false);
  const [emergencyModal,   setEmergencyModal]   = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadSettings();
    loadLinkedMembers();
    requestPermissions();
    loadMyInviteCodeFromFirebase();
  }, []);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") Alert.alert("Permission needed", "Please grant camera roll permissions to change profile picture");
  };

  const loadMyInviteCodeFromFirebase = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const docRef = doc(db, "users", user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data?.inviteCode) { setMyInviteCode(data.inviteCode); await AsyncStorage.setItem("myInviteCode", data.inviteCode); return; }
      }
      const uid = user.uid.replace(/-/g, "");
      const code = `VT-${uid.substring(0, 4).toUpperCase()}-${uid.substring(uid.length - 4).toUpperCase()}`;
      setMyInviteCode(code);
      await AsyncStorage.setItem("myInviteCode", code);
      if (snap.exists()) await updateDoc(docRef, { inviteCode: code });
      else await setDoc(docRef, { inviteCode: code }, { merge: true });
    } catch (e) { console.log("❌ loadMyInviteCodeFromFirebase error:", e); }
  };

  const loadLinkedMembers = async () => {
    try {
      const fetchedMembers = await fetchLinkedMembers();
      setLinkedMembers(fetchedMembers);
      for (const member of fetchedMembers) {
        const id = member.uid?.toString() || member.userId?.toString() || member.id?.toString();
        if (!id) continue;
        const exists = members.some((m) => m.id === id);
        if (!exists) {
          await addMember({ id, uid: id, userId: id, firstName: member.firstName ?? "", lastName: member.lastName ?? "", relation: member.relation || "Family", inviteCode: member.inviteCode || "", status: member.status || "active" });
        }
      }
    } catch (e) { console.log("❌ Error loading linked members:", e); }
  };

  // Edit modals ALWAYS save YOUR OWN profile
  const saveProfileData = async (newProfile: UserProfile) => {
    try {
      await updateProfile({
        ...newProfile,
        emergencyContact: {
          name:     newProfile.emergencyContact?.name     || "",
          phone:    newProfile.emergencyContact?.phone    || "",
          relation: newProfile.emergencyContact?.relation || "",
        },
      });
      setLocalProfile(newProfile);
      await reloadProfile();
    } catch (e) { console.log("❌ saveProfileData error:", e); }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    try { await AsyncStorage.setItem("appSettings", JSON.stringify(newSettings)); setSettings(newSettings); }
    catch (e) { console.log(e); }
  };

  const loadSettings = async () => {
    try { const saved = await AsyncStorage.getItem("appSettings"); if (saved) setSettings(JSON.parse(saved)); }
    catch (e) { console.log(e); }
  };

  // ── Family actions ──────────────────────────────────────────────────────

  const handleMemberTap = async (member: FamilyMember) => {
    const uid = member.uid || member.id;
    if (!uid) return;
    // Tapping active member again → switch back to self
    if (isSwitched && activeMemberId === uid) {
      await switchToSelf();
      return;
    }
    await switchToMember(uid);
  };

  const addFamilyMember = async () => {
    if (!newMemberName.trim() || !newMemberHealthId.trim()) { Alert.alert("Missing Info", "Please enter name and health ID."); return; }
    setSearchLoading(true); setSearchError("");
    try {
      const found = await findUserByHealthId(newMemberHealthId.trim());
      if (!found) { setSearchError("No user found with this Health ID."); return; }
      if (members.some((m) => m.id === found.uid)) { Alert.alert("Already Added", "This member is already linked."); return; }
      await addMember({ id: found.uid, uid: found.uid, userId: found.uid, firstName: found.firstName ?? "", lastName: found.lastName ?? "", relation: newMemberRelation || "Family", inviteCode: found.inviteCode || "", status: "active" });
      await loadLinkedMembers();
      setAddMemberModal(false);
      setNewMemberName(""); setNewMemberHealthId(""); setNewMemberRelation(""); setSearchError("");
      Alert.alert("Success", "Family member added successfully!");
    } catch (e) { console.log("❌ Error:", e); setSearchError("Something went wrong."); }
    finally { setSearchLoading(false); }
  };

  const removeFamilyMember = (id: string) => {
    Alert.alert("Remove Member", "Are you sure you want to remove this family member?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        await unlinkFamilyMember(id);
        await removeMember(id);
        await loadLinkedMembers();
      }},
    ]);
  };

  const openModal = (setter: (v: boolean) => void) => {
    setter(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };
  const closeModal = (setter: (v: boolean) => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setter(false));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (!result.canceled) {
      const updated = { ...localProfile, profileImage: result.assets[0].uri };
      setLocalProfile(updated); saveProfileData(updated);
    }
  };

  const toggleSetting = (key: keyof AppSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings); saveSettings(newSettings);
    if (key === "darkMode") toggleTheme();
  };

  const parseAge = (dob?: string) => {
    if (!dob) return 30;
    const parts = dob.split("/");
    if (parts.length === 3) {
      const year = parts[2].length === 2 ? parseInt("20" + parts[2]) : parseInt(parts[2]);
      const dbDate = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
      return Math.abs(new Date(Date.now() - dbDate.getTime()).getUTCFullYear() - 1970);
    }
    return 30;
  };
  const parseKg = (w?: string) => { if (!w) return 70; const m = w.match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 70; };
  const parseCm = (h?: string) => { if (!h) return 170; const m = h.match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : 170; };

  const handleRegisterTwin = async () => {
    const missing: string[] = [];
    if (!localProfile.firstName)             missing.push("First Name");
    if (!localProfile.lastName)              missing.push("Last Name");
    if (!localProfile.phone)                 missing.push("Phone Number");
    if (!localProfile.dateOfBirth)           missing.push("Date of Birth");
    if (!localProfile.height)               missing.push("Height");
    if (!localProfile.weight)               missing.push("Weight");
    if (!localProfile.biogears_resting_hr)   missing.push("Resting Heart Rate");
    if (!localProfile.biogears_systolic_bp)  missing.push("Systolic BP");
    if (!localProfile.biogears_diastolic_bp) missing.push("Diastolic BP");
    if (missing.length > 0) { Alert.alert("Missing Profile Data", `BioGears requires:\n\n• ${missing.join("\n• ")}`, [{ text: "OK" }]); return; }
    try {
      await saveProfileData(localProfile);
      const payload: BiogearsRegistrationPayload = {
        user_id: getTwinId(localProfile), age: parseAge(localProfile.dateOfBirth),
        weight: parseKg(localProfile.weight), height: parseCm(localProfile.height),
        sex: localProfile.gender?.toLowerCase() === "female" ? "Female" : "Male",
        body_fat: localProfile.biogears_body_fat, resting_hr: localProfile.biogears_resting_hr,
        systolic_bp: localProfile.biogears_systolic_bp, diastolic_bp: localProfile.biogears_diastolic_bp,
        is_smoker: localProfile.biogears_is_smoker, has_anemia: localProfile.biogears_has_anemia,
        has_type1_diabetes: localProfile.biogears_has_type1_diabetes, has_type2_diabetes: localProfile.biogears_has_type2_diabetes,
        hba1c: localProfile.biogears_hba1c, ethnicity: localProfile.biogears_ethnicity,
        fitness_level: localProfile.biogears_fitness_level, vo2max: localProfile.biogears_vo2max,
        current_medications: localProfile.medications,
      };
      await registerTwin(payload);
      Alert.alert("Calibration Successful", "Your Digital Twin has been computed and saved.", [{ text: "Great!", onPress: () => closeModal(setEditMedicalModal) }]);
    } catch (err: any) { Alert.alert("Calibration Failed", err.message || "Could not reach BioGears server."); }
  };

  if (!isLoaded) {
    return (
      <View style={[styles.container, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
        <Header />
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        <Text style={{ color: colors.subText, marginTop: 12 }}>Loading profile...</Text>
      </View>
    );
  }

  // ── Render sections ─────────────────────────────────────────────────────
  // ✅ ALL display sections use displayProfile (activeProfile when switched)
  // ✅ Edit modals use localProfile (always your own)

  const renderProfileHeader = () => (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={styles.profileHeader}
    >
      {/* Show a "viewing" badge in the header when switched */}
      {isSwitched && (
        <View style={styles.viewingHeaderBadge}>
          <Ionicons name="eye" size={12} color="rgba(255,255,255,0.9)" />
          <Text style={styles.viewingHeaderText}>
            Viewing {activeMemberInfo?.firstName ?? displayProfile.firstName}'s profile
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={isSwitched ? undefined : pickImage}   // can't edit member's photo
        style={styles.profileImageContainer}
      >
        {displayProfile.profileImage ? (
          <Image source={{ uri: displayProfile.profileImage }} style={styles.profileImage} />
        ) : (
          <View style={[styles.profileImagePlaceholder, { backgroundColor: colors.card }]}>
            <Text style={[styles.profileImageInitial, { color: colors.accent }]}>
              {displayProfile?.firstName?.charAt(0) || ""}{displayProfile?.lastName?.charAt(0) || ""}
            </Text>
          </View>
        )}
        {!isSwitched && (
          <View style={[styles.editBadge, { backgroundColor: colors.card }]}>
            <Ionicons name="camera" size={14} color={colors.accent} />
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.profileName}>
        {displayProfile.firstName} {displayProfile.lastName}
      </Text>
      <Text style={styles.profileEmail}>{displayProfile.email}</Text>
      <View style={styles.profileStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{displayProfile.height || "--"}</Text>
          <Text style={styles.statLabel}>Height</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{displayProfile.weight || "--"}</Text>
          <Text style={styles.statLabel}>Weight</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{displayProfile.bloodGroup || "--"}</Text>
          <Text style={styles.statLabel}>Blood</Text>
        </View>
      </View>
    </LinearGradient>
  );

  const renderPersonalInfo = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Ionicons name="person" size={20} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isSwitched ? `${displayProfile.firstName}'s Information` : "Personal Information"}
          </Text>
        </View>
        {/* Only show edit when viewing own profile */}
        {!isSwitched && (
          <TouchableOpacity onPress={() => openModal(setEditProfileModal)}>
            <Ionicons name="create-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.infoGrid}>
        <InfoRow label="Full Name"     value={`${displayProfile.firstName} ${displayProfile.lastName}`} icon="person-outline"      colors={colors} />
        <InfoRow label="Email"         value={displayProfile.email}                                      icon="mail-outline"        colors={colors} />
        <InfoRow label="Phone"         value={displayProfile.phone ? `+91 ${displayProfile.phone}` : "--"} icon="call-outline"     colors={colors} />
        <InfoRow label="Date of Birth" value={displayProfile.dateOfBirth}                                icon="calendar-outline"    colors={colors} />
        <InfoRow label="Gender"        value={displayProfile.gender}                                     icon="male-female-outline" colors={colors} />
        <InfoRow label="Blood Group"   value={displayProfile.bloodGroup}                                 icon="water-outline"       colors={colors} />
      </View>
    </View>
  );

  const renderMedicalInfo = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Ionicons name="medical" size={20} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {isSwitched ? `${displayProfile.firstName}'s Clinical Profile` : "BioGears Clinical Profile"}
          </Text>
        </View>
        {!isSwitched && (
          <TouchableOpacity onPress={() => openModal(setEditMedicalModal)}>
            <Ionicons name="create-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.medicalGrid}>
        <View style={styles.medicalItem}><Text style={[styles.medicalLabel, { color: colors.subText }]}>Height</Text><Text style={[styles.medicalValue, { color: colors.text }]}>{displayProfile.height || "--"}</Text></View>
        <View style={styles.medicalItem}><Text style={[styles.medicalLabel, { color: colors.subText }]}>Weight</Text><Text style={[styles.medicalValue, { color: colors.text }]}>{displayProfile.weight || "--"}</Text></View>
        <View style={styles.medicalItem}><Text style={[styles.medicalLabel, { color: colors.subText }]}>Resting HR</Text><Text style={[styles.medicalValue, { color: colors.text }]}>{displayProfile.biogears_resting_hr || 72} bpm</Text></View>
        <View style={styles.medicalItem}><Text style={[styles.medicalLabel, { color: colors.subText }]}>BP</Text><Text style={[styles.medicalValue, { color: colors.text }]}>{displayProfile.biogears_systolic_bp || 114}/{displayProfile.biogears_diastolic_bp || 73}</Text></View>
      </View>
      <View style={styles.conditionsContainer}>
        {[
          { key: "biogears_has_type1_diabetes", label: "Type 1 Diabetes", color: colors.danger },
          { key: "biogears_has_type2_diabetes", label: "Type 2 Diabetes", color: colors.danger },
          { key: "biogears_has_anemia",          label: "Chronic Anemia",  color: colors.warning },
          { key: "biogears_is_smoker",           label: "Smoker (COPD)",   color: colors.warning },
        ].map((cond) => {
          if (!displayProfile[cond.key as keyof UserProfile]) return null;
          return (
            <View key={cond.key} style={[styles.tag, { backgroundColor: cond.color + "20" }]}>
              <Ionicons name="medical" size={14} color={cond.color} />
              <Text style={[styles.tagText, { color: cond.color }]}>{cond.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.medicationsSection}>
        <Text style={[styles.subsectionTitle, { color: colors.subText, fontSize: 12, marginTop: 8 }]}>Allergies</Text>
        <View style={styles.tagContainer}>
          {(Array.isArray(displayProfile?.allergies) ? displayProfile.allergies : []).map((a, i) => (
            <View key={i} style={[styles.tag, { backgroundColor: colors.warning + "20" }]}><Ionicons name="alert-circle" size={14} color={colors.warning} /><Text style={[styles.tagText, { color: colors.warning }]}>{a}</Text></View>
          ))}
        </View>
      </View>
      <View style={styles.medicationsSection}>
        <Text style={[styles.subsectionTitle, { color: colors.subText, fontSize: 12 }]}>Current Medications</Text>
        <View style={styles.tagContainer}>
          {(Array.isArray(displayProfile?.medications) ? displayProfile.medications : []).map((m, i) => (
            <View key={i} style={[styles.tag, { backgroundColor: colors.success + "20" }]}><Ionicons name="medkit" size={14} color={colors.success} /><Text style={[styles.tagText, { color: colors.success }]}>{m}</Text></View>
          ))}
        </View>
      </View>
      {/* Only show twin calibration for own profile */}
      {!isSwitched && (
        <View style={[styles.twinStatusBox, { borderColor: ownSafeProfile.biogears_registered ? colors.success : colors.danger, backgroundColor: ownSafeProfile.biogears_registered ? colors.success + "10" : colors.danger + "10" }]}>
          <View style={styles.twinStatusHeader}>
            <Ionicons name={ownSafeProfile.biogears_registered ? "checkmark-circle" : "warning"} size={20} color={ownSafeProfile.biogears_registered ? colors.success : colors.danger} />
            <Text style={[styles.twinStatusText, { color: ownSafeProfile.biogears_registered ? colors.success : colors.danger }]}>
              {twinStatus === "registering" ? "Calibrating Twin Engine..." : ownSafeProfile.biogears_registered ? "Clinical Engine Calibrated" : "Twin Profile Uncalibrated"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.twinActionBtn, { backgroundColor: ownSafeProfile.biogears_registered ? colors.card : colors.danger, borderColor: ownSafeProfile.biogears_registered ? colors.success : "transparent", borderWidth: ownSafeProfile.biogears_registered ? 1 : 0 }]}
            onPress={handleRegisterTwin} disabled={twinStatus === "registering"}
          >
            {twinStatus === "registering"
              ? <Text style={{ color: "#fff", fontSize: 13, fontWeight: "bold" }}>Please Wait... {simulationProgress}</Text>
              : <Text style={[styles.twinActionBtnText, { color: ownSafeProfile.biogears_registered ? colors.success : "#fff" }]}>{ownSafeProfile.biogears_registered ? "Recalibrate Engine" : "Calibrate Twin System"}</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderEmergencyContact = () => (
    <TouchableOpacity
      style={[styles.emergencyCard, { backgroundColor: colors.card }]}
      onPress={isSwitched ? undefined : () => openModal(setEmergencyModal)}
      activeOpacity={isSwitched ? 1 : 0.7}
    >
      <View style={styles.emergencyHeader}>
        <View style={[styles.emergencyIcon, { backgroundColor: colors.danger + "20" }]}>
          <Ionicons name="alert-circle" size={24} color={colors.danger} />
        </View>
        <View style={styles.emergencyInfo}>
          <Text style={[styles.emergencyTitle, { color: colors.text }]}>Emergency Contact</Text>
          <Text style={[styles.emergencyName, { color: colors.subText }]}>
            {displayProfile?.emergencyContact?.name || "Not set"} • {displayProfile?.emergencyContact?.relation || ""}
          </Text>
          <Text style={[styles.emergencyPhone, { color: colors.accent }]}>
            {displayProfile?.emergencyContact?.phone || "Not set"}
          </Text>
        </View>
        {!isSwitched && <Ionicons name="chevron-forward" size={20} color={colors.subText} />}
      </View>
    </TouchableOpacity>
  );

  const renderFamilyMembers = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Ionicons name="people" size={20} color={colors.purple} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Family Health</Text>
        </View>
        <TouchableOpacity style={[styles.addMemberBtn, { backgroundColor: colors.purple + "20" }]} onPress={() => setAddMemberModal(true)}>
          <Ionicons name="person-add" size={16} color={colors.purple} />
          <Text style={[styles.addMemberBtnText, { color: colors.purple }]}>Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.familySubtitle, { color: colors.subText }]}>
        Tap a member to switch their profile app-wide · Long press to remove
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberScroll}>
        {/* ── Self card ── */}
        <TouchableOpacity
          style={[styles.memberCard, {
            backgroundColor: !isSwitched ? colors.accent + "15" : colors.familyBg,
            borderColor:     !isSwitched ? colors.accent          : colors.familyBorder,
            borderWidth: 2,
          }]}
          onPress={switchToSelf}
          activeOpacity={0.8}
        >
          <View style={{ position: "relative" }}>
            <View style={[styles.memberAvatar, { backgroundColor: !isSwitched ? colors.accent : colors.subText }]}>
              <Text style={styles.memberAvatarText}>
                {ownSafeProfile.firstName?.charAt(0) ?? ""}{ownSafeProfile.lastName?.charAt(0) ?? ""}
              </Text>
            </View>
            {!isSwitched && (
              <View style={styles.activeCheckmark}>
                <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              </View>
            )}
          </View>
          <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
            {ownSafeProfile.firstName || "Me"}
          </Text>
          <Text style={[styles.memberRelation, { color: colors.subText }]}>You</Text>
          <View style={[styles.memberStatusPill, { backgroundColor: !isSwitched ? colors.accent + "25" : colors.border }]}>
            <Text style={[styles.memberStatusText, { color: !isSwitched ? colors.accent : colors.subText }]}>
              {!isSwitched ? "Active ✓" : "Switch"}
            </Text>
          </View>
        </TouchableOpacity>

        {/* ── Family member cards ── */}
        {members.map((member) => {
          const memberUid    = member.uid || member.id;
          const isThisActive = isSwitched && activeMemberId === memberUid;
          return (
            <TouchableOpacity
              key={member.id}
              style={[styles.memberCard, {
                backgroundColor: isThisActive ? colors.purple + "15" : colors.familyBg,
                borderColor:     isThisActive ? colors.purple          : colors.familyBorder,
                borderWidth: isThisActive ? 2 : 1,
                opacity: isSwitchLoading ? 0.6 : 1,
              }]}
              onPress={() => handleMemberTap(member)}
              onLongPress={() =>
                Alert.alert("Remove Member", `Remove ${member.firstName} from your family health network?`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => removeFamilyMember(member.id) },
                ])
              }
              activeOpacity={0.8}
              disabled={isSwitchLoading}
            >
              <View style={{ position: "relative" }}>
                <View style={[styles.memberAvatar, { backgroundColor: isThisActive ? colors.purple : colors.purple + "99" }]}>
                  <Text style={styles.memberAvatarText}>
                    {member.firstName?.charAt(0) ?? ""}{member.lastName?.charAt(0) ?? ""}
                  </Text>
                </View>
                {isThisActive && (
                  <View style={styles.activeCheckmark}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.purple} />
                  </View>
                )}
              </View>
              <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>{member.firstName}</Text>
              <Text style={[styles.memberRelation, { color: colors.subText }]}>{member.relation ?? "Family"}</Text>
              <View style={[styles.memberStatusPill, { backgroundColor: isThisActive ? colors.purple + "25" : colors.success + "20" }]}>
                <Text style={[styles.memberStatusText, { color: isThisActive ? colors.purple : colors.success }]}>
                  {isThisActive ? "Active ✓" : "Tap to view"}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── Add card ── */}
        <TouchableOpacity style={[styles.memberCardAdd, { borderColor: colors.border, backgroundColor: colors.familyBg }]} onPress={() => setAddMemberModal(true)}>
          <View style={[styles.memberAvatarAdd, { backgroundColor: colors.border }]}>
            <Ionicons name="add" size={24} color={colors.subText} />
          </View>
          <Text style={[styles.memberName, { color: colors.subText }]}>Add</Text>
          <Text style={[styles.memberRelation, { color: colors.subText }]}>Member</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Health ID — always your own */}
      <View style={[styles.myCodeBox, { backgroundColor: colors.familyBg, borderColor: colors.familyBorder }]}>
        <View style={styles.myCodeLeft}>
          <View style={[styles.myCodeIconBox, { backgroundColor: colors.purple + "20" }]}>
            <Ionicons name="qr-code" size={20} color={colors.purple} />
          </View>
          <View>
            <Text style={[styles.myCodeLabel, { color: colors.subText }]}>My Unique Health ID</Text>
            <Text style={[styles.myCodeValue, { color: colors.purple }]}>{myInviteCode || "Loading..."}</Text>
            <Text style={[styles.myCodeSub, { color: colors.subText }]}>Share with family to link health data</Text>
          </View>
        </View>
        <View style={styles.myCodeActions}>
          <TouchableOpacity style={[styles.codeActionBtn, { backgroundColor: colors.accent + "20" }]} onPress={() => Alert.alert("Copied!", `Your code: ${myInviteCode}`)}>
            <Ionicons name="copy-outline" size={16} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.codeActionBtn, { backgroundColor: colors.purple }]} onPress={() => Share.share({ message: `Join me on VitalHealth! Use my invite code: ${myInviteCode} to link our health data.`, title: "VitalHealth Invite Code" })}>
            <Ionicons name="share-social" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.familyHint, { color: colors.subText }]}>💡 Long press a member card to remove them</Text>
    </View>
  );

  const renderAppSettings = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <TouchableOpacity style={styles.settingsLinkRow} onPress={() => router.push("/settings")}>
        <View style={styles.settingInfo}>
          <Ionicons name="settings-outline" size={20} color={colors.accent} />
          <Text style={[styles.settingLabel, { color: colors.text }]}>More Settings</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.subText} />
      </TouchableOpacity>
    </View>
  );

  const renderLogout = () => (
    <TouchableOpacity
      style={[styles.logoutButton, { backgroundColor: colors.card }]}
      onPress={() => Alert.alert("Logout", "Are you sure you want to logout?", [
        { text: "Cancel", style: "cancel" },
        { text: "Logout", style: "destructive", onPress: async () => {
          await switchToSelf();
          await AsyncStorage.clear();
          await resetProfile();
          try { await signOut(auth); } catch (e) { console.log(e); }
          router.replace("/welcome");
        }},
      ])}
    >
      <Ionicons name="log-out-outline" size={22} color={colors.danger} />
      <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
    </TouchableOpacity>
  );

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header />
      <ScrollView showsVerticalScrollIndicator={false}>
        {renderProfileHeader()}
        {renderPersonalInfo()}
        {renderMedicalInfo()}
        {renderEmergencyContact()}
        {renderFamilyMembers()}
        {renderAppSettings()}
        {renderLogout()}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Pickers */}
      <DropdownPicker visible={showGenderPicker} options={GENDERS} selected={localProfile.gender || ""} onSelect={(v: string) => setLocalProfile({ ...localProfile, gender: v })} onClose={() => setShowGenderPicker(false)} colors={colors} title="Select Gender" />
      <DropdownPicker visible={showBloodPicker} options={BLOOD_GROUPS} selected={localProfile.bloodGroup || ""} onSelect={(v: string) => setLocalProfile({ ...localProfile, bloodGroup: v })} onClose={() => setShowBloodPicker(false)} colors={colors} title="Select Blood Group" />
      <DatePickerModal visible={showDatePicker} value={localProfile.dateOfBirth || ""} onConfirm={(date: string) => setLocalProfile({ ...localProfile, dateOfBirth: date })} onClose={() => setShowDatePicker(false)} colors={colors} />

      {/* Edit Profile Modal */}
      <Modal transparent visible={editProfileModal} animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
          <View style={[styles.modalOverlay, { justifyContent: "flex-end" }]}>
            <Animated.View style={[styles.modalCard, styles.bottomSheet, { backgroundColor: colors.card }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>First Name</Text>
                <TextInput placeholder="First Name" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={localProfile.firstName} onChangeText={(t) => setLocalProfile({ ...localProfile, firstName: t })} />
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Last Name</Text>
                <TextInput placeholder="Last Name" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={localProfile.lastName} onChangeText={(t) => setLocalProfile({ ...localProfile, lastName: t })} />
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Email</Text>
                <TextInput placeholder="Email" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={localProfile.email} onChangeText={(t) => setLocalProfile({ ...localProfile, email: t })} keyboardType="email-address" autoCapitalize="none" />
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Phone</Text>
                <View style={[styles.phoneRow, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <View style={[styles.phonePrefixBox, { borderRightColor: colors.border }]}>
                    <Text style={[styles.phonePrefix, { color: colors.subText }]}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    placeholder="9876543210" placeholderTextColor={colors.subText} style={[styles.phoneInput, { color: colors.text }]}
                    value={localProfile.phone?.replace(/^\+91\s?/, "") || ""}
                    onChangeText={(t) => { const digits = t.replace(/\D/g, "").slice(0, 10); setLocalProfile({ ...localProfile, phone: digits }); }}
                    keyboardType="number-pad" maxLength={10}
                  />
                </View>
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Date of Birth</Text>
                <TouchableOpacity style={[styles.input, styles.pickerRow, { backgroundColor: colors.bg }]} onPress={() => setShowDatePicker(true)}>
                  <Text style={{ color: localProfile.dateOfBirth ? colors.text : colors.subText, fontSize: 14 }}>{localProfile.dateOfBirth || "DD/MM/YYYY"}</Text>
                  <Ionicons name="calendar-outline" size={18} color={colors.subText} />
                </TouchableOpacity>
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Gender</Text>
                <TouchableOpacity style={[styles.input, styles.pickerRow, { backgroundColor: colors.bg }]} onPress={() => setShowGenderPicker(true)}>
                  <Text style={{ color: localProfile.gender ? colors.text : colors.subText, fontSize: 14 }}>{localProfile.gender || "Select Gender"}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.subText} />
                </TouchableOpacity>
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Blood Group</Text>
                <TouchableOpacity style={[styles.input, styles.pickerRow, { backgroundColor: colors.bg }]} onPress={() => setShowBloodPicker(true)}>
                  <Text style={{ color: localProfile.bloodGroup ? colors.text : colors.subText, fontSize: 14 }}>{localProfile.bloodGroup || "Select Blood Group"}</Text>
                  <Ionicons name="chevron-down" size={18} color={colors.subText} />
                </TouchableOpacity>
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => { setLocalProfile(ownSafeProfile); closeModal(setEditProfileModal); }}>
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.accent }]} onPress={() => { saveProfileData(localProfile); closeModal(setEditProfileModal); }}>
                  <Text style={styles.modalButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Emergency Contact Modal */}
      <Modal transparent visible={emergencyModal} animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalOverlay, { justifyContent: "flex-end" }]}>
            <Animated.View style={[styles.modalCard, styles.bottomSheet, { backgroundColor: colors.card }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Emergency Contact</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 20 }}>
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Contact Name</Text>
                <TextInput placeholder="Contact Name" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={localProfile?.emergencyContact?.name || ""} onChangeText={(t) => setLocalProfile({ ...localProfile, emergencyContact: { ...(localProfile.emergencyContact || {}), name: t } })} />
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Phone Number</Text>
                <TextInput placeholder="Phone Number" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={localProfile?.emergencyContact?.phone || ""} keyboardType="phone-pad" onChangeText={(t) => setLocalProfile({ ...localProfile, emergencyContact: { ...(localProfile.emergencyContact || {}), phone: t } })} />
                <Text style={[styles.fieldLabel, { color: colors.subText }]}>Relation</Text>
                <TextInput placeholder="Relation" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={localProfile?.emergencyContact?.relation || ""} onChangeText={(t) => setLocalProfile({ ...localProfile, emergencyContact: { ...(localProfile.emergencyContact || {}), relation: t } })} />
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => { setLocalProfile(ownSafeProfile); closeModal(setEmergencyModal); }}>
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.accent }]} onPress={() => { saveProfileData(localProfile); closeModal(setEmergencyModal); }}>
                  <Text style={styles.modalButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Medical Modal */}
      <Modal transparent visible={editMedicalModal} animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalOverlay, { justifyContent: "flex-end" }]}>
            <Animated.View style={[styles.modalCard, styles.bottomSheet, { backgroundColor: colors.card, maxHeight: "90%" }]}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.modalTitle, { color: colors.text }]}>Clinical Profile</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                <Text style={{ color: colors.subText, fontSize: 12, marginBottom: 8 }}>Basic Vitals</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Height (cm)</Text>
                    <TextInput placeholder="170" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.height} onChangeText={(t) => setLocalProfile({ ...localProfile, height: t })} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Weight (kg)</Text>
                    <TextInput placeholder="70" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.weight} onChangeText={(t) => setLocalProfile({ ...localProfile, weight: t })} keyboardType="numeric" />
                  </View>
                </View>
                <Text style={{ color: colors.subText, fontSize: 12, marginBottom: 8 }}>Cardiovascular Baseline</Text>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Resting HR</Text>
                    <TextInput placeholder="72" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.biogears_resting_hr?.toString() || "72"} onChangeText={(t) => setLocalProfile({ ...localProfile, biogears_resting_hr: parseInt(t) || 72 })} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Systolic BP</Text>
                    <TextInput placeholder="114" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.biogears_systolic_bp?.toString() || "114"} onChangeText={(t) => setLocalProfile({ ...localProfile, biogears_systolic_bp: parseInt(t) || 114 })} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4 }}>Diastolic BP</Text>
                    <TextInput placeholder="73" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]} value={localProfile.biogears_diastolic_bp?.toString() || "73"} onChangeText={(t) => setLocalProfile({ ...localProfile, biogears_diastolic_bp: parseInt(t) || 73 })} keyboardType="numeric" />
                  </View>
                </View>
                <Text style={{ color: colors.subText, fontSize: 12, marginBottom: 8 }}>Body Composition</Text>
                <View style={{ backgroundColor: colors.bg, padding: 14, borderRadius: 12, marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}>Body Fat %</Text>
                    <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700" }}>{Math.round((localProfile.biogears_body_fat || 0.2) * 100)}%</Text>
                  </View>
                  <Slider style={{ width: "100%", height: 40 }} minimumValue={0.05} maximumValue={0.4} step={0.01} value={localProfile.biogears_body_fat || 0.2} onValueChange={(v) => setLocalProfile({ ...localProfile, biogears_body_fat: v })} minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.border} thumbTintColor={colors.accent} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
                    <Text style={{ color: colors.subText, fontSize: 11 }}>Lean</Text>
                    <Text style={{ color: colors.subText, fontSize: 11 }}>Average</Text>
                    <Text style={{ color: colors.subText, fontSize: 11 }}>Obese</Text>
                  </View>
                </View>
                <Text style={{ color: colors.subText, fontSize: 12, marginBottom: 8 }}>General Health</Text>
                <TextInput placeholder="Allergies (comma separated)" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={(localProfile.allergies || []).join(", ")} onChangeText={(t) => setLocalProfile({ ...localProfile, allergies: t.split(",").map((a) => a.trim()).filter(Boolean) })} />
                <TextInput placeholder="Medications (comma separated)" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={(localProfile.medications || []).join(", ")} onChangeText={(t) => setLocalProfile({ ...localProfile, medications: t.split(",").map((m) => m.trim()).filter(Boolean) })} />
                <Text style={{ color: colors.subText, fontSize: 12, marginBottom: 8, marginTop: 8 }}>Clinical Conditions</Text>
                <View style={{ backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 16, marginBottom: 8 }}>
                  {[
                    { key: "biogears_has_type1_diabetes", label: "Type 1 Diabetes" },
                    { key: "biogears_has_type2_diabetes", label: "Type 2 Diabetes" },
                    { key: "biogears_has_anemia",          label: "Chronic Anemia" },
                    { key: "biogears_is_smoker",           label: "Smoker / COPD" },
                  ].map((item, idx) => (
                    <View key={item.key} style={[styles.settingRow, { borderColor: colors.border, borderBottomWidth: idx === 3 ? 0 : 1 }]}>
                      <Text style={{ color: colors.text, fontSize: 14 }}>{item.label}</Text>
                      <Switch value={(localProfile as any)[item.key] || false} onValueChange={(v) => setLocalProfile({ ...localProfile, [item.key]: v } as any)} trackColor={{ false: colors.border, true: colors.accent }} />
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} disabled={twinStatus === "registering"} onPress={() => { setLocalProfile(ownSafeProfile); closeModal(setEditMedicalModal); }}>
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.accent, flex: 2 }]} disabled={twinStatus === "registering"} onPress={handleRegisterTwin}>
                  {twinStatus === "registering" ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalButtonText}>Save & Calibrate Twin</Text>}
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Family Member Modal */}
      <Modal transparent visible={addMemberModal} animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[styles.modalOverlay, { justifyContent: "flex-end" }]}>
            <View style={[styles.modalCard, styles.bottomSheet, { backgroundColor: colors.card }]}>
              <View style={styles.sheetHandle} />
              <View style={styles.addMemberHeader}>
                <View style={[styles.addMemberIconBox, { backgroundColor: colors.purple + "20" }]}>
                  <Ionicons name="people" size={24} color={colors.purple} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>Add Family Member</Text>
              </View>
              <Text style={[styles.addMemberSubtitle, { color: colors.subText }]}>Enter their name and VitalHealth Health ID to link your health data.</Text>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
                <TextInput placeholder="Their Name (e.g., Rahul)" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={newMemberName} onChangeText={setNewMemberName} />
                <TextInput placeholder="Their Health ID (e.g., VT-AB12-CD34)" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={newMemberHealthId} onChangeText={(t) => { setNewMemberHealthId(t.toUpperCase().replace(/\s/g, "-")); setSearchError(""); }} autoCapitalize="characters" />
                <TextInput placeholder="Relation (optional — e.g., Father, Friend)" placeholderTextColor={colors.subText} style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]} value={newMemberRelation} onChangeText={setNewMemberRelation} />
                {searchError ? <Text style={[styles.searchError, { color: colors.danger }]}>⚠️ {searchError}</Text> : null}
                <View style={[styles.howItWorks, { backgroundColor: colors.familyBg, borderColor: colors.familyBorder }]}>
                  <Text style={[styles.howItWorksTitle, { color: colors.text }]}>How it works</Text>
                  {["1. Ask your family member to open VitalHealth","2. Go to Profile → Family Health → copy their Health ID","3. Enter their Health ID here","4. Both of you can now view each other's health data ✓"].map((step, i) => <Text key={i} style={[styles.howItWorksStep, { color: colors.subText }]}>{step}</Text>)}
                </View>
              </ScrollView>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.border }]} onPress={() => { setAddMemberModal(false); setNewMemberName(""); setNewMemberHealthId(""); setNewMemberRelation(""); setSearchError(""); }}>
                  <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, { backgroundColor: colors.purple, opacity: searchLoading ? 0.7 : 1 }]} onPress={addFamilyMember} disabled={searchLoading}>
                  <Text style={styles.modalButtonText}>{searchLoading ? "Searching..." : "Add Member"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ✅ Floating switch banner — slides in on top of everything */}
      <ActiveProfileBanner />
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const InfoRow = ({ label, value, icon, colors }: any) => (
  <View style={styles.infoRow}>
    <View style={styles.infoLeft}>
      <Ionicons name={icon} size={18} color={colors.subText} />
      <Text style={[styles.infoLabel, { color: colors.subText }]}>{label}</Text>
    </View>
    <Text style={[styles.infoValue, { color: colors.text }]}>{value || "--"}</Text>
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: { paddingTop: 100, paddingBottom: 30, paddingHorizontal: 20, alignItems: "center", borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  viewingHeaderBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 12 },
  viewingHeaderText: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600" },
  profileImageContainer: { position: "relative", marginBottom: 15 },
  profileImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: "#fff" },
  profileImagePlaceholder: { width: 100, height: 100, borderRadius: 50, justifyContent: "center", alignItems: "center", borderWidth: 3, borderColor: "#fff" },
  profileImageInitial: { fontSize: 36, fontWeight: "bold" },
  editBadge: { position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  profileName: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 4 },
  profileEmail: { fontSize: 14, color: "#fff", opacity: 0.9, marginBottom: 20 },
  profileStats: { flexDirection: "row", alignItems: "center" },
  statItem: { alignItems: "center", paddingHorizontal: 20 },
  statValue: { fontSize: 18, fontWeight: "bold", color: "#fff", marginBottom: 2 },
  statLabel: { fontSize: 12, color: "#fff", opacity: 0.8 },
  statDivider: { width: 1, height: 30, backgroundColor: "#fff", opacity: 0.3 },
  section: { margin: 16, padding: 16, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitleContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  infoGrid: { gap: 12 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  infoLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: "500", maxWidth: "55%", textAlign: "right" },
  medicalGrid: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  medicalItem: { alignItems: "center" },
  medicalLabel: { fontSize: 12, marginBottom: 4 },
  medicalValue: { fontSize: 16, fontWeight: "600" },
  medicationsSection: { marginBottom: 8 },
  subsectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 10 },
  tagContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 4 },
  tagText: { fontSize: 12, fontWeight: "500" },
  conditionsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  twinStatusBox: { padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 16 },
  twinStatusHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  twinStatusText: { fontSize: 14, fontWeight: "600", flex: 1 },
  twinActionBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  twinActionBtnText: { fontSize: 14, fontWeight: "700" },
  emergencyCard: { margin: 16, padding: 16, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  emergencyHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  emergencyIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  emergencyInfo: { flex: 1 },
  emergencyTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  emergencyName: { fontSize: 12, marginBottom: 2 },
  emergencyPhone: { fontSize: 14, fontWeight: "500" },
  familySubtitle: { fontSize: 12, marginBottom: 16, marginTop: -8 },
  addMemberBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addMemberBtnText: { fontSize: 13, fontWeight: "600" },
  memberScroll: { paddingBottom: 8, paddingRight: 8, gap: 12 },
  memberCard: { width: 96, alignItems: "center", padding: 12, borderRadius: 20, gap: 4 },
  memberCardAdd: { width: 96, alignItems: "center", padding: 12, borderRadius: 20, borderWidth: 1, borderStyle: "dashed", gap: 4 },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  memberAvatarAdd: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  memberAvatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  memberName: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  memberRelation: { fontSize: 10, textAlign: "center" },
  memberStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
  memberStatusText: { fontSize: 9, fontWeight: "700" },
  activeCheckmark: { position: "absolute", bottom: 0, right: -2, backgroundColor: "#fff", borderRadius: 9, width: 18, height: 18, justifyContent: "center", alignItems: "center" },
  myCodeBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 16, borderWidth: 1, marginTop: 16 },
  myCodeLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  myCodeIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: 10 },
  myCodeLabel: { fontSize: 11, marginBottom: 2 },
  myCodeValue: { fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  myCodeSub: { fontSize: 10, marginTop: 2 },
  myCodeActions: { flexDirection: "column", gap: 8 },
  codeActionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  familyHint: { fontSize: 11, marginTop: 10, textAlign: "center" },
  addMemberHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  addMemberIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  addMemberSubtitle: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  howItWorks: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 16, gap: 4 },
  howItWorksTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  howItWorksStep: { fontSize: 12, lineHeight: 18 },
  searchError: { fontSize: 13, marginBottom: 10, marginTop: -4, paddingHorizontal: 4 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  settingsLinkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  settingInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingLabel: { fontSize: 14, fontWeight: "500" },
  logoutButton: { margin: 16, padding: 16, borderRadius: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  logoutText: { fontSize: 16, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { borderRadius: 24, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  bottomSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingTop: 12, maxHeight: "88%" },
  sheetHandle: { width: 40, height: 4, backgroundColor: "#94a3b8", borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 20 },
  fieldLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginBottom: 4, marginLeft: 2 },
  input: { borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 14 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, gap: 12 },
  modalButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
  modalButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  phoneRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  phonePrefixBox: { paddingHorizontal: 12, paddingVertical: 14, borderRightWidth: 1, alignItems: "center", justifyContent: "center" },
  phonePrefix: { fontSize: 14, fontWeight: "600" },
  phoneInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 14, fontSize: 14 },
});