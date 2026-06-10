import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";

const { width, height } = Dimensions.get("window");

function Orb({
  size,
  color,
  style,
  delay = 0,
}: {
  size: number;
  color: string;
  style?: object;
  delay?: number;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(floatAnim, {
            toValue: -18,
            duration: 3200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 3200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 3200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.8,
            duration: 3200,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.18,
          transform: [{ translateY: floatAnim }, { scale: scaleAnim }],
        },
        style,
      ]}
    />
  );
}

function PulseRing({ delay = 0, colors }: { delay?: number; colors: any }) {
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const opacityAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.5,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scaleAnim, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          Animated.timing(opacityAnim, { toValue: 0.7, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulseRing,
        { transform: [{ scale: scaleAnim }], opacity: opacityAnim, borderColor: colors.primary },
      ]}
    />
  );
}

export default function Welcome() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = globalColors[theme];
  
  const colors = theme === "light"
    ? {
        background: c.bg,
        card: c.card,
        text: c.text,
        subText: c.sub,
        border: c.border,
        primary: c.primary,
        primaryLight: c.primaryLight,
        primaryDark: c.primaryDark,
        pillBg: "#dbeafe",
        pillBorder: "#bfdbfe",
        pillText: "#1e40af",
        buttonSecondaryBorder: "#cbd5e1",
        buttonSecondaryText: "#334155",
        iconBg: "#ffffff",
        iconBorder: "#bfdbfe",
        titleUnderline: c.primary,
      }
    : {
        background: c.bg,
        card: c.card,
        text: c.text,
        subText: c.sub,
        border: c.border,
        primary: c.primary,
        primaryLight: c.primaryLight,
        primaryDark: c.primaryDark,
        pillBg: c.card,
        pillBorder: c.border,
        pillText: c.primaryLight,
        buttonSecondaryBorder: c.border,
        buttonSecondaryText: c.primaryLight,
        iconBg: c.card,
        iconBorder: c.primary + "44",
        titleUnderline: c.primary,
      };

  const logoAnim = useRef(new Animated.Value(0)).current;
  const subtitleAnim = useRef(new Animated.Value(0)).current;
  const btnAnim = useRef(new Animated.Value(0)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(180, [
      Animated.timing(logoAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(taglineAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(subtitleAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(btnAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Background orbs — blue theme */}
      <Orb size={320} color={colors.primaryLight} delay={0}
        style={{ position: "absolute", top: -80, right: -100 }} />
      <Orb size={260} color={colors.primaryLight} delay={600}
        style={{ position: "absolute", bottom: 60, left: -120 }} />
      <Orb size={180} color={colors.primaryDark} delay={1200}
        style={{ position: "absolute", top: height * 0.35, right: -60 }} />

      <View pointerEvents="none" style={[styles.gridOverlay, { opacity: theme === "light" ? 0.02 : 0.04 }]} />

      {/* Center pulse icon */}
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            opacity: logoAnim,
            transform: [
              {
                translateY: logoAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <PulseRing delay={0} colors={colors} />
        <PulseRing delay={700} colors={colors} />
        <View style={[styles.iconInner, { 
          backgroundColor: colors.iconBg, 
          borderColor: colors.iconBorder,
          shadowColor: colors.primary,
        }]}>
          <Text style={styles.iconEmoji}>🫀</Text>
        </View>
      </Animated.View>

      {/* Title */}
      <Animated.View
        style={{
          opacity: logoAnim,
          transform: [
            {
              translateY: logoAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
          alignItems: "center",
        }}
      >
        <Text style={[styles.title, { color: colors.text }]}>VitalHealth</Text>
        <View style={[styles.titleUnderline, { backgroundColor: colors.titleUnderline }]} />
      </Animated.View>

      {/* Tagline */}
      <Animated.Text
        style={[
          styles.tagline,
          {
            color: colors.primaryLight,
            opacity: taglineAnim,
            transform: [
              {
                translateY: taglineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        Your Smart Health Companion
      </Animated.Text>

      {/* Feature pills */}
      <Animated.View
        style={[
          styles.pillsRow,
          {
            opacity: subtitleAnim,
            transform: [
              {
                translateY: subtitleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [16, 0],
                }),
              },
            ],
          },
        ]}
      >
        {["🧬 Track Vitals", "💤 Sleep Analysis", "🥗 Nutrition"].map((item) => (
          <View key={item} style={[styles.pill, { 
            backgroundColor: colors.pillBg, 
            borderColor: colors.pillBorder 
          }]}>
            <Text style={[styles.pillText, { color: colors.pillText }]}>{item}</Text>
          </View>
        ))}
      </Animated.View>

      {/* Buttons */}
      <Animated.View
        style={[
          styles.buttonGroup,
          {
            opacity: btnAnim,
            transform: [
              {
                translateY: btnAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [24, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.buttonPrimary, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={() => router.push("/signup")}
        >
          <Text style={styles.buttonPrimaryText}>Get Started</Text>
          <Text style={[styles.buttonArrow, { color: theme === "light" ? "#e2e8f0" : "#bfdbfe" }]}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buttonSecondary, { 
            borderColor: colors.buttonSecondaryBorder,
          }]}
          activeOpacity={0.75}
          onPress={() => router.push("/signin")}
        >
          <Text style={[styles.buttonSecondaryText, { color: colors.buttonSecondaryText }]}>
            I already have an account
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Footer - optional, commented out in original */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 28,
  },

  gridOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 0,
  },

  iconWrapper: {
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  pulseRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  iconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
    elevation: 12,
  },
  iconEmoji: {
    fontSize: 34,
  },

  title: {
    fontSize: 46,
    fontWeight: "800",
    letterSpacing: -1.5,
    textAlign: "center",
  },
  titleUnderline: {
    width: 48,
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "500",
    marginTop: 10,
    marginBottom: 28,
  },

  pillsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 44,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  pill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "500",
  },

  buttonGroup: {
    width: "100%",
    alignItems: "center",
    gap: 14,
  },
  buttonPrimary: {
    width: "100%",
    paddingVertical: 17,
    paddingHorizontal: 32,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
    gap: 10,
  },
  buttonPrimaryText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  buttonArrow: {
    fontSize: 18,
    fontWeight: "600",
  },
  buttonSecondary: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "transparent",
    alignItems: "center",
  },
  buttonSecondaryText: {
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  footer: {
    position: "absolute",
    bottom: 36,
    fontSize: 12,
    letterSpacing: 0.5,
  },
});