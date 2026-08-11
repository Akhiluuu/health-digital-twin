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
import { useNotifications } from "../../context/NotificationContext";
import * as Haptics from "expo-haptics";

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  showProfile?: boolean;
  onBack?: () => void;
}

export default function Header({
  title = "VitalHealth",
  showBack = false,
  showProfile = true,
  onBack,
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const { activeProfile } = useFamily();

  const c = globalColors[theme];
  const colors = {
    bg: theme === "dark" ? "rgba(17, 29, 58, 0.96)" : "rgba(255, 255, 255, 0.96)",
    border: theme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
    text: c.text,
    accent: c.accent,
  };

  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => {
    setImageError(false);
  }, [activeProfile?.profileImage]);

  const handleProfilePress = () => {
    if (!pathname.includes("profile")) {
      router.push("/profile");
    }
  };

  const notificationsCtx = useNotifications();
  const unreadCount = notificationsCtx?.unreadCount ?? 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.bg,
          borderBottomColor: colors.border,
          paddingTop: insets.top,
          height: 56 + insets.top,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* LEFT: Back Button or Profile Switcher Trigger */}
        {showBack ? (
          <TouchableOpacity
            onPress={onBack || (() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } })}
            activeOpacity={0.7}
            style={styles.backBtn}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
        ) : showProfile ? (
          <TouchableOpacity
            onPress={handleProfilePress}
            activeOpacity={0.7}
          >
            {activeProfile?.profileImage && !imageError ? (
              <Image
                source={{ uri: activeProfile.profileImage }}
                style={styles.avatarImage}
                onError={() => setImageError(true)}
              />
            ) : (activeProfile?.firstName || activeProfile?.lastName) ? (
              <View style={[styles.avatarInitials, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "40" }]}>
                <Text style={[styles.avatarInitialsText, { color: colors.accent }]}>
                  {activeProfile?.firstName?.charAt(0)?.toUpperCase() || ""}
                  {activeProfile?.lastName?.charAt(0)?.toUpperCase() || ""}
                </Text>
              </View>
            ) : (
              <View style={[styles.avatarInitials, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "40" }]}>
                <Ionicons name="person" size={14} color={colors.accent} />
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}

        {/* TITLE */}
        <View style={styles.titleContainer}>
          <Text
            style={[
              styles.title,
              { color: colors.text },
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        {/* RIGHT: Bug Report & Notifications */}
        <View style={styles.rightActions}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/report-bug" as any);
            }}
            activeOpacity={0.7}
            style={styles.bugBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="bug-outline"
              size={21}
              color={colors.accent}
            />
            <View style={styles.betaTag}>
              <Text style={styles.betaTagText}>BETA</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/NotificationCenter" as any);
            }}
            activeOpacity={0.7}
            style={styles.notificationBtn}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={colors.text}
            />
            {unreadCount > 0 && (
              <View style={styles.notificationBadge} />
            )}
          </TouchableOpacity>
        </View>
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

  backBtn: {
    padding: 4,
    marginLeft: -4,
  },

  titleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },

  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
  },

  sosButton: {
    borderColor: "#ef4444",
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  sosText: {
    color: "#ef4444",
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.5,
  },

  placeholder: {
    width: 36,
  },

  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarInitials: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialsText: {
    fontSize: 11,
    fontWeight: "700",
  },
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bugBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 6,
    borderRadius: 12,
    position: "relative",
  },
  betaTag: {
    backgroundColor: "#ef4444",
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
    position: "absolute",
    top: 0,
    right: -4,
  },
  betaTagText: {
    color: "#ffffff",
    fontSize: 7,
    fontWeight: "800",
  },
  notificationBtn: {
    padding: 6,
    marginRight: -6,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  notificationBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
});