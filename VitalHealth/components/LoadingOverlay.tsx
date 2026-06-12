import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { useFamily } from "../context/FamilyContext";
import { useTheme } from "../context/ThemeContext";
import { useMedicine } from "../context/MedicineContext";
import { useSymptoms } from "../context/SymptomContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import { useNutrition } from "../context/NutritionContext";
import { useHydration } from "../context/HydrationContext";

const { width } = Dimensions.get("window");

export function LoadingOverlay() {
  const { isSwitchLoading, activeMemberId } = useFamily();
  const { theme } = useTheme();
  
  // Call hooks unconditionally at the top level to conform to React Rules of Hooks
  const medCtx = useMedicine();
  const sympCtx = useSymptoms();
  const twinCtx = useBiogearsTwin();
  const nutrCtx = useNutrition();
  const hydCtx = useHydration();

  const isLoadingMeds = medCtx?.isLoadingMemberMedicines ?? false;
  const isLoadingSymps = sympCtx?.isLoadingMemberSymptoms ?? false;
  const isTwinLoading = twinCtx?.isTwinLoading ?? false;
  const isLoadingNutr = nutrCtx ? !nutrCtx.loaded : false;
  const isLoadingHyd = hydCtx?.isLoadingHydration ?? false;

  // Synchronous state adjustment during render to prevent 1-frame blinking
  const [prevMemberId, setPrevMemberId] = useState(activeMemberId);
  const [isSyncingSwitchedProfile, setIsSyncingSwitchedProfile] = useState(false);

  if (activeMemberId !== prevMemberId) {
    setPrevMemberId(activeMemberId);
    setIsSyncingSwitchedProfile(true);
  }

  // Clear transition lock only when ALL loaders are false
  useEffect(() => {
    if (
      !isSwitchLoading &&
      !isLoadingMeds &&
      !isLoadingSymps &&
      !isTwinLoading &&
      !isLoadingNutr &&
      !isLoadingHyd
    ) {
      setIsSyncingSwitchedProfile(false);
    }
  }, [
    isSwitchLoading,
    isLoadingMeds,
    isLoadingSymps,
    isTwinLoading,
    isLoadingNutr,
    isLoadingHyd,
  ]);

  const showOverlay =
    isSyncingSwitchedProfile ||
    isSwitchLoading ||
    isLoadingMeds ||
    isLoadingSymps ||
    isTwinLoading ||
    isLoadingNutr ||
    isLoadingHyd;

  // Animation refs
  const spinValue = useRef(new Animated.Value(0)).current;
  const pulseValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let spinAnim: Animated.CompositeAnimation | null = null;
    let pulseAnim: Animated.CompositeAnimation | null = null;

    if (showOverlay) {
      spinValue.setValue(0);
      pulseValue.setValue(1);

      spinAnim = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnim.start();

      pulseAnim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseValue, {
            toValue: 0.6,
            duration: 800,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(pulseValue, {
            toValue: 1,
            duration: 800,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ])
      );
      pulseAnim.start();
    } else {
      spinValue.setValue(0);
      pulseValue.setValue(1);
    }

    return () => {
      if (spinAnim) spinAnim.stop();
      if (pulseAnim) pulseAnim.stop();
    };
  }, [showOverlay]);

  if (!showOverlay) return null;

  const isDark = theme === "dark";

  // Spin interpolation
  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.overlayContainer} pointerEvents="auto">
      {/* Background Dim */}
      <View
        style={[
          styles.backdrop,
          { backgroundColor: isDark ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.65)" },
        ]}
      />

      {/* Center Popup Card */}
      <View
        style={[
          styles.popupCard,
          {
            backgroundColor: isDark ? "#1e293b" : "#ffffff",
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)",
            shadowColor: isDark ? "#000000" : "#0f172a",
          },
        ]}
      >
        {/* Animated Icon Ring */}
        <Animated.View style={[styles.iconContainer, { transform: [{ rotate: spin }] }]}>
          <Text style={styles.emojiIcon}>🧬</Text>
        </Animated.View>

        {/* Health Spinner */}
        <ActivityIndicator
          size="small"
          color="#0ea5e9"
          style={styles.spinner}
        />

        {/* Creative Pulse Text */}
        <Animated.Text
          style={[
            styles.titleText,
            {
              color: isDark ? "#f8fafc" : "#0f172a",
              opacity: pulseValue,
            },
          ]}
        >
          {isSwitchLoading
            ? "Loading clinical profile..."
            : isTwinLoading
            ? "Calibrating digital twin..."
            : isLoadingMeds
            ? "Syncing Medication Vault..."
            : isLoadingSymps
            ? "Retrieving symptoms logs..."
            : isLoadingNutr
            ? "Syncing nutrition log..."
            : "Retrieving hydration log..."}
        </Animated.Text>
        
        <Text style={[styles.subtitleText, { color: isDark ? "#94a3b8" : "#64748b" }]}>
          Please wait while secure twin metrics are synchronized.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  popupCard: {
    width: width * 0.82,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
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
  emojiIcon: {
    fontSize: 40,
    lineHeight: 48,
    textAlign: "center",
  },
  spinner: {
    marginBottom: 12,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  subtitleText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
});
