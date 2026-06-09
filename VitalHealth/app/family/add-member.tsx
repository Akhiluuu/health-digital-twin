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
} from "react-native";
import { router, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { getUserId } from "../../services/firebaseSync";
import { findUserByHealthId, linkFamilyMember } from "../../services/familySync";
import { useFamily } from "../../context/FamilyContext";
import { useTheme } from "../../context/ThemeContext";
import { colors } from "../../theme/colors";

export default function AddMemberScreen() {
  const { theme } = useTheme();
  const c = colors[theme];
  const { refreshMembers } = useFamily();

  // Two tabs: "scan" | "manual"
  const [activeTab, setActiveTab] = useState<"scan" | "manual">("scan");

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  // Manual inputs
  const [targetHealthId, setTargetHealthId] = useState("");
  const [relation, setRelation] = useState("");
  const [loading, setLoading] = useState(false);

  // Current user's invite code for reference
  const [myInviteCode, setMyInviteCode] = useState("");

  useEffect(() => {
    loadMyProfile();
  }, []);

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

  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const code = data.trim().toUpperCase();
    setTargetHealthId(code);
    setScanned(false);
    setActiveTab("manual");
    Alert.alert("Success", `Scanned Health ID: ${code}.\n\nSelect relationship type below to finish linking.`);
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
          { text: "OK", onPress: () => router.back() }
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
            <Ionicons name="scan-outline" size={18} color={activeTab === "scan" ? c.accent : c.sub} />
            <Text style={[styles.tabText, { color: activeTab === "scan" ? c.accent : c.sub }]}>Scan QR Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === "manual" && { borderBottomColor: c.accent, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab("manual")}
          >
            <Ionicons name="create-outline" size={18} color={activeTab === "manual" ? c.accent : c.sub} />
            <Text style={[styles.tabText, { color: activeTab === "manual" ? c.accent : c.sub }]}>Enter manually</Text>
          </TouchableOpacity>
        </View>

        {/* Content Section */}
        <View style={styles.content}>
          {activeTab === "scan" ? (
            <View style={[styles.card, { backgroundColor: c.card }]}>
              {renderScanner()}
            </View>
          ) : (
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
          )}
        </View>
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
    height: 50,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
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
});