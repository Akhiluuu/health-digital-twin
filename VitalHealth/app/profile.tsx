// app/profile.tsx
// PROFESSIONAL PROFILE PAGE — With Family Member Switching

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { useFamily } from "../context/FamilyContext";
import { 
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  ScrollView, Share, StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import Slider from "@react-native-community/slider";

import { syncMedicinesFromFirebase } from "@/services/medicineSync";
import { signOut } from "firebase/auth";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import { useProfile } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";
import { getTwinId } from "../utils/twinUtils";
import {
  fetchLinkedMembers,
  LinkedMember,
  unlinkFamilyMember
} from "../services/familySync";
import { auth } from "../services/firebase";
import { findUserByHealthId } from "../services/firebaseService";
import { BiogearsRegistrationPayload } from "../services/biogears";
import { UserProfile } from "../services/profileService";
import { FamilyMember } from "../types/FamilyMember"; // ✅ FIX: Import shared type instead of declaring locally
import Header from "./components/Header";
import { log, error } from "../utils/logger";

const { width } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────
type AppSettings = {
  notifications: boolean;
  darkMode: boolean;
  biometric: boolean;
  dataSaving: boolean;
  language: string;
};

// ✅ FIX: REMOVED duplicate local FamilyMember type definition.
// It was shadowing the shared type from types/FamilyMember.ts and causing
// structural mismatches with FamilyContext's addMember() — ts(2345).

// ─────────────────────────────────────────────────────────────────────────────

// ✅ STEP 1: Helper to extract a valid ID from any member type
const getMemberId = (member: FamilyMember | LinkedMember): string => {
  if ("id" in member && member.id) {
    return member.id.toString();
  }
  if ("uid" in member && member.uid) {
    return member.uid.toString();
  }
  if ("userId" in member && member.userId) {
    return member.userId.toString();
  }
  throw new Error("Invalid member: No ID found");
};

export default function ProfileScreen() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const colors = theme === "light"
    ? {
        bg: "#f8fafc",
        card: "#ffffff",
        border: "#e2e8f0",
        text: "#020617",
        subText: "#64748b",
        accent: "#2563eb",
        accentLight: "#dbeafe",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        purple: "#8b5cf6",
        modalOverlay: "rgba(0,0,0,0.3)",
        gradientStart: "#2563eb",
        gradientEnd: "#7c3aed",
        familyBg: "#f0f9ff",
        familyBorder: "#bae6fd",
      }
    : {
        bg: "#020617",
        card: "#1e293b",
        border: "#334155",
        text: "#f1f5f9",
        subText: "#94a3b8",
        accent: "#3b82f6",
        accentLight: "#1e3a8a",
        success: "#22c55e",
        warning: "#f59e0b",
        danger: "#ef4444",
        purple: "#a78bfa",
        modalOverlay: "rgba(0,0,0,0.6)",
        gradientStart: "#3b82f6",
        gradientEnd: "#8b5cf6",
        familyBg: "#0c1929",
        familyBorder: "#1e3a5f",
      };

  // ── Profile from Context ──────────────────────────────────────────────────
  const { addMember, removeMember, members } = useFamily();

  const { profile, updateProfile, isLoaded, isProfileComplete, resetProfile, reloadProfile } = useProfile();
  const { twinStatus, twinStatusError, simulationProgress, registerTwin } = useBiogearsTwin();

  // ✅ FIX: Re-read from AsyncStorage every time this page gains focus.
  useFocusEffect(
    React.useCallback(() => {
      reloadProfile();
       syncMedicinesFromFirebase();
    }, [])
  );

  const defaultProfile: UserProfile = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    bloodGroup: "",
    height: "",
    weight: "",
    allergies: [],
    medications: [],
    emergencyContact: {
      name: "",
      phone: "",
      relation: "",
    },
  };

  // ✅ FIX 1: SAFE PROFILE OBJECT
  const [localProfile, setLocalProfile] = useState<UserProfile>({
  ...defaultProfile,
  ...(profile || {}),
});

  // ✅ FIX: Replace the problematic useEffect with safe version
  useEffect(() => {
  setLocalProfile({
    ...defaultProfile,
    ...(profile || {}),
  });
}, [profile]);

  // ✅ FIX 3: OPTIONAL SAFETY IMPROVEMENT
  const safeProfile = {
    ...defaultProfile,
    ...(profile || {}),
  };

  const [settings, setSettings] = useState<AppSettings>({
    notifications: true,
    darkMode: theme === "dark",
    biometric: false,
    dataSaving: true,
    language: "English",
  });

  // ── Family State ───────────────────────────────────────────────────────────
  const [myInviteCode, setMyInviteCode] = useState<string>("");
  const [activeMemberId, setActiveMemberId]   = useState<string>("self");
  const [addMemberModal, setAddMemberModal]   = useState(false);
  const [switchAnim]                          = useState(new Animated.Value(1));

  const [newMemberName,     setNewMemberName]     = useState("");
  const [newMemberRelation, setNewMemberRelation] = useState("");
  const [newMemberHealthId, setNewMemberHealthId] = useState("");
  const [searchLoading,     setSearchLoading]     = useState(false);
  const [searchError,       setSearchError]       = useState("");
  const [linkedMembers,     setLinkedMembers]     = useState<LinkedMember[]>([]);

  // ── Modal State ────────────────────────────────────────────────────────────
  const [editProfileModal, setEditProfileModal]  = useState(false);
  const [editMedicalModal, setEditMedicalModal]  = useState(false);
  const [emergencyModal,   setEmergencyModal]    = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Load / Save ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadSettings();
    loadMyInviteCode();
    loadLinkedMembers();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please grant camera roll permissions to change profile picture");
    }
  };

  const loadSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem("appSettings");
      if (saved) setSettings(JSON.parse(saved));
    } catch (e) { console.log(e); }
  };

  // ✅ Generate a unique invite code based on user name, persist it so it never changes
  const loadMyInviteCode = async () => {
    try {
      const stored = await AsyncStorage.getItem("myInviteCode");
      if (stored && stored.startsWith("VT-")) {
        setMyInviteCode(stored);
        await updateProfile({ inviteCode: stored });
      } else {
        const code = generateMyCode(safeProfile.firstName, safeProfile.lastName);
        await AsyncStorage.setItem("myInviteCode", code);
        setMyInviteCode(code);
        await updateProfile({ inviteCode: code });
        console.log("✅ Generated new invite code:", code);
      }
    } catch (e) { console.log(e); }
  };

  // ✅ Format: VT-<first4ofUID>-<last4ofUID>
  const generateMyCode = (firstName: string, lastName: string): string => {
    const user = auth.currentUser;
    if (user?.uid) {
      const uid   = user.uid.replace(/-/g, "");
      const part1 = uid.substring(0, 4).toUpperCase();
      const part2 = uid.substring(uid.length - 4).toUpperCase();
      return `VT-${part1}-${part2}`;
    }
    const f = (firstName?.charAt(0) || "U").toUpperCase();
    const l = (lastName?.charAt(0)  || "X").toUpperCase();
    const ts = Date.now().toString().slice(-6);
    return `VT-${f}${l}${ts.substring(0,4)}-${ts.substring(2)}`;
  };

  const loadLinkedMembers = async () => {
    try {
      const fetchedMembers = await fetchLinkedMembers();
      setLinkedMembers(fetchedMembers);

      // ✅ FIX: Sync with FamilyContext using ?? "" to guarantee string types,
      // resolving ts(2345) — FamilyMember requires firstName: string (not undefined)
      for (const member of fetchedMembers) {
        const id =
          member.uid?.toString() ||
          member.userId?.toString() ||
          member.id?.toString();

        if (!id) continue;

        const exists = members.some((m) => m.id === id);

        if (!exists) {
          await addMember({
            id,
            uid: id,
            userId: id,
            firstName: member.firstName ?? "",   // ✅ FIX: guarantee string, never undefined
            lastName: member.lastName ?? "",     // ✅ FIX: guarantee string, never undefined
            relation: member.relation || "Family",
            inviteCode: member.inviteCode || "",
            status: member.status || "active",
          });
        }
      }

      console.log("✅ Linked members loaded and synced:", fetchedMembers.length);
    } catch (e) {
      console.log("❌ Error loading linked members:", e);
    }
  };

  // ✅ STEP 1: FIXED saveProfileData() with proper emergencyContact handling and reload
  const saveProfileData = async (newProfile: UserProfile) => {
    try {
      await updateProfile({
        ...newProfile,
        emergencyContact: {
          name: newProfile.emergencyContact?.name || "",
          phone: newProfile.emergencyContact?.phone || "",
          relation: newProfile.emergencyContact?.relation || "",
        },
      });

      setLocalProfile(newProfile);
      await reloadProfile();
      
      console.log("✅ Profile saved correctly and reloaded:", newProfile);
    } catch (e) {
      console.log("❌ saveProfileData error:", e);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem("appSettings", JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (e) { console.log(e); }
  };

  // ── Family Actions ─────────────────────────────────────────────────────────

  const switchToMember = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) {
      Alert.alert("Error", "Member not found.");
      return;
    }

    Animated.sequence([
      Animated.timing(switchAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(switchAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    setActiveMemberId(memberId);
    AsyncStorage.setItem("activeMemberId", memberId);

    if (memberId !== "self") {
      Alert.alert(
        `Viewing ${member.firstName}'s Health`,
        `You are now viewing ${member.firstName} ${member.lastName}'s health data.`,
        [{ text: "Got it" }]
      );
    }
  };

  // ✅ STEP 2: UPDATED openMemberProfile FUNCTION with getMemberId helper
  const openMemberProfile = (member: FamilyMember | LinkedMember) => {
    try {
      const userId = getMemberId(member);

      router.push({
        pathname: "/member-health",
        params: {
          userId,
          name: `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim(),
        },
      });
    } catch (error) {
      Alert.alert("Error", "Invalid member selected.");
      console.error("Navigation Error:", error);
    }
  };

  const generateInviteCode = (firstName: string, lastName: string) => {
    const namePart =
      (firstName?.substring(0, 2) || "VH") +
      (lastName?.substring(0, 2) || "HL");
    const random = Math.floor(1000 + Math.random() * 9000);
    return `VH-${namePart.toUpperCase()}-${random}`;
  };

  // ✅ UPDATED: New addFamilyMember function with proper Firebase linking and storage
  const addFamilyMember = async () => {
    if (!newMemberName.trim() || !newMemberHealthId.trim()) {
      Alert.alert("Missing Info", "Please enter name and health ID.");
      return;
    }

    setSearchLoading(true);
    setSearchError("");

    try {
      const found = await findUserByHealthId(newMemberHealthId.trim());

      if (!found) {
        setSearchError("No user found with this Health ID.");
        return;
      }

      if (members.some((m) => m.id === found.uid)) {
        Alert.alert("Already Added", "This member is already linked.");
        return;
      }

      await addMember({
        id: found.uid,
        uid: found.uid,
        userId: found.uid,
        firstName: found.firstName ?? "",   // ✅ FIX: guarantee string
        lastName: found.lastName ?? "",     // ✅ FIX: guarantee string
        relation: newMemberRelation || "Family",
        inviteCode: found.inviteCode || "",
        status: "active",
      });

      await loadLinkedMembers();

      setAddMemberModal(false);
      setNewMemberName("");
      setNewMemberHealthId("");
      setNewMemberRelation("");
      setSearchError("");

      Alert.alert("Success", "Family member added successfully!");
    } catch (e) {
      console.log("❌ Error:", e);
      setSearchError("Something went wrong.");
    } finally {
      setSearchLoading(false);
    }
  };

  // ✅ STEP 4: UPDATED REMOVE MEMBER FUNCTION
  const removeFamilyMember = (id: string) => {
    Alert.alert(
      "Remove Member",
      "Are you sure you want to remove this family member?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await unlinkFamilyMember(id);
            await removeMember(id);
            await loadLinkedMembers();

            if (activeMemberId === id) {
              setActiveMemberId("self");
              await AsyncStorage.setItem("activeMemberId", "self");
            }
          },
        },
      ]
    );
  };

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openModal = (setter: (v: boolean) => void) => {
    setter(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  };

  const closeModal = (setter: (v: boolean) => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setter(false));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      const updated = { ...localProfile, profileImage: result.assets[0].uri };
      setLocalProfile(updated);
      saveProfileData(updated);
    }
  };

  const toggleSetting = (key: keyof AppSettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    saveSettings(newSettings);
    if (key === "darkMode") toggleTheme();
  };

  // ── Active member banner ───────────────────────────────────────────────────
  const activeMember = members.find(m => m.id === activeMemberId);
  const isViewingOther = activeMemberId !== "self";

  // ✅ FIX: Loading check is now AFTER all hooks
  if (!isLoaded) {
    return (
      <View style={[styles.container, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
        <Header />
        <Text style={{ color: colors.text, fontSize: 16, marginTop: 20 }}>
          Loading profile...
        </Text>
      </View>
    );
  }

  const renderProfileHeader = () => (
    <LinearGradient
      colors={[colors.gradientStart, colors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.profileHeader}
    >
      {isViewingOther && (
        <TouchableOpacity
          style={styles.viewingBanner}
          onPress={() => switchToMember("self")}
        >
          <Ionicons name="eye" size={14} color="#fff" />
          <Text style={styles.viewingBannerText}>
            Viewing {activeMember?.firstName}'s health · Tap to return
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={pickImage} style={styles.profileImageContainer}>
        {safeProfile.profileImage ? (
          <Image source={{ uri: safeProfile.profileImage }} style={styles.profileImage} />
        ) : (
          <View style={[styles.profileImagePlaceholder, { backgroundColor: colors.card }]}>
            <Text style={[styles.profileImageInitial, { color: colors.accent }]}>
              {safeProfile?.firstName?.charAt(0) || ""}{safeProfile?.lastName?.charAt(0) || ""}
            </Text>
          </View>
        )}
        <View style={[styles.editBadge, { backgroundColor: colors.card }]}>
          <Ionicons name="camera" size={14} color={colors.accent} />
        </View>
      </TouchableOpacity>

      <Text style={styles.profileName}>{safeProfile.firstName} {safeProfile.lastName}</Text>
      <Text style={styles.profileEmail}>{safeProfile.email}</Text>

      <View style={styles.profileStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{safeProfile.height || "--"}</Text>
          <Text style={styles.statLabel}>Height</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{safeProfile.weight || "--"}</Text>
          <Text style={styles.statLabel}>Weight</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{safeProfile.bloodGroup || "--"}</Text>
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Personal Information</Text>
        </View>
        <TouchableOpacity onPress={() => openModal(setEditProfileModal)}>
          <Ionicons name="create-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>
      <View style={styles.infoGrid}>
        <InfoRow label="Full Name"     value={`${safeProfile.firstName} ${safeProfile.lastName}`} icon="person-outline"      colors={colors} />
        <InfoRow label="Email"         value={safeProfile.email}                               icon="mail-outline"        colors={colors} />
        <InfoRow label="Phone"         value={safeProfile.phone}                               icon="call-outline"        colors={colors} />
        <InfoRow label="Date of Birth" value={safeProfile.dateOfBirth}                         icon="calendar-outline"    colors={colors} />
        <InfoRow label="Gender"        value={safeProfile.gender}                              icon="male-female-outline" colors={colors} />
        <InfoRow label="Blood Group"   value={safeProfile.bloodGroup}                          icon="water-outline"       colors={colors} />
      </View>
    </View>
  );

  const parseAge = (dob?: string) => {
    if (!dob) return 30;
    const parts = dob.split('/');
    if (parts.length === 3) {
      const year = parts[2].length === 2 ? parseInt('20' + parts[2]) : parseInt(parts[2]);
      const dbDate = new Date(year, parseInt(parts[1])-1, parseInt(parts[0]));
      return Math.abs(new Date(Date.now() - dbDate.getTime()).getUTCFullYear() - 1970);
    }
    return 30;
  };

  const parseKg = (weight?: string) => {
    if (!weight) return 70.0;
    const match = weight.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 70.0;
  };

  const parseCm = (height?: string) => {
    if (!height) return 170.0;
    const match = height.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 170.0;
  };

  const handleRegisterTwin = async () => {
    const missing = [];
    if (!localProfile.firstName) missing.push("First Name");
    if (!localProfile.lastName) missing.push("Last Name");
    if (!localProfile.phone) missing.push("Phone Number");
    if (!localProfile.dateOfBirth) missing.push("Date of Birth");
    if (!localProfile.height) missing.push("Height");
    if (!localProfile.weight) missing.push("Weight");
    if (!localProfile.biogears_resting_hr) missing.push("Resting Heart Rate");
    if (!localProfile.biogears_systolic_bp) missing.push("Systolic BP");
    if (!localProfile.biogears_diastolic_bp) missing.push("Diastolic BP");

    if (missing.length > 0) {
      Alert.alert(
        "Missing Profile Data",
        `BioGears requires a complete physiological baseline to calibrate your twin accurately. Please provide:\n\n• ${missing.join("\n• ")}`,
        [{ text: "OK" }]
      );
      return;
    }

    try {
      await saveProfileData(localProfile);

      const generatedId = getTwinId(localProfile);
      const payload: BiogearsRegistrationPayload = {
        user_id: generatedId,
        age: parseAge(localProfile.dateOfBirth),
        weight: parseKg(localProfile.weight),
        height: parseCm(localProfile.height),
        sex: (localProfile.gender?.toLowerCase() === 'female' ? 'Female' : 'Male'),
        body_fat: localProfile.biogears_body_fat,
        resting_hr: localProfile.biogears_resting_hr,
        systolic_bp: localProfile.biogears_systolic_bp,
        diastolic_bp: localProfile.biogears_diastolic_bp,
        is_smoker: localProfile.biogears_is_smoker,
        has_anemia: localProfile.biogears_has_anemia,
        has_type1_diabetes: localProfile.biogears_has_type1_diabetes,
        has_type2_diabetes: localProfile.biogears_has_type2_diabetes,
        hba1c: localProfile.biogears_hba1c,
        ethnicity: localProfile.biogears_ethnicity,
        fitness_level: localProfile.biogears_fitness_level,
        vo2max: localProfile.biogears_vo2max,
        current_medications: localProfile.medications,
      };

      await registerTwin(payload);
      
      Alert.alert(
        "Calibration Successful",
        "Your Digital Twin has been computed and saved. You can now run physiological simulations in the command center.",
        [{ text: "Great!", onPress: () => closeModal(setEditMedicalModal) }]
      );
    } catch (err: any) {
      Alert.alert("Calibration Failed", err.message || "Could not reach BioGears server.");
    }
  };

  const renderMedicalInfo = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleContainer}>
          <Ionicons name="medical" size={20} color={colors.accent} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>BioGears Clinical Profile</Text>
        </View>
        <TouchableOpacity onPress={() => openModal(setEditMedicalModal)}>
          <Ionicons name="create-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.medicalGrid}>
        <View style={styles.medicalItem}>
          <Text style={[styles.medicalLabel, { color: colors.subText }]}>Height</Text>
          <Text style={[styles.medicalValue, { color: colors.text }]}>{safeProfile.height || "--"}</Text>
        </View>
        <View style={styles.medicalItem}>
          <Text style={[styles.medicalLabel, { color: colors.subText }]}>Weight</Text>
          <Text style={[styles.medicalValue, { color: colors.text }]}>{safeProfile.weight || "--"}</Text>
        </View>
        <View style={styles.medicalItem}>
          <Text style={[styles.medicalLabel, { color: colors.subText }]}>Resting HR</Text>
          <Text style={[styles.medicalValue, { color: colors.text }]}>{safeProfile.biogears_resting_hr || 72} bpm</Text>
        </View>
        <View style={styles.medicalItem}>
          <Text style={[styles.medicalLabel, { color: colors.subText }]}>Blood Pressure</Text>
          <Text style={[styles.medicalValue, { color: colors.text }]}>
            {safeProfile.biogears_systolic_bp || 114}/{safeProfile.biogears_diastolic_bp || 73}
          </Text>
        </View>
      </View>
      
      <View style={styles.medicalGrid}>
        <View style={styles.medicalItem}>
          <Text style={[styles.medicalLabel, { color: colors.subText }]}>Body Fat</Text>
          <Text style={[styles.medicalValue, { color: colors.text }]}>
            {Math.round((safeProfile.biogears_body_fat || 0.2) * 100)}%
          </Text>
        </View>
        <View style={styles.medicalItem}>
          <Text style={[styles.medicalLabel, { color: colors.subText }]}>Fitness</Text>
          <Text style={[styles.medicalValue, { color: colors.text, textTransform: 'capitalize' }]}>
            {safeProfile.biogears_fitness_level || 'Sedentary'}
          </Text>
        </View>
      </View>

      {/* Clinical Conditions */}
      <View style={styles.conditionsContainer}>
        {[
          { key: 'biogears_has_type1_diabetes', label: 'Type 1 Diabetes', color: colors.danger },
          { key: 'biogears_has_type2_diabetes', label: 'Type 2 Diabetes', color: colors.danger },
          { key: 'biogears_has_anemia', label: 'Chronic Anemia', color: colors.warning },
          { key: 'biogears_is_smoker', label: 'Smoker (COPD)', color: colors.warning },
        ].map((cond) => {
          if (!safeProfile[cond.key as keyof UserProfile]) return null;
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
          {(Array.isArray(safeProfile?.allergies) ? safeProfile.allergies : []).map((a, i) => (
            <View key={i} style={[styles.tag, { backgroundColor: colors.warning + "20" }]}>
              <Ionicons name="alert-circle" size={14} color={colors.warning} />
              <Text style={[styles.tagText, { color: colors.warning }]}>{a}</Text>
            </View>
          ))}
        </View>
      </View>
      
      <View style={styles.medicationsSection}>
        <Text style={[styles.subsectionTitle, { color: colors.subText, fontSize: 12 }]}>Current Medications</Text>
        <View style={styles.tagContainer}>
          {(Array.isArray(safeProfile?.medications) ? safeProfile.medications : []).map((m, i) => (
            <View key={i} style={[styles.tag, { backgroundColor: colors.success + "20" }]}>
              <Ionicons name="medkit" size={14} color={colors.success} />
              <Text style={[styles.tagText, { color: colors.success }]}>{m}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Twin Registration Status Block */}
      <View style={[styles.twinStatusBox, { 
        borderColor: safeProfile.biogears_registered ? colors.success : colors.danger,
        backgroundColor: safeProfile.biogears_registered ? colors.success + "10" : colors.danger + "10"
      }]}>
        <View style={styles.twinStatusHeader}>
          <Ionicons 
            name={safeProfile.biogears_registered ? "checkmark-circle" : "warning"} 
            size={20} 
            color={safeProfile.biogears_registered ? colors.success : colors.danger} 
          />
          <Text style={[styles.twinStatusText, { color: safeProfile.biogears_registered ? colors.success : colors.danger }]}>
            {twinStatus === 'registering' 
              ? 'Calibrating Twin Engine...' 
              : safeProfile.biogears_registered 
                ? 'Clinical Engine Calibrated' 
                : 'Twin Profile Uncalibrated'}
          </Text>
        </View>
        <TouchableOpacity 
          style={[styles.twinActionBtn, { 
            backgroundColor: safeProfile.biogears_registered ? colors.card : colors.danger,
            borderColor: safeProfile.biogears_registered ? colors.success : 'transparent',
            borderWidth: safeProfile.biogears_registered ? 1 : 0
          }]}
          onPress={handleRegisterTwin}
          disabled={twinStatus === 'registering'}
        >
          {twinStatus === 'registering' ? (
            <Text style={{color: '#fff', fontSize: 13, fontWeight: 'bold'}}>Please Wait... {simulationProgress}</Text>
          ) : (
            <Text style={[styles.twinActionBtnText, { color: safeProfile.biogears_registered ? colors.success : '#fff' }]}>
              {safeProfile.biogears_registered ? "Recalibrate Engine" : "Calibrate Twin System"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );

  const renderEmergencyContact = () => (
    <TouchableOpacity
      style={[styles.emergencyCard, { backgroundColor: colors.card }]}
      onPress={() => openModal(setEmergencyModal)}
    >
      <View style={styles.emergencyHeader}>
        <View style={[styles.emergencyIcon, { backgroundColor: colors.danger + "20" }]}>
          <Ionicons name="alert-circle" size={24} color={colors.danger} />
        </View>
        <View style={styles.emergencyInfo}>
          <Text style={[styles.emergencyTitle, { color: colors.text }]}>Emergency Contact</Text>
          <Text style={[styles.emergencyName, { color: colors.subText }]}>
            {safeProfile?.emergencyContact?.name || "Not set"} • {safeProfile?.emergencyContact?.relation || ""}
          </Text>
          <Text style={[styles.emergencyPhone, { color: colors.accent }]}>
            {safeProfile?.emergencyContact?.phone || "Not set"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.subText} />
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
        <TouchableOpacity
          style={[styles.addMemberBtn, { backgroundColor: colors.purple + "20" }]}
          onPress={() => setAddMemberModal(true)}
        >
          <Ionicons name="person-add" size={16} color={colors.purple} />
          <Text style={[styles.addMemberBtnText, { color: colors.purple }]}>Add</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.familySubtitle, { color: colors.subText }]}>
        Enter a member's Health ID to view their medicines and symptoms
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.memberScroll}
      >
        {members.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={[styles.memberCard, {
              backgroundColor: colors.familyBg,
              borderColor: colors.familyBorder,
              borderWidth: 1,
            }]}
            onPress={() => openMemberProfile(member)}
            onLongPress={() => {
              Alert.alert(
                "Remove Member",
                `Remove ${member.firstName} from your family health network?`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => removeFamilyMember(member.id),
                  },
                ]
              );
            }}
            activeOpacity={0.8}
          >
            <View style={[styles.memberAvatar, { backgroundColor: colors.purple }]}>
              <Text style={styles.memberAvatarText}>
                {member.firstName?.charAt(0) ?? ""}
                {member.lastName?.charAt(0) ?? ""}
              </Text>
            </View>

            <Text style={[styles.memberName, { color: colors.text }]} numberOfLines={1}>
              {member.firstName}
            </Text>
            <Text style={[styles.memberRelation, { color: colors.subText }]}>
              {member.relation ?? "Family"}
            </Text>

            <View style={[styles.memberStatusPill, { backgroundColor: colors.success + "20" }]}>
              <Text style={[styles.memberStatusText, { color: colors.success }]}>Linked ✓</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Add member button */}
        <TouchableOpacity
          style={[styles.memberCardAdd, { borderColor: colors.border, backgroundColor: colors.familyBg }]}
          onPress={() => setAddMemberModal(true)}
        >
          <View style={[styles.memberAvatarAdd, { backgroundColor: colors.border }]}>
            <Ionicons name="add" size={24} color={colors.subText} />
          </View>
          <Text style={[styles.memberName, { color: colors.subText }]}>Add</Text>
          <Text style={[styles.memberRelation, { color: colors.subText }]}>Member</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ✅ My Unique Invite Code */}
      <View style={[styles.myCodeBox, { backgroundColor: colors.familyBg, borderColor: colors.familyBorder }]}>
        <View style={styles.myCodeLeft}>
          <View style={[styles.myCodeIconBox, { backgroundColor: colors.purple + "20" }]}>
            <Ionicons name="qr-code" size={20} color={colors.purple} />
          </View>
          <View>
            <Text style={[styles.myCodeLabel, { color: colors.subText }]}>My Unique Health ID</Text>
            <Text style={[styles.myCodeValue, { color: colors.purple }]}>
              {myInviteCode || "Generating..."}
            </Text>
            <Text style={[styles.myCodeSub, { color: colors.subText }]}>
              Share with family to link health data
            </Text>
          </View>
        </View>
        <View style={styles.myCodeActions}>
          <TouchableOpacity
            style={[styles.codeActionBtn, { backgroundColor: colors.accent + "20" }]}
            onPress={() => {
              Alert.alert("Copied!", `Your code: ${myInviteCode}`);
            }}
          >
            <Ionicons name="copy-outline" size={16} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.codeActionBtn, { backgroundColor: colors.purple }]}
            onPress={() => {
              Share.share({
                message: `Join me on VitalHealth! Use my invite code: ${myInviteCode} to link our health data.`,
                title: "VitalHealth Invite Code",
              });
            }}
          >
            <Ionicons name="share-social" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.familyHint, { color: colors.subText }]}>
        💡 Long press a member card to remove them
      </Text>
    </View>
  );

  const renderAppSettings = () => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <TouchableOpacity
        style={styles.settingsLinkRow}
        onPress={() => router.push("/settings")}
      >
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
      onPress={() => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Logout",
            style: "destructive",
            onPress: async () => {
              await AsyncStorage.clear();
              await resetProfile();
              try { await signOut(auth); } catch (e) { console.log(e); }
              router.replace("/welcome");
            },
          },
        ]);
      }}
    >
      <Ionicons name="log-out-outline" size={22} color={colors.danger} />
      <Text style={[styles.logoutText, { color: colors.danger }]}>Logout</Text>
    </TouchableOpacity>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────

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

      {/* ── Edit Profile Modal ──────────────────────────────────────────── */}
      <Modal transparent visible={editProfileModal} animationType="none">
        <BlurView intensity={80} style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { opacity: fadeAnim, backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
            {[
              { placeholder: "First Name",    key: "firstName"   },
              { placeholder: "Last Name",     key: "lastName"    },
              { placeholder: "Email",         key: "email"       },
              { placeholder: "Phone",         key: "phone"       },
              { placeholder: "Date of Birth", key: "dateOfBirth" },
              { placeholder: "Gender",        key: "gender"      },
              { placeholder: "Blood Group",   key: "bloodGroup"  },
            ].map(field => (
              <TextInput
                key={field.key}
                placeholder={field.placeholder}
                placeholderTextColor={colors.subText}
                style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
                value={localProfile[field.key as keyof UserProfile] as string}
                onChangeText={(text) => setLocalProfile({ ...localProfile, [field.key]: text })}
              />
            ))}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => { setLocalProfile(safeProfile); closeModal(setEditProfileModal); }}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.accent }]}
                onPress={() => { saveProfileData(localProfile); closeModal(setEditProfileModal); }}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </Modal>

      {/* ── Emergency Contact Modal ─────────────────────────────────────── */}
      <Modal transparent visible={emergencyModal} animationType="none">
        <BlurView intensity={80} style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { opacity: fadeAnim, backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Emergency Contact</Text>
            <TextInput
              placeholder="Contact Name"
              placeholderTextColor={colors.subText}
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
              value={localProfile?.emergencyContact?.name || ""}
              onChangeText={(text) =>
                setLocalProfile({ ...localProfile, emergencyContact: {
                  ...(localProfile.emergencyContact || {}),
                  name: text
                }})
              }
            />
            <TextInput
              placeholder="Phone Number"
              placeholderTextColor={colors.subText}
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
              value={localProfile?.emergencyContact?.phone || ""}
              keyboardType="phone-pad"
              onChangeText={(text) =>
                setLocalProfile({ ...localProfile, emergencyContact: {
                  ...(localProfile.emergencyContact || {}),
                  phone: text
                }})
              }
            />
            <TextInput
              placeholder="Relation"
              placeholderTextColor={colors.subText}
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
              value={localProfile?.emergencyContact?.relation || ""}
              onChangeText={(text) =>
                setLocalProfile({ ...localProfile, emergencyContact: {
                  ...(localProfile.emergencyContact || {}),
                  relation: text
                }})
              }
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => { setLocalProfile(safeProfile); closeModal(setEmergencyModal); }}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.accent }]}
                onPress={() => { saveProfileData(localProfile); closeModal(setEmergencyModal); }}
              >
                <Text style={styles.modalButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </Modal>

      {/* ── Edit Medical Modal ──────────────────────────────────────────── */}
      <Modal transparent visible={editMedicalModal} animationType="none">
        <BlurView intensity={80} style={styles.modalOverlay}>
          <Animated.View style={[styles.modalCard, { opacity: fadeAnim, backgroundColor: colors.card, maxHeight: '80%' }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Clinical Profile</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>Basic Vitals</Text>
              <Text style={{color: colors.subText, fontSize: 10, marginTop: -6, marginBottom: 10, fontStyle: 'italic'}}>Physical measurements used to scale the Digital Twin engine.</Text>
              <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>Height (cm)</Text>
                  <TextInput
                    placeholder="170"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.height}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, height: text })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>Weight (kg)</Text>
                  <TextInput
                    placeholder="70"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.weight}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, weight: text })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>Cardiovascular Baseline</Text>
              <Text style={{color: colors.subText, fontSize: 10, marginTop: -6, marginBottom: 10, fontStyle: 'italic'}}>Your baseline heart and blood pressure markers (Normal: ~72 bpm, 120/80 mmHg).</Text>
              <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>Resting HR</Text>
                  <TextInput
                    placeholder="72"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.biogears_resting_hr?.toString() || '72'}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, biogears_resting_hr: parseInt(text)||72 })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>Systolic BP</Text>
                  <TextInput
                    placeholder="114"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.biogears_systolic_bp?.toString() || '114'}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, biogears_systolic_bp: parseInt(text)||114 })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>Diastolic BP</Text>
                  <TextInput
                    placeholder="73"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.biogears_diastolic_bp?.toString() || '73'}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, biogears_diastolic_bp: parseInt(text)||73 })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>Body Composition</Text>
              <Text style={{color: colors.subText, fontSize: 10, marginTop: -6, marginBottom: 10, fontStyle: 'italic'}}>Used for determining metabolic rate and glucose storage capacity.</Text>
              <View style={{ backgroundColor: colors.bg, padding: 14, borderRadius: 12, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '500' }}>Body Fat %</Text>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>
                    {Math.round((localProfile.biogears_body_fat || 0.2) * 100)}%
                  </Text>
                </View>
                <Slider
                  style={{ width: '100%', height: 40 }}
                  minimumValue={0.05}
                  maximumValue={0.4}
                  step={0.01}
                  value={localProfile.biogears_body_fat || 0.2}
                  onValueChange={(v) => setLocalProfile({ ...localProfile, biogears_body_fat: v })}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.accent}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                  <Text style={{ color: colors.subText, fontSize: 11 }}>Lean</Text>
                  <Text style={{ color: colors.subText, fontSize: 11 }}>Average</Text>
                  <Text style={{ color: colors.subText, fontSize: 11 }}>Obese</Text>
                </View>
              </View>

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>Advanced Metrics</Text>
              <Text style={{color: colors.subText, fontSize: 10, marginTop: -6, marginBottom: 10, fontStyle: 'italic'}}>HbA1c is your 3-month sugar average (Standard: {"<"}5.7%). VO2 Max is your peak aerobic capacity.</Text>
              <View style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>HbA1c (%)</Text>
                  <TextInput
                    placeholder="5.4"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.biogears_hba1c?.toString() || ''}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, biogears_hba1c: parseFloat(text) || null })}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={{color: colors.subText, fontSize: 11, marginBottom: 4, marginLeft: 4}}>VO2 Max</Text>
                  <TextInput
                    placeholder="40"
                    placeholderTextColor={colors.subText}
                    style={[styles.input, { backgroundColor: colors.bg, color: colors.text, marginBottom: 0 }]}
                    value={localProfile.biogears_vo2max?.toString() || ''}
                    onChangeText={(text) => setLocalProfile({ ...localProfile, biogears_vo2max: parseFloat(text) || null })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>Ethnicity</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {['South Asian', 'Other'].map((eth) => {
                  const isActive = (localProfile.biogears_ethnicity || 'Other') === eth;
                  return (
                    <TouchableOpacity
                      key={eth}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor: isActive ? colors.accent : colors.bg,
                        borderWidth: 1,
                        borderColor: isActive ? colors.accent : colors.border
                      }}
                      onPress={() => setLocalProfile({ ...localProfile, biogears_ethnicity: eth })}
                    >
                      <Text style={{ 
                        color: isActive ? '#fff' : colors.subText, 
                        fontSize: 12, 
                        fontWeight: isActive ? '700' : '500'
                      }}>
                        {eth}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>Fitness Level</Text>
              <Text style={{color: colors.subText, fontSize: 10, marginTop: -6, marginBottom: 10, fontStyle: 'italic'}}>Your baseline activity profile helps calibrate your cardiovascular ceiling.</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {['sedentary', 'active', 'athlete'].map((level) => {
                  const isActive = (localProfile.biogears_fitness_level || 'sedentary') === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      style={{
                        flex: 1,
                        paddingVertical: 10,
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor: isActive ? colors.accent : colors.bg,
                        borderWidth: 1,
                        borderColor: isActive ? colors.accent : colors.border
                      }}
                      onPress={() => setLocalProfile({ ...localProfile, biogears_fitness_level: level })}
                    >
                      <Text style={{ 
                        color: isActive ? '#fff' : colors.subText, 
                        fontSize: 12, 
                        fontWeight: isActive ? '700' : '500',
                        textTransform: 'capitalize' 
                      }}>
                        {level}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8}}>General Health</Text>
              <TextInput
                placeholder="Allergies (comma separated)"
                placeholderTextColor={colors.subText}
                style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
                value={(localProfile.allergies || []).join(", ")}
                onChangeText={(text) =>
                  setLocalProfile({ ...localProfile, allergies: text.split(",").map(a => a.trim()).filter(Boolean) })
                }
              />
              <TextInput
                placeholder="Medications (comma separated)"
                placeholderTextColor={colors.subText}
                style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
                value={(localProfile.medications || []).join(", ")}
                onChangeText={(text) =>
                  setLocalProfile({ ...localProfile, medications: text.split(",").map(m => m.trim()).filter(Boolean) })
                }
              />

              <Text style={{color: colors.subText, fontSize: 12, marginBottom: 8, marginTop: 8}}>Clinical Conditions</Text>
              <Text style={{color: colors.subText, fontSize: 10, marginTop: -6, marginBottom: 10, fontStyle: 'italic'}}>These conditions modify fundamental physiological parameters in the engine.</Text>
              <View style={{ backgroundColor: colors.bg, borderRadius: 12, paddingHorizontal: 16, marginBottom: 8 }}>
                <View style={[styles.settingRow, { borderColor: colors.border }]}>
                  <Text style={{color: colors.text, fontSize: 14}}>Type 1 Diabetes</Text>
                  <Switch 
                    value={localProfile.biogears_has_type1_diabetes || false} 
                    onValueChange={(v) => setLocalProfile({...localProfile, biogears_has_type1_diabetes: v})} 
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
                <View style={[styles.settingRow, { borderColor: colors.border }]}>
                  <Text style={{color: colors.text, fontSize: 14}}>Type 2 Diabetes</Text>
                  <Switch 
                    value={localProfile.biogears_has_type2_diabetes || false} 
                    onValueChange={(v) => setLocalProfile({...localProfile, biogears_has_type2_diabetes: v})} 
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
                <View style={[styles.settingRow, { borderColor: colors.border }]}>
                  <Text style={{color: colors.text, fontSize: 14}}>Chronic Anemia</Text>
                  <Switch 
                    value={localProfile.biogears_has_anemia || false} 
                    onValueChange={(v) => setLocalProfile({...localProfile, biogears_has_anemia: v})} 
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
                <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                  <Text style={{color: colors.text, fontSize: 14}}>Smoker / COPD</Text>
                  <Switch 
                    value={localProfile.biogears_is_smoker || false} 
                    onValueChange={(v) => setLocalProfile({...localProfile, biogears_is_smoker: v})} 
                    trackColor={{ false: colors.border, true: colors.accent }}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                disabled={twinStatus === 'registering'}
                onPress={() => { setLocalProfile(safeProfile); closeModal(setEditMedicalModal); }}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.accent, flex: 2 }]}
                disabled={twinStatus === 'registering'}
                onPress={handleRegisterTwin}
              >
                {twinStatus === 'registering' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Save & Calibrate Twin</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </BlurView>
      </Modal>

      {/* ── Add Family Member Modal ─────────────────────────────────────── */}
      <Modal transparent visible={addMemberModal} animationType="slide">
        <BlurView intensity={80} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={styles.addMemberHeader}>
              <View style={[styles.addMemberIconBox, { backgroundColor: colors.purple + "20" }]}>
                <Ionicons name="people" size={24} color={colors.purple} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 0 }]}>
                Add Family Member
              </Text>
            </View>

            <Text style={[styles.addMemberSubtitle, { color: colors.subText }]}>
              Enter their name and VitalHealth Health ID to link your health data.
            </Text>

            <TextInput
              placeholder="Their Name (e.g., Rahul)"
              placeholderTextColor={colors.subText}
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
              value={newMemberName}
              onChangeText={setNewMemberName}
            />

            <TextInput
              placeholder="Their Health ID (e.g., VT-AB12-3456)"
              placeholderTextColor={colors.subText}
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
              value={newMemberHealthId}
              onChangeText={(t) => {
                const formatted = t.toUpperCase().replace(/\s/g, "-");
                setNewMemberHealthId(formatted);
                setSearchError("");
              }}
              autoCapitalize="characters"
            />

            <TextInput
              placeholder="Relation (optional — e.g., Father, Friend)"
              placeholderTextColor={colors.subText}
              style={[styles.input, { backgroundColor: colors.bg, color: colors.text }]}
              value={newMemberRelation}
              onChangeText={setNewMemberRelation}
            />

            {searchError ? (
              <Text style={[styles.searchError, { color: colors.danger }]}>
                ⚠️ {searchError}
              </Text>
            ) : null}

            <View style={[styles.howItWorks, { backgroundColor: colors.familyBg, borderColor: colors.familyBorder }]}>
              <Text style={[styles.howItWorksTitle, { color: colors.text }]}>How it works</Text>
              {[
                "1. Ask your family member to open VitalHealth",
                "2. Go to Profile → Family Health → copy their Health ID",
                "3. Enter their Health ID here",
                "4. Both of you can now view each other's health data ✓",
              ].map((step, i) => (
                <Text key={i} style={[styles.howItWorksStep, { color: colors.subText }]}>{step}</Text>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.border }]}
                onPress={() => {
                  setAddMemberModal(false);
                  setNewMemberName("");
                  setNewMemberHealthId("");
                  setNewMemberRelation("");
                  setSearchError("");
                }}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.purple, opacity: searchLoading ? 0.7 : 1 }]}
                onPress={addFamilyMember}
                disabled={searchLoading}
              >
                <Text style={styles.modalButtonText}>
                  {searchLoading ? "Searching..." : "Add Member"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

const InfoRow = ({ label, value, icon, colors }: any) => (
  <View style={styles.infoRow}>
    <View style={styles.infoLeft}>
      <Ionicons name={icon} size={18} color={colors.subText} />
      <Text style={[styles.infoLabel, { color: colors.subText }]}>{label}</Text>
    </View>
    <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
  </View>
);

const SettingRow = ({ icon, label, value, onToggle, colors }: any) => (
  <View style={styles.settingRow}>
    <View style={styles.settingInfo}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
    </View>
    <Switch value={value} onValueChange={onToggle} trackColor={{ false: colors.border, true: colors.accent }} />
  </View>
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  profileHeader: { paddingTop: 100, paddingBottom: 30, paddingHorizontal: 20, alignItems: "center", borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  viewingBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  viewingBannerText: { color: "#fff", fontSize: 12, fontWeight: "600" },
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
  infoValue: { fontSize: 14, fontWeight: "500" },
  medicalGrid: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  medicalItem: { alignItems: "center" },
  medicalLabel: { fontSize: 12, marginBottom: 4 },
  medicalValue: { fontSize: 16, fontWeight: "600" },
  allergiesSection: { marginBottom: 16 },
  medicationsSection: { marginBottom: 8 },
  subsectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 10 },
  tagContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, gap: 4 },
  tagText: { fontSize: 12, fontWeight: "500" },
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
  memberCard: { width: 96, alignItems: "center", padding: 12, borderRadius: 20, position: "relative", gap: 4 },
  memberCardAdd: { width: 96, alignItems: "center", padding: 12, borderRadius: 20, borderWidth: 1, borderStyle: "dashed", gap: 4 },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  memberAvatarAdd: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  memberAvatarImg: { width: 52, height: 52, borderRadius: 26 },
  memberAvatarText: { color: "#fff", fontSize: 18, fontWeight: "800" },
  activeRing: { position: "absolute", top: 9, left: -3, width: 58, height: 58, borderRadius: 29, borderWidth: 2.5 },
  pendingBadge: { position: "absolute", top: 8, right: 12, width: 16, height: 16, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  memberName: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  memberRelation: { fontSize: 10, textAlign: "center" },
  memberStatusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 2 },
  memberStatusText: { fontSize: 9, fontWeight: "700" },
  myCodeBox:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 16, borderWidth: 1, marginTop: 16 },
  myCodeLeft:    { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  myCodeIconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", marginRight: 10 },
  myCodeLabel:   { fontSize: 11, marginBottom: 2 },
  myCodeValue:   { fontSize: 14, fontWeight: "700", letterSpacing: 1 },
  myCodeSub:     { fontSize: 10, marginTop: 2 },
  myCodeActions: { flexDirection: "column", gap: 8 },
  codeActionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  shareCodeBtn:  { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  familyHint: { fontSize: 11, marginTop: 10, textAlign: "center" },
  addMemberHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  addMemberIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center" },
  addMemberSubtitle: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  howItWorks: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 16, gap: 4 },
  howItWorksTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  howItWorksStep: { fontSize: 12, lineHeight: 18 },
  searchError:    { fontSize: 13, marginBottom: 10, marginTop: -4, paddingHorizontal: 4 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  settingsLinkRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  settingInfo: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingLabel: { fontSize: 14, fontWeight: "500" },
  logoutButton: { margin: 16, padding: 16, borderRadius: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  logoutText: { fontSize: 16, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "center", padding: 20 },
  modalCard: { borderRadius: 24, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 20 },
  input: { borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 14 },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, gap: 12 },
  modalButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
  modalButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  conditionsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  twinStatusBox: { padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 16 },
  twinStatusHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  twinStatusText: { fontSize: 14, fontWeight: "600", flex: 1 },
  twinActionBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  twinActionBtnText: { fontSize: 14, fontWeight: "700" },
});