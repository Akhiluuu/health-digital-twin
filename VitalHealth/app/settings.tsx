// app/settings.tsx

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const [showUnderConstruction, setShowUnderConstruction] = useState(false);
  const [activeFeature, setActiveFeature] = useState("");

  const isLight = theme === "light";
  const colors = globalColors[theme];

  const handlePress = (label: string, route?: string) => {
    const underConstructionRoutes = [
      "/backup-restore",
      "/settings-security",
      "/settings-language"
    ];

    if (route && underConstructionRoutes.includes(route)) {
      const cleanLabel = label.replace(/[^\w\s&]/g, "").trim();
      setActiveFeature(cleanLabel);
      setShowUnderConstruction(true);
    } else if (route) {
      router.push(route as any);
    }
  };

  const Item = (label: string, route?: string) => (
    <TouchableOpacity
      style={[styles.item, { borderColor: colors.border }]}
      onPress={() => handlePress(label, route)}
    >
      <Text style={[styles.itemText, { color: colors.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color="#64748b" />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Back Button - Styled as a padded box */}
        <View style={styles.backWrapper}>
          <TouchableOpacity
            onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}
            style={[styles.backBox, { backgroundColor: colors.card, borderColor: colors.border }]}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.backText, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* Header Title */}
        <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>

        {/* Theme Toggle */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.item, { borderColor: colors.border }]}>
            <Text style={[styles.itemText, { color: colors.text }]}>Light Mode</Text>
            <Switch value={isLight} onValueChange={toggleTheme} />
          </View>
        </View>

        {/* Settings Sections */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {Item("📄  Export Doctor Summary", "/settings-export-summary")}
          {Item("Data Sharing", "/settings-data")}
          {Item("☁️  Backup & Restore", "/backup-restore")}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {Item("Security", "/settings-security")}
          {Item("Language", "/settings-language")}
          {Item("Notifications", "/settings-notifications")}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {Item("Help Center", "/settings-help")}
          {Item("🐛  Report a Bug (Beta)", "/report-bug")}
          {Item("About VitalTwin", "/settings-about")}
        </View>

        {/* App Version */}
        <Text style={[styles.versionText, { color: colors.sub }]}>
          Version 2.0.0
        </Text>
      </ScrollView>

      {/* Under Construction Modal */}
      <Modal
        visible={showUnderConstruction}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUnderConstruction(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.accent + "15" }]}>
              <Ionicons name="construct" size={32} color={colors.accent} />
            </View>

            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {activeFeature}
            </Text>

            <Text style={[styles.modalSubtitle, { color: colors.accent }]}>
              Feature Preview
            </Text>

            <Text style={[styles.modalDescription, { color: colors.sub }]}>
              We are currently refining this feature to ensure a seamless, production-grade experience. It will be available in the next update!
            </Text>

            <TouchableOpacity
              style={[styles.dismissButton, { backgroundColor: colors.accent }]}
              onPress={() => setShowUnderConstruction(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  scrollContent: {
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },

  backWrapper: {
    marginBottom: 16,
    marginTop: 24,
  },

  backBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },

  backText: {
    fontSize: 16,
    fontWeight: "600",
  },

  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 24,
  },

  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
  },

  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
  },

  itemText: {
    fontSize: 16,
    fontWeight: "500",
  },

  versionText: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 20,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },

  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },

  modalSubtitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },

  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },

  dismissButton: {
    width: "100%",
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  dismissButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});