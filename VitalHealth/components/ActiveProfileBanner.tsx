// app/components/ActiveProfileBanner.tsx
// Persistent animated banner shown on ALL screens when viewing a family member's profile.
// Shows a loading indicator while the profile is being fetched from Firebase.

import React, { useEffect, useRef } from "react";
import {
  Animated, StyleSheet, Text,
  TouchableOpacity, View, Platform, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFamily } from "./../context/FamilyContext";

export default function ActiveProfileBanner() {
  const { isSwitched, isSwitchLoading, activeMemberInfo, activeProfile, switchToSelf } = useFamily();

  const slideAnim  = useRef(new Animated.Value(-80)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);

  // Slide banner in/out
  useEffect(() => {
    if (isSwitched || isSwitchLoading) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -80,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => { pulseLoop.current?.stop(); };
  }, [isSwitched, isSwitchLoading]);

  // Don't render at all when fully hidden and not loading
  if (!isSwitched && !isSwitchLoading) return null;

  const memberName =
    activeMemberInfo
      ? `${activeMemberInfo.firstName ?? ""} ${activeMemberInfo.lastName ?? ""}`.trim()
      : `${activeProfile.firstName ?? ""} ${activeProfile.lastName ?? ""}`.trim();

  const relation = activeMemberInfo?.relation ?? "Family";

  const initials = isSwitchLoading
    ? "..."
    : (
        (activeMemberInfo?.firstName?.charAt(0) ?? activeProfile.firstName?.charAt(0) ?? "?").toUpperCase() +
        (activeMemberInfo?.lastName?.charAt(0)  ?? activeProfile.lastName?.charAt(0)  ?? "").toUpperCase()
      );

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <LinearGradient
        colors={["#7c3aed", "#2563eb"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {/* Left: indicator + avatar + name */}
        <View style={styles.left}>
          {isSwitchLoading ? (
            <ActivityIndicator size="small" color="#fff" style={{ marginRight: 4 }} />
          ) : (
            <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
          )}

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.viewingLabel}>
              {isSwitchLoading ? "Loading profile..." : "Viewing profile"}
            </Text>
            {!isSwitchLoading && (
              <Text style={styles.memberName} numberOfLines={1}>
                {memberName || "Family member"}
                {relation ? <Text style={styles.relation}> · {relation}</Text> : null}
              </Text>
            )}
          </View>
        </View>

        {/* Right: switch back button (only when fully loaded) */}
        {!isSwitchLoading && (
          <TouchableOpacity
            style={styles.switchBackBtn}
            onPress={switchToSelf}
            activeOpacity={0.75}
          >
            <Ionicons name="person" size={13} color="#7c3aed" />
            <Text style={styles.switchBackText}>Switch back</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 99,
    paddingTop: Platform.OS === "ios" ? 52 : 34,
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4ade80",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  viewingLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  memberName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 180,
  },
  relation: {
    color: "rgba(255,255,255,0.7)",
    fontWeight: "400",
    fontSize: 12,
  },
  switchBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  switchBackText: {
    color: "#7c3aed",
    fontSize: 12,
    fontWeight: "700",
  },
});