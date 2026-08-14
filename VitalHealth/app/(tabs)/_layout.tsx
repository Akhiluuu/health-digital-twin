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
      // Only intercept if we are literally on the Journey tab root.
      // Every other pathname (sub-screens pushed onto the stack, or other
      // tabs) must return false so the Stack navigator handles the back
      // gesture natively — giving us proper Android predictive-back.
      const isJourneyRoot =
        pathname === "/" ||
        pathname === "/(tabs)" ||
        pathname === "/(tabs)/" ||
        pathname === "/(tabs)/index";

      if (isJourneyRoot) {
        BackHandler.exitApp();
        return true;
      }

      // For other tabs (twin, documents, ai-health) pressing the hardware
      // back button should switch back to the Journey tab.
      const isOtherTab = [
        "/twin",
        "/(tabs)/twin",
        "/documents",
        "/(tabs)/documents",
        "/ai-health",
        "/(tabs)/ai-health",
        "/insights",
        "/(tabs)/insights",
      ].includes(pathname);

      if (isOtherTab) {
        router.navigate("/(tabs)");
        return true;
      }

      // Any other screen (MedicationVault, hydration, etc.) — let the
      // Stack navigator's native back gesture handle it.
      return false;
    };
    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [pathname]);

  const c = themeColors[theme as "light" | "dark"];
  const colors = {
    bg: c.card,
    active: c.active,
    inactive: c.sub,
    border: theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  };

  const renderTabIcon = (focused: boolean, color: string, filled: any, outline: any) => (
    <View style={{ alignItems: "center", width: "100%", height: "100%", justifyContent: "center" }}>
      {focused && (
        <View
          style={{
            position: "absolute",
            top: 0,
            width: 24,
            height: 3.5,
            borderRadius: 2,
            backgroundColor: colors.active,
            shadowColor: colors.active,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.5,
            shadowRadius: 4,
            elevation: 3,
          }}
        />
      )}
      <Ionicons name={focused ? filled : outline} size={focused ? 24 : 22} color={color} style={{ marginTop: focused ? 6 : 4 }} />
    </View>
  );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.bg,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: theme === "dark" ? 0.3 : 0.05,
          shadowRadius: 10,
          elevation: 8,
        },
        tabBarItemStyle: { height: 60 },
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Journey", tabBarIcon: ({ color, focused }) => renderTabIcon(focused, color, "map", "map-outline") }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="twin" options={{ title: "Twin", tabBarIcon: ({ color, focused }) => renderTabIcon(focused, color, "pulse", "pulse-outline") }} />
      <Tabs.Screen name="documents" options={{ title: "Documents", tabBarIcon: ({ color, focused }) => renderTabIcon(focused, color, "document-text", "document-text-outline") }} />
      <Tabs.Screen name="ai-health" options={{ title: "AI Health", tabBarIcon: ({ color, focused }) => renderTabIcon(focused, color, "chatbubble-ellipses", "chatbubble-ellipses-outline") }} />
      <Tabs.Screen name="insights" options={{ href: null }} />
    </Tabs>
  );
}