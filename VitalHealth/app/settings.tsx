// app/settings.tsx

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "../context/ThemeContext";

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  const isLight = theme === "light";

  const colors =
    theme === "light"
      ? {
          bg: "#f8fafc",
          text: "#020617",
          border: "#e2e8f0",
          card: "#ffffff",
          sub: "#64748b",
        }
      : {
          bg: "#020617",
          text: "#e2e8f0",
          border: "#1e293b",
          card: "#0f172a",
          sub: "#94a3b8",
        };

  const Item = (label: string, route?: string) => (
    <TouchableOpacity
      style={[styles.item, { borderColor: colors.border }]}
      onPress={() => route && router.push(route as any)}
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
            onPress={() => router.back()}
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
          {Item("Data Sharing", "/settings-data")}
          {Item("☁️  Backup & Restore", "/backup-restore")}
          {Item("🌐  BioGears Simulation Engine", "/settings-server")}
          {Item("🤖  Health AI Chatbot", "/settings-ai")}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {Item("Security", "/settings-security")}
          {Item("Emergency Contacts", "/settings-contacts")}
          {Item("Language", "/settings-language")}
          {Item("Notifications", "/settings-notifications")}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {Item("Help Center", "/settings-help")}
          {Item("About VitalTwin", "/settings-about")}
        </View>

        {/* App Version */}
        <Text style={[styles.versionText, { color: colors.sub }]}>
          Version 2.0.0
        </Text>
      </ScrollView>
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
});