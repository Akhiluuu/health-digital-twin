import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Modal, TextInput, ActivityIndicator,
  Switch
} from "react-native";
import Header from "./components/Header";
import { useTheme } from "../context/ThemeContext";

// Firebase
import { auth } from "../services/firebase";
import {
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

export default function Security() {
  const { theme } = useTheme();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"change" | "forgot" | null>(null);

  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ NEW STATE for Sync Toggle
  const [syncEnabled, setSyncEnabled] = useState(false);

  const colors = theme === "light"
    ? { bg: "#f8fafc", card: "#ffffff", text: "#020617", border: "#e2e8f0", accent: "#64748b", input: "#f1f5f9" }
    : { bg: "#020617", card: "#0f172a", text: "#e2e8f0", border: "#1e293b", accent: "#64748b", input: "#1e293b" };

  const openModal = (type: "change" | "forgot") => {
    setModalType(type);
    setEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setModalVisible(true);
  };

  // ── FORGOT PASSWORD ──────────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setModalVisible(false);
      Alert.alert("Email Sent", "A password reset link has been sent to your email.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  // ── CHANGE PASSWORD ──────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("No user logged in.");

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setModalVisible(false);
      Alert.alert("Success", "Your password has been updated.");
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const Item = ({ label, type }: { label: string; type: "change" | "forgot" }) => (
    <TouchableOpacity
      style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.8}
      onPress={() => openModal(type)}
    >
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
      <Text style={{ color: colors.accent }}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header />

      <View style={styles.content}>
        <Item label="Change Password" type="change" />
        <Item label="Forgot Password" type="forgot" />

        {/* ✅ NEW SYNC DATA OPTION */}
        <View style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.text, { color: colors.text }]}>Sync Data</Text>
          <Switch
            value={syncEnabled}
            onValueChange={(value) => {
              setSyncEnabled(value);
              Alert.alert("Sync Data", value ? "Sync Enabled" : "Sync Disabled");
            }}
            thumbColor={syncEnabled ? "#3b82f6" : "#ccc"}
          />
        </View>

      </View>

      {/* MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={[styles.modal, { backgroundColor: colors.card }]}>

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {modalType === "forgot" ? "Forgot Password" : "Change Password"}
            </Text>

            {modalType === "forgot" && (
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter your email"
                placeholderTextColor={colors.accent}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            )}

            {modalType === "change" && (
              <>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                  placeholder="Current password"
                  placeholderTextColor={colors.accent}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
                <TextInput
                  style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
                  placeholder="New password (min 6 chars)"
                  placeholderTextColor={colors.accent}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </>
            )}

            {loading ? (
              <ActivityIndicator style={{ marginTop: 12 }} color="#3b82f6" />
            ) : (
              <TouchableOpacity
                style={styles.button}
                onPress={modalType === "forgot" ? handleForgotPassword : handleChangePassword}
              >
                <Text style={styles.buttonText}>
                  {modalType === "forgot" ? "Send Reset Email" : "Update Password"}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancel}>
              <Text style={{ color: colors.accent }}>Cancel</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 110 },

  item: {
    padding: 18,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  text: { fontSize: 16, fontWeight: "500" },

  overlay: {
    flex: 1,
    backgroundColor: "#00000088",
    justifyContent: "center",
    padding: 24
  },

  modal: {
    borderRadius: 16,
    padding: 24,
    gap: 12
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8
  },

  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },

  button: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },

  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15
  },

  cancel: {
    alignItems: "center",
    paddingTop: 8
  },
});