import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { colors as themeColors } from "../../theme/colors";

export default function TabLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const c = themeColors[theme as "light" | "dark"];
  const colors = {
    bg: c.card,
    active: c.active,
    inactive: c.sub,
    border: c.border,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarLabelStyle: {
          fontSize: 10,
          marginBottom: 4,
          fontWeight: "600",
        },
      }}
    >
      {/* HOME */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Ionicons name="home" size={24} color={color} />
          ),
        }}
      />

      {/* HISTORY — combined app + BioGears timeline */}
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <Ionicons name="time" size={24} color={color} />
          ),
        }}
      />

      {/* DIGITAL TWIN — simulation command center */}
      <Tabs.Screen
        name="twin"
        options={{
          title: "Twin",
          tabBarIcon: ({ color }) => (
            <Ionicons name="pulse" size={26} color={color} />
          ),
        }}
      />

      {/* DOCUMENTS — medical reports and records */}
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color }) => (
            <Ionicons name="document-text" size={24} color={color} />
          ),
        }}
      />

      {/* AI HEALTH */}
      <Tabs.Screen
        name="ai-health"
        options={{
          title: "AI Health",
          tabBarIcon: ({ color }) => (
            <Ionicons
              name="chatbubble-ellipses"
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* HIDDEN INSIGHTS SCREEN */}
      <Tabs.Screen
        name="insights"
        options={{
          href: null, // 🚫 Removes it from the bottom navigation
        }}
      />
    </Tabs>
  );
}