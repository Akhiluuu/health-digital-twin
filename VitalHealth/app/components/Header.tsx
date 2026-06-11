// components/Header.tsx

import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../../context/ThemeContext";
import { colors as globalColors } from "../../theme/colors";
import { useFamily } from "../../context/FamilyContext";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showProfile?: boolean;
  showSOS?: boolean;
  onBack?: () => void;
}

export default function Header({
  title = "VitalHealth",
  showBack = false,
  showProfile = true,
  showSOS = true,
  onBack,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { activeProfile } = useFamily();

  const c = globalColors[theme];
  const colors = {
    bg: c.card,
    border: c.border,
    text: c.text,
    accent: c.accent,
  };

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
        {/* LEFT: Back Button or Profile Switcher Trigger */}
        {showBack ? (
          <TouchableOpacity
            onPress={onBack || (() => router.back())}
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
            {activeProfile?.profileImage ? (
              <Image
                source={{ uri: activeProfile.profileImage }}
                style={styles.avatarImage}
              />
            ) : (activeProfile?.firstName || activeProfile?.lastName) ? (
              <View style={[styles.avatarInitials, { backgroundColor: colors.accent + "15", borderColor: colors.accent }]}>
                <Text style={[styles.avatarInitialsText, { color: colors.accent }]}>
                  {activeProfile?.firstName?.charAt(0)?.toUpperCase() || ""}
                  {activeProfile?.lastName?.charAt(0)?.toUpperCase() || ""}
                </Text>
              </View>
            ) : (
              <View style={[styles.avatarInitials, { backgroundColor: colors.accent + "15", borderColor: colors.accent }]}>
                <Ionicons name="person" size={16} color={colors.accent} />
              </View>
            )}
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

  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarInitials: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsText: {
    fontSize: 12,
    fontWeight: "700",
  },
});