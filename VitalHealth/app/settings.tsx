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

import Header from "./components/Header";
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
        }
      : {
          bg: "#020617",
          text: "#e2e8f0",
          border: "#1e293b",
        };

  const Item = (label: string, route?: string) => (
    <TouchableOpacity
      style={[styles.item, { borderColor: colors.border }]}
      onPress={() => route && router.push(route as any)}
    >
      <Text style={[styles.itemText, { color: colors.text }]}>
        {label}
      </Text>

      <Ionicons
        name="chevron-forward"
        size={20}
        color="#64748b"
      />
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header />

      <ScrollView contentContainerStyle={{ paddingTop: 110 }}>
        {/* Theme Toggle */}
        <View
          style={[
            styles.item,
            { borderColor: colors.border },
          ]}
        >
          <Text
            style={[
              styles.itemText,
              { color: colors.text },
            ]}
          >
            Light Mode
          </Text>

          <Switch
            value={isLight}
            onValueChange={toggleTheme}
          />
        </View>

        {Item("Data Sharing", "/settings-data")}
        {Item("☁️  Backup & Restore", "/backup-restore")}
        {Item("🌐  Server Configuration", "/settings-server")}
        {Item("Security", "/settings-security")}
        {Item("Emergency Contacts", "/settings-contacts")}
        {Item("Language", "/settings-language")}
        {Item("Notifications", "/settings-notifications")}
        {Item("Help Center", "/settings-help")}
        {Item("About VitalTwin", "/settings-about")}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 18,
    borderBottomWidth: 1,
  },

  itemText: {
    fontSize: 16,
  },
});
