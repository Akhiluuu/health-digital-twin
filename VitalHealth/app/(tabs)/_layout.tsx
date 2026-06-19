import React, { useEffect } from "react";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, BackHandler } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { colors as themeColors } from "../../theme/colors";

export default function TabLayout() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onBackPress = () => {
      // If we are on the main dashboard tab, exit the app instead of navigating back to welcome
      if (pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/" || pathname === "/(tabs)/index") {
        BackHandler.exitApp();
        return true; // handled
      } else if (
        pathname === "/history" ||
        pathname === "/twin" ||
        pathname === "/documents" ||
        pathname === "/ai-health" ||
        pathname === "/insights"
      ) {
        // If they are on other tabs, navigate back to home tab
        router.navigate("/(tabs)");
        return true; // handled
      }
      return false; // let default back behavior run (e.g. for sub-screens)
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [pathname]);

  const c = themeColors[theme as "light" | "dark"];
  const colors = {
    bg: c.card,
    active: c.active,
    inactive: c.sub,
    border: theme === "dark" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
  };

  const renderTabIcon = (focused: boolean, color: string, filledName: any, outlineName: any) => (
    <View style={{ alignItems: "center", width: "100%", height: "100%", justifyContent: "center" }}>
      {focused && (
        <View
          style={{
            position: "absolute",
            top: 0,
            width: 20,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: colors.active,
          }}
        />
      )}
      <Ionicons
        name={focused ? filledName : outlineName}
        size={focused ? 24 : 22}
        color={color}
        style={{ marginTop: focused ? 6 : 4 }}
      />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: theme === "dark" ? 0.25 : 0.03,
          shadowRadius: 8,
          elevation: 6,
        },
        tabBarItemStyle: {
          height: 56,
        },
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.3,
          marginBottom: 6,
        },
      }}
    >
      {/* HOME */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) =>
            renderTabIcon(focused, color, "home", "home-outline"),
        }}
      />

      {/* HISTORY */}
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, focused }) =>
            renderTabIcon(focused, color, "time", "time-outline"),
        }}
      />

      {/* DIGITAL TWIN */}
      <Tabs.Screen
        name="twin"
        options={{
          title: "Twin",
          tabBarIcon: ({ color, focused }) =>
            renderTabIcon(focused, color, "pulse", "pulse-outline"),
        }}
      />

      {/* DOCUMENTS */}
      <Tabs.Screen
        name="documents"
        options={{
          title: "Documents",
          tabBarIcon: ({ color, focused }) =>
            renderTabIcon(focused, color, "document-text", "document-text-outline"),
        }}
      />

      {/* AI HEALTH */}
      <Tabs.Screen
        name="ai-health"
        options={{
          title: "AI Health",
          tabBarIcon: ({ color, focused }) =>
            renderTabIcon(focused, color, "chatbubble-ellipses", "chatbubble-ellipses-outline"),
        }}
      />

      {/* HIDDEN INSIGHTS SCREEN */}
      <Tabs.Screen
        name="insights"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}