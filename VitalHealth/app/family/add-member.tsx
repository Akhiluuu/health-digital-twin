import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
  FlatList,
} from "react-native";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { getUserId } from "../../services/firebaseSync";
import { findUserByHealthId, linkFamilyMember, createDependentProfile } from "../../services/familySync";
import { registerTwin } from "../../services/biogears";
import { getTwinId } from "../../utils/twinUtils";
import { useFamily } from "../../context/FamilyContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";

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

export default function AddMemberScreen() {
  const { theme } = useTheme();
  const c = colors[theme];
  const { refreshMembers } = useFamily();

  // Three tabs: "scan" | "manual" | "create"
  const [activeTab, setActiveTab] = useState<"scan" | "manual" | "create">("scan");

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Manual inputs (link existing account by Health ID)
  const [targetHealthId, setTargetHealthId] = useState("");
  const [relation, setRelation] = useState("");
  const [loading, setLoading] = useState(false);

  // Current user's invite code for reference
  const [myInviteCode, setMyInviteCode] = useState("");

  // Create Profile inputs (dependent with no account/email/phone)
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

  // Which dropdown/picker modal is currently open
  const [activePicker, setActivePicker] = useState<PickerType>(null);

  useEffect(() => {
    loadMyProfile();
  }, []);

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

  const loadMyProfile = async () => {
    try {
      const uid = await getUserId();
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setMyInviteCode(data.inviteCode || "");
      }
    } catch (e) {
      console.log("❌ loadMyProfile error:", e);
    }
  };

  const handleScan = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const code = data.trim().toUpperCase();
    setLoading(true);

    try {
      const targetUser = await findUserByHealthId(code);
      if (targetUser) {
        setTargetHealthId(code);
        setActiveTab("manual");
        Alert.alert(
          "QR Code Verified",
          `Registered user found: ${targetUser.firstName} ${targetUser.lastName || ""}\n\nPlease select relationship type to link accounts.`
        );
      } else {
        Alert.alert(
          "Invalid QR Code",
          "This QR code is not registered to any VitalHealth account. Please check the code and try again."
        );
      }
    } catch (e) {
      console.log("❌ Scan verification error:", e);
      Alert.alert("Error", "Could not verify code. Please check your network connection.");
    } finally {
      setLoading(false);
      // Brief delay to prevent scan triggers loop
      setTimeout(() => {
        setScanned(false);
      }, 2000);
    }
  };

  const handleLinkMember = async () => {
    if (!targetHealthId.trim()) {
      Alert.alert("Error", "Please enter a valid Health ID.");
      return;
    }
    if (!relation.trim()) {
      Alert.alert("Error", "Please enter relationship (e.g. Spouse, Father, Daughter).");
      return;
    }

    setLoading(true);
    try {
      const myUid = await getUserId();
      if (!myUid) {
        Alert.alert("Error", "Not authenticated.");
        return;
      }

      // 1. Find target user
      const targetUser = await findUserByHealthId(targetHealthId.trim());
      if (!targetUser) {
        Alert.alert("User Not Found", "No registered user found with this Health ID. Please try again.");
        return;
      }

      if (targetUser.uid === myUid) {
        Alert.alert("Invalid ID", "You cannot link your own profile.");
        return;
      }

      // 2. Fetch my profile data to pass
      const mySnap = await getDoc(doc(db, "users", myUid));
      const myData = mySnap.data();

      // 3. Perform bidirectional link
      const success = await linkFamilyMember(
        targetUser.uid,
        { firstName: targetUser.firstName || "", lastName: targetUser.lastName || "" },
        targetUser.inviteCode || "",
        relation.trim(),
        { firstName: myData?.firstName || "", lastName: myData?.lastName || "" },
        myInviteCode
      );

      if (success) {
        await refreshMembers();
        Alert.alert("Success", `${targetUser.firstName} has been successfully added to your family network!`, [
          { text: "OK", onPress: () => { if (router.canGoBack()) { router.back(); } else { router.replace("/family"); } } }
        ]);
      } else {
        Alert.alert("Error", "Failed to link profile. Make sure the ID is correct.");
      }
    } catch (e) {
      console.log("❌ Link member error:", e);
      Alert.alert("Error", "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async () => {
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

    // Calculate age from DOB for BioGears registration
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

    setLoading(true);
    try {
      const result = await createDependentProfile({
        firstName: depFirstName.trim(),
        lastName: depLastName.trim(),
        dateOfBirth: depDob.trim(),
        gender: depGender,
        bloodGroup: depBloodGroup.trim(),
        height: depHeight.trim(),
        weight: depWeight.trim(),
        relation: depRelation.trim(),
      });

      if (!result) {
        Alert.alert("Error", "Could not create profile. Please try again.");
        return;
      }

      const { newId, inviteCode } = result;

      await registerTwin({
        user_id: newId,
        profile_name: `${depFirstName.trim()} ${depLastName.trim()}`.trim(),
        age,
        weight: w,
        height: h,
        sex: depGender,
      });

      await setDoc(doc(db, "users", newId), { biogears_registered: true }, { merge: true });

      await refreshMembers();
      Alert.alert(
        "Success",
        `${depFirstName}'s profile has been created with an independent Digital Twin.\n\nHealth ID: ${inviteCode}`,
        [{ text: "OK", onPress: () => { if (router.canGoBack()) { router.back(); } else { router.replace("/family"); } } }]
      );
    } catch (e: any) {
      console.log("❌ Create profile error:", e);
      Alert.alert("Error", e.message || "Profile saved, but twin registration failed. You can retry it later.");
    } finally {
      setLoading(false);
    }
  };

  const renderScanner = () => {
    if (!permission) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={60} color={c.sub} />
          <Text style={[styles.permissionText, { color: c.sub }]}>Camera access is required to scan QR codes</Text>
          <TouchableOpacity style={[styles.permissionBtn, { backgroundColor: c.accent }]} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.scannerContainer}>
        <View style={[styles.cameraFrame, { borderColor: c.accent }]}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
            onBarcodeScanned={handleScan}
          />
        </View>
        <Text style={[styles.scannerInstructions, { color: c.sub }]}>
          Align your family member's QR code inside the frame
        </Text>
      </View>
    );
  };

  // Generic dropdown-style field that opens a picker modal
  const renderDropdownField = (value: string, placeholder: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.input, styles.dropdownField, { backgroundColor: c.bg, borderColor: c.border }]}
    >
      <Text style={{ color: value ? c.text : c.sub, fontSize: 15 }}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color={c.sub} />
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen
        options={{
          title: "Add Family Member",
          headerShown: true,
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.text,
        }}
      />
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        {/* Navigation Tabs */}
        <View style={[styles.tabBar, { backgroundColor: c.card }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === "scan" && { borderBottomColor: c.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("scan")}
          >
            <Ionicons name="scan-outline" size={16} color={activeTab === "scan" ? c.accent : c.sub} />
            <Text style={[styles.tabText, { color: activeTab === "scan" ? c.accent : c.sub }]}>Scan QR Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "manual" && { borderBottomColor: c.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("manual")}
          >
            <Ionicons name="create-outline" size={16} color={activeTab === "manual" ? c.accent : c.sub} />
            <Text style={[styles.tabText, { color: activeTab === "manual" ? c.accent : c.sub }]}>Enter manually</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "create" && { borderBottomColor: c.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("create")}
          >
            <Ionicons name="person-add-outline" size={16} color={activeTab === "create" ? c.accent : c.sub} />
            <Text style={[styles.tabText, { color: activeTab === "create" ? c.accent : c.sub }]}>Create Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Content Section */}
        <View style={styles.content}>
          {activeTab === "scan" ? (
            <View style={[styles.card, { backgroundColor: c.card }]}>
              {renderScanner()}
            </View>
          ) : activeTab === "manual" ? (
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              <View style={[styles.card, { backgroundColor: c.card }]}>
                <Text style={[styles.label, { color: c.text }]}>Family Member's Health ID</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                  placeholder="e.g. VITAL-XXXX-XXXX"
                  placeholderTextColor={c.sub}
                  value={targetHealthId}
                  onChangeText={(t) => setTargetHealthId(t.toUpperCase().replace(/\s/g, ""))}
                  autoCapitalize="characters"
                />

                <Text style={[styles.label, { color: c.text }]}>Relationship</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                  placeholder="e.g. Spouse, Father, Daughter"
                  placeholderTextColor={c.sub}
                  value={relation}
                  onChangeText={setRelation}
                />

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: c.accent }]}
                  onPress={handleLinkMember}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionBtnText}>Link Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              <View style={[styles.card, { backgroundColor: c.card }]}>
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
                  placeholder="e.g. Father, Daughter, Baby"
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
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  {(["Male", "Female"] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      onPress={() => setDepGender(g)}
                      style={[
                        styles.actionBtn,
                        {
                          flex: 1,
                          marginTop: 0,
                          backgroundColor: depGender === g ? c.accent : c.bg,
                          borderWidth: 1,
                          borderColor: c.border,
                        },
                      ]}
                    >
                      <Text style={{ color: depGender === g ? "#fff" : c.text, fontWeight: "600" }}>{g}</Text>
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

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: c.accent }]}
                  onPress={handleCreateProfile}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionBtnText}>Create Profile</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>

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
            <View style={[styles.modalSheet, { backgroundColor: c.card }]}>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    height: 64,
    paddingHorizontal: 6,
    gap: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  tabButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 6,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  center: {
    height: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionText: {
    marginTop: 16,
    fontSize: 15,
    textAlign: "center",
    maxWidth: "80%",
  },
  permissionBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 15,
  },
  scannerContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  cameraFrame: {
    width: 240,
    height: 240,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 3,
  },
  scannerInstructions: {
    marginTop: 20,
    fontSize: 14,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 12,
  },
  dropdownField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dobRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSheet: {
    width: "80%",
    maxHeight: "60%",
    borderRadius: 16,
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 10,
  },
  modalOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
});