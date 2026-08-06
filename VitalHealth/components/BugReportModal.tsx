// components/BugReportModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade User Bug Reporting Modal for VitalHealth Beta Testing
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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import * as Haptics from "expo-haptics";

import { useTheme } from "../context/ThemeContext";
import { useFamily } from "../context/FamilyContext";
import { colors } from "../theme/colors";
import {
  BugCategory,
  BugSeverity,
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

  const [category, setCategory] = useState<BugCategory>(initialCategory);
  const [severity, setSeverity] = useState<BugSeverity>(
    initialStackTrace ? "critical" : "medium"
  );
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [showDiagPreview, setShowDiagPreview] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);

  useEffect(() => {
    if (visible) {
      if (initialStackTrace) {
        setCategory("crash");
        setSeverity("critical");
        setSummary("Unexpected application crash");
        setDescription(
          `App encountered an error stack trace:\n${initialStackTrace.slice(0, 300)}`
        );
      }
      const profileId = activeProfile?.email || activeProfile?.firstName || "Anon-User";
      getSystemDiagnostics(pathname, profileId).then(setDiagnostics);
    }
  }, [visible, initialStackTrace, pathname, activeProfile?.email, activeProfile?.firstName]);

  const categories: { key: BugCategory; label: string; icon: string }[] = [
    { key: "ui", label: "UI / Design", icon: "color-palette-outline" },
    { key: "vitals", label: "Vitals / Sensor", icon: "heart-outline" },
    { key: "ai", label: "AI Health Twin", icon: "sparkles-outline" },
    { key: "sync", label: "Sync & Server", icon: "cloud-offline-outline" },
    { key: "crash", label: "Crash / Freeze", icon: "warning-outline" },
    { key: "feedback", label: "Feedback", icon: "bulb-outline" },
  ];

  const severities: { key: BugSeverity; label: string; color: string }[] = [
    { key: "low", label: "🟢 Low", color: "#10b981" },
    { key: "medium", label: "🟡 Medium", color: "#f59e0b" },
    { key: "high", label: "🔴 High", color: "#ef4444" },
    { key: "critical", label: "💥 Critical", color: "#8b5cf6" },
  ];

  const handleSubmit = async () => {
    if (!summary.trim()) {
      Alert.alert("Missing Title", "Please enter a brief summary of the issue.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Missing Details", "Please describe what happened or steps to reproduce.");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);

    try {
      const profileId = activeProfile?.email || activeProfile?.firstName || "Anon-User";
      const res = await submitBugReport({
        category,
        severity,
        summary: summary.trim(),
        description: description.trim(),
        userEmail: userEmail.trim() || undefined,
        includeDiagnostics: includeDiag,
        stackTrace: initialStackTrace,
        currentRoute: pathname,
        profileId,
      });

      setSubmitting(false);

      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ Report Sent", res.message, [
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
    setCategory("ui");
    setSeverity("medium");
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              <View style={[styles.bugIconWrap, { backgroundColor: c.accent + "18" }]}>
                <Ionicons name="bug-outline" size={20} color={c.accent} />
              </View>
              <View>
                <Text style={[styles.title, { color: c.text }]}>Report a Bug</Text>
                <Text style={[styles.subtitle, { color: c.sub }]}>
                  Beta Tester Feedback & Diagnostics
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
            {/* ── CATEGORY SELECTOR ── */}
            <Text style={[styles.label, { color: c.sub }]}>BUG CATEGORY</Text>
            <View style={styles.chipRow}>
              {categories.map((cat) => {
                const isSelected = category === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setCategory(cat.key);
                    }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: isSelected
                          ? c.accent + "20"
                          : c.bg,
                        borderColor: isSelected ? c.accent : c.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={14}
                      color={isSelected ? c.accent : c.sub}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        { color: isSelected ? c.accent : c.sub },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── SEVERITY SELECTOR ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              SEVERITY LEVEL
            </Text>
            <View style={styles.chipRow}>
              {severities.map((sev) => {
                const isSelected = severity === sev.key;
                return (
                  <TouchableOpacity
                    key={sev.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSeverity(sev.key);
                    }}
                    style={[
                      styles.sevChip,
                      {
                        backgroundColor: isSelected
                          ? sev.color + "25"
                          : c.bg,
                        borderColor: isSelected ? sev.color : c.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sevText,
                        { color: isSelected ? sev.color : c.sub },
                      ]}
                    >
                      {sev.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── BUG TITLE SUMMARY ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              SUMMARY / ISSUE TITLE <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: c.bg, borderColor: c.border, color: c.text },
              ]}
              placeholder="e.g. Heart scanner camera feed frozen"
              placeholderTextColor={c.sub + "80"}
              value={summary}
              onChangeText={setSummary}
              maxLength={100}
            />

            {/* ── DETAILED DESCRIPTION ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              STEPS TO REPRODUCE / DETAILS <Text style={{ color: "#ef4444" }}>*</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                { backgroundColor: c.bg, borderColor: c.border, color: c.text },
              ]}
              placeholder="What were you doing when the bug occurred? Expected vs actual behavior..."
              placeholderTextColor={c.sub + "80"}
              value={description}
              onChangeText={setDescription}
              multiline={true}
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* ── USER CONTACT (OPTIONAL) ── */}
            <Text style={[styles.label, { color: c.sub, marginTop: 14 }]}>
              YOUR EMAIL <Text style={{ fontSize: 11, fontWeight: "400" }}>(Optional, for follow up)</Text>
            </Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: c.bg, borderColor: c.border, color: c.text },
              ]}
              placeholder="e.g. tester@example.com"
              placeholderTextColor={c.sub + "80"}
              value={userEmail}
              onChangeText={setUserEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* ── DIAGNOSTICS TOGGLE ── */}
            <View style={[styles.diagRow, { borderTopColor: c.border }]}>
              <TouchableOpacity
                style={styles.diagToggle}
                onPress={() => setIncludeDiag(!includeDiag)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={includeDiag ? "checkbox" : "square-outline"}
                  size={20}
                  color={includeDiag ? c.accent : c.sub}
                />
                <Text style={[styles.diagText, { color: c.text }]}>
                  Include anonymous system diagnostics
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDiagPreview(!showDiagPreview)}
              >
                <Text style={{ color: c.accent, fontSize: 12, fontWeight: "600" }}>
                  {showDiagPreview ? "Hide" : "View Specs"}
                </Text>
              </TouchableOpacity>
            </View>

            {showDiagPreview && diagnostics && (
              <View style={[styles.diagPreviewBox, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Text style={[styles.diagCode, { color: c.sub }]}>
                  • App Version: {diagnostics.appVersion}{"\n"}
                  • Platform: {diagnostics.platform} (v{diagnostics.osVersion}){"\n"}
                  • Screen Resolution: {diagnostics.screenSize}{"\n"}
                  • Active Route: {diagnostics.currentRoute}{"\n"}
                  • BioGears Server: {diagnostics.serverUrl}
                </Text>
              </View>
            )}

            {/* ── SUBMIT BUTTON ── */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: c.accent }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={18} color="#ffffff" />
                  <Text style={styles.submitBtnText}>Send Bug Report</Text>
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
  bugIconWrap: {
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  sevChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  sevText: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 90,
  },
  diagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  diagToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  diagText: {
    fontSize: 12,
    fontWeight: "500",
  },
  diagPreviewBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  diagCode: {
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    marginTop: 20,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
