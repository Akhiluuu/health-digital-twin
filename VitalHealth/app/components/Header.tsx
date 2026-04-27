// components/Header.tsx

import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showProfile?: boolean;
  showSOS?: boolean;
}

export default function Header({
  title = "VitalHealth",
  showBack = false,
  showProfile = true,
  showSOS = true,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const colors =
    theme === "light"
      ? {
          bg: "#ffffff",
          border: "#e2e8f0",
          text: "#020617",
          accent: "#0ea5e9",
        }
      : {
          bg: "#020617",
          border: "#1e293b",
          text: "#e2e8f0",
          accent: "#38bdf8",
        };

  // Prevent duplicate navigation to Profile
  const handleProfilePress = () => {
    if (!pathname.includes("profile")) {
      router.push("/profile");
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
          height: 60 + insets.top,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* LEFT: Back Button or Profile Icon */}
        {showBack ? (
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons
              name="chevron-back"
              size={28}
              color={colors.accent}
            />
          </TouchableOpacity>
        ) : showProfile ? (
          <TouchableOpacity
            onPress={handleProfilePress}
            activeOpacity={0.7}
          >
            <Ionicons
              name="person-circle-outline"
              size={34}
              color={colors.accent}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}

        {/* TITLE */}
        <Text
          style={[
            styles.title,
            { color: colors.text },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>

        {/* RIGHT: SOS Button */}
        {showSOS ? (
          <TouchableOpacity
            style={styles.sosButton}
            activeOpacity={0.85}
            onPress={() => router.push("/sos")}
          >
            <Text style={styles.sosText}>SOS</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: 1,
    zIndex: 999,
  },

  contentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },

  title: {
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "center",
  },

  sosButton: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 22,
    shadowColor: "#ef4444",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },

  sosText: {
    color: "white",
    fontWeight: "bold",
    letterSpacing: 1,
  },

  placeholder: {
    width: 34,
  },
});