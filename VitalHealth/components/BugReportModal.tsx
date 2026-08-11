// components/BugReportModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Simplified & Intuitive Bug Reporting Modal for VitalHealth
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { useTheme } from "../context/ThemeContext";
import { useFamily } from "../context/FamilyContext";
import { colors } from "../theme/colors";
import {
  BugCategory,
  submitBugReport,
  getSystemDiagnostics,
  SystemDiagnostics,
} from "../services/bugReportService";

interface Props {
  visible: boolean;
  onClose: () => void;
  initialStackTrace?: string;
  initialCategory?: BugCategory;
}

export default function BugReportModal({
  visible,
  onClose,
  initialStackTrace,
  initialCategory = "ui",
}: Props) {
  const { theme } = useTheme();
  const c = colors[theme];
  const pathname = usePathname();
  const { activeProfile } = useFamily();

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);

  useEffect(() => {
    if (visible) {
      if (initialStackTrace) {
        setSummary("Unexpected application crash");
        setDescription(
          `App encountered an error stack trace:\n${initialStackTrace.slice(0, 300)}`
        );
      }
      const profileId = activeProfile?.firstName ? `User-${activeProfile.firstName}` : "Anon-User";
      getSystemDiagnostics(pathname, profileId).then(setDiagnostics);
    }
  }, [visible, initialStackTrace, pathname, activeProfile?.firstName]);

  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Needed", "Photo library access is required to select a screenshot.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setScreenshotUri(asset.uri);
        if (asset.base64) {
          setScreenshotBase64(`data:image/jpeg;base64,${asset.base64}`);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", "Unable to select image.");
    }
  };

  const handleRemoveScreenshot = () => {
    setScreenshotUri(null);
    setScreenshotBase64(null);
  };

  const handleSubmit = async () => {
    if (!summary.trim()) {
      Alert.alert("Issue Title Required", "Please enter a title for the issue.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Description Required", "Please describe what happened.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);

    try {
      const profileId = activeProfile?.firstName ? `User-${activeProfile.firstName}` : "Anon-User";
      const res = await submitBugReport({
        category: initialStackTrace ? "crash" : initialCategory,
        severity: initialStackTrace ? "critical" : "medium",
        summary: summary.trim(),
        description: description.trim(),
        userEmail: userEmail.trim() || undefined,
        screenshotUri: screenshotUri || undefined,
        screenshotBase64: screenshotBase64 || undefined,
        includeDiagnostics: true,
        stackTrace: initialStackTrace,
        currentRoute: pathname,
        profileId,
      });

      setSubmitting(false);

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Thank You!", "Your issue report has been submitted.", [
          {
            text: "OK",
            onPress: () => {
              resetForm();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert("Notice", res.message);
      }
    } catch (err: any) {
      setSubmitting(false);
      Alert.alert("Error", err.message || "Failed to submit bug report.");
    }
  };

  const resetForm = () => {
    setSummary("");
    setDescription("");
    setUserEmail("");
    setScreenshotUri(null);
    setScreenshotBase64(null);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.border },
          ]}
        >
          {/* ── HEADER ── */}
          <View style={[styles.header, { borderBottomColor: c.border }]}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconWrap, { backgroundColor: c.accent + "18" }]}>
                <Ionicons name="bug-outline" size={20} color={c.accent} />
              </View>
              <View>
                <Text style={[styles.title, { color: c.text }]}>Report an Issue</Text>
                <Text style={[styles.subtitle, { color: c.sub }]}>
                  Describe what went wrong to help us fix it
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={c.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── ISSUE TITLE (MANDATORY) ── */}
            <Text style={[styles.label, { color: c.sub }]}>
              ISSUE TITLE <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: c.bg, borderColor: c.border, color: c.text },
              ]}
              placeholder="Brief title (e.g. Heart scanner camera frozen)"
              placeholderTextColor={c.sub + "80"}
              value={summary}
              onChangeText={setSummary}
              maxLength={100}
            />

            {/* ── ISSUE DESCRIPTION (MANDATORY) ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              ISSUE DESCRIPTION <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                { backgroundColor: c.bg, borderColor: c.border, color: c.text },
              ]}
              placeholder="Please explain what happened, what screen you were on, or steps to reproduce..."
              placeholderTextColor={c.sub + "80"}
              value={description}
              onChangeText={setDescription}
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* ── YOUR EMAIL (OPTIONAL) ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              YOUR EMAIL <Text style={{ fontSize: 11, fontWeight: "400" }}>(Optional)</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: c.bg, borderColor: c.border, color: c.text },
              ]}
              placeholder="e.g. name@example.com (so we can follow up)"
              placeholderTextColor={c.sub + "80"}
              value={userEmail}
              onChangeText={setUserEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* ── ATTACH SCREENSHOT (OPTIONAL) ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              ATTACH SCREENSHOT <Text style={{ fontSize: 11, fontWeight: "400" }}>(Optional)</Text>
            </Text>

            {screenshotUri ? (
              <View style={[styles.previewContainer, { borderColor: c.border, backgroundColor: c.bg }]}>
                <Image source={{ uri: screenshotUri }} style={styles.previewImage} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={handleRemoveScreenshot}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={16} color="#ffffff" />
                  <Text style={styles.removeBtnText}>Remove Screenshot</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.singlePhotoBtn, { backgroundColor: c.bg, borderColor: c.border }]}
                onPress={handlePickImage}
                activeOpacity={0.7}
              >
                <Ionicons name="images-outline" size={18} color={c.accent} />
                <Text style={[styles.photoBtnText, { color: c.text }]}>Choose Screenshot</Text>
              </TouchableOpacity>
            )}

            {/* ── SUBMIT BUTTON ── */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: c.accent }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Submit Issue</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "flex-end",
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: "90%",
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
  },
  closeBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 100,
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 12,
  },
  photoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  singlePhotoBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  previewContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    alignItems: "center",
    gap: 10,
  },
  previewImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ef4444",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  removeBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "600",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    marginTop: 24,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
