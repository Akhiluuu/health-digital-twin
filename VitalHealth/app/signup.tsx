import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  findNodeHandle,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path, Rect, Line } from "react-native-svg";

import { createUserWithEmailAndPassword, updateProfile as updateAuthProfile } from "firebase/auth";
import { useTheme } from "../context/ThemeContext";
import { setLoggedIn } from "../services/authStorage";
import { sendWelcomeEmail } from "../services/emailService";
import { auth } from "../services/firebase";
import { createUserProfile } from "../services/userService";

// ─── Classic Padlock Icon ───────────────────────────────────────────────────
function LockIcon({ color = "#64748b", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Shackle (arch) */}
      <Path
        d="M7 11V7a5 5 0 0 1 10 0v4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lock body — subtle fill + stroke */}
      <Rect
        x="4"
        y="11"
        width="16"
        height="11"
        rx="2.5"
        ry="2.5"
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="2"
      />
      {/* Keyhole circle */}
      <Path
        d="M12 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"
        fill={color}
      />
      {/* Keyhole slot */}
      <Rect x="11.25" y="16.5" width="1.5" height="2" rx="0.5" fill={color} />
    </Svg>
  );
}

// ─── Eye Icon (password visible) ───────────────────────────────────────────
function EyeIcon({ color = "#64748b", size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5z" />
      <Path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" fill="white" />
      <Path d="M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" fill={color} />
    </Svg>
  );
}

// ─── Eye-Off Icon (password hidden) ────────────────────────────────────────
function EyeOffIcon({ color = "#64748b", size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5z" />
      <Path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z" fill="white" />
      <Path d="M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" fill={color} />
      <Line x1="3" y1="3" x2="21" y2="21" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

export default function SignUp() {
  const router = useRouter();
  const { theme } = useTheme();

  const colors =
    theme === "light"
      ? {
          background: "#f8fafc",
          card: "#ffffff",
          text: "#020617",
          subText: "#64748b",
          border: "#e2e8f0",
          headerGradient: ["#6366f1", "#4f46e5"],
          danger: "#ef4444",
        }
      : {
          background: "#0D0D0F",
          card: "rgba(255,255,255,0.04)",
          text: "#ffffff",
          subText: "rgba(255,255,255,0.4)",
          border: "rgba(255,255,255,0.08)",
          headerGradient: ["#0f0c29", "#302b63"],
          danger: "#ff6b6b",
        };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [confirmFocused, setConfirmFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const orb1Y    = useRef(new Animated.Value(0)).current;
  const orb2Y    = useRef(new Animated.Value(0)).current;
  const orb3Y    = useRef(new Animated.Value(0)).current;
  const scrollRef  = useRef<ScrollView>(null);
  const passRef    = useRef<View>(null);
  const confirmRef = useRef<View>(null);

  // Scrolls the given field wrapper into view above the keyboard
  const scrollToField = (fieldRef: React.RefObject<View>) => {
    if (!fieldRef.current || !scrollRef.current) return;
    const scrollNode = findNodeHandle(scrollRef.current);
    if (!scrollNode) return;
    fieldRef.current.measureLayout(
      scrollNode,
      (_x, y) => {
        scrollRef.current?.scrollTo({ y: y - 24, animated: true });
      },
      () => {}
    );
  };

  useEffect(() => {
    const makeLoop = (anim: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -20,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );

    makeLoop(orb1Y, 3200, 0).start();
    makeLoop(orb2Y, 3800, 600).start();
    makeLoop(orb3Y, 2900, 1200).start();
  }, []);

  const createAccount = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Please enter your full name");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    if (password.length < 8) {
      Alert.alert("Error", "Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);

    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateAuthProfile(userCredential.user, { displayName: name.trim() });

      const user = userCredential.user;
      await createUserProfile(user.uid, {
        name: name.trim(),
        email: email.trim(),
        createdAt: new Date().toISOString(),
      });
    } catch (firebaseError: any) {
      setLoading(false);
      alert(firebaseError.message);
      return;
    }

    await AsyncStorage.multiRemove([
      "signupName", "signupEmail", "userProfile",
      "myInviteCode", "familyMembers", "activeMemberId", "appSettings",
    ]);
    await AsyncStorage.setItem("signupName", name.trim());
    await AsyncStorage.setItem("signupEmail", email.trim());

    await setLoggedIn();

    sendWelcomeEmail(name.trim(), email.trim());

    setLoading(false);

    router.replace({
      pathname: "/onboarding/personal",
      params: { signupName: name.trim(), signupEmail: email.trim() },
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.scroll}
        >
          {/* ORBS */}
          <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} />
          <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} />
          <Animated.View style={[styles.orb, styles.orb3, { transform: [{ translateY: orb3Y }] }]} />

          {/* BACK BUTTON */}
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backText, { color: colors.subText }]}>Back</Text>
          </TouchableOpacity>

          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.appName}>VitalHealth</Text>
            <Text style={[styles.title, { color: colors.text }]}>Create Account</Text>
            <Text style={[styles.subtitle, { color: colors.subText }]}>
              Start your health journey today
            </Text>
          </View>

          {/* STEP INDICATOR */}
          <View style={styles.stepRow}>
            <View style={[styles.stepActive, { backgroundColor: colors.headerGradient[0] }]} />
            <View style={[styles.stepInactive, { backgroundColor: colors.border }]} />
            <View style={[styles.stepInactive, { backgroundColor: colors.border }]} />
          </View>

          {/* NAME */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.subText }]}>Full Name</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.card, borderColor: colors.border },
                nameFocused && { borderColor: colors.headerGradient[0] },
              ]}
            >
              <Text style={[styles.inputIcon, { color: colors.subText }]}>👤</Text>
              <TextInput
                placeholder="John Doe"
                placeholderTextColor={colors.subText}
                value={name}
                onChangeText={setName}
                style={[styles.input, { color: colors.text }]}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
              />
            </View>
          </View>

          {/* EMAIL */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.subText }]}>Email Address</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.card, borderColor: colors.border },
                emailFocused && { borderColor: colors.headerGradient[0] },
              ]}
            >
              <Text style={[styles.inputIcon, { color: colors.subText }]}>✉️</Text>
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={colors.subText}
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { color: colors.text }]}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>
          </View>

          {/* PASSWORD */}
          <View ref={passRef} style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.subText }]}>Password</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.card, borderColor: colors.border },
                passFocused && { borderColor: colors.headerGradient[0] },
              ]}
            >
              {/* ✅ Classic padlock SVG */}
              <View style={styles.svgIcon}>
                <LockIcon color={colors.subText} size={18} />
              </View>
              <TextInput
                placeholder="Min. 8 characters"
                placeholderTextColor={colors.subText}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                style={[styles.input, { color: colors.text }]}
                onFocus={() => { setPassFocused(true); scrollToField(passRef); }}
                onBlur={() => setPassFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                {showPass ? (
                  <EyeIcon color={colors.subText} size={20} />
                ) : (
                  <EyeOffIcon color={colors.subText} size={20} />
                )}
              </TouchableOpacity>
            </View>

            {password.length > 0 && (
              <View style={styles.strengthRow}>
                {[...Array(4)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthDot,
                      { backgroundColor: colors.border },
                      password.length > i * 2 && { backgroundColor: colors.headerGradient[0] },
                    ]}
                  />
                ))}
                <Text style={[styles.strengthLabel, { color: colors.subText }]}>
                  {password.length < 4 ? "Weak" : password.length < 7 ? "Fair" : "Strong"}
                </Text>
              </View>
            )}
          </View>

          {/* CONFIRM PASSWORD */}
          <View ref={confirmRef} style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.subText }]}>Confirm Password</Text>
            <View
              style={[
                styles.inputWrapper,
                { backgroundColor: colors.card, borderColor: colors.border },
                confirmFocused && { borderColor: colors.headerGradient[0] },
              ]}
            >
              {/* ✅ Classic padlock SVG */}
              <View style={styles.svgIcon}>
                <LockIcon color={colors.subText} size={18} />
              </View>
              <TextInput
                placeholder="Re-enter your password"
                placeholderTextColor={colors.subText}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPass}
                style={[styles.input, { color: colors.text }]}
                onFocus={() => { setConfirmFocused(true); scrollToField(confirmRef); }}
                onBlur={() => setConfirmFocused(false)}
              />
              <TouchableOpacity onPress={() => setShowConfirmPass(!showConfirmPass)} style={styles.eyeBtn}>
                {showConfirmPass ? (
                  <EyeIcon color={colors.subText} size={20} />
                ) : (
                  <EyeOffIcon color={colors.subText} size={20} />
                )}
              </TouchableOpacity>
            </View>

            {confirmPassword.length > 0 && password !== confirmPassword && (
              <Text style={[styles.matchError, { color: colors.danger }]}>
                Passwords do not match
              </Text>
            )}
          </View>

          {/* BUTTON */}
          <TouchableOpacity
            style={[
              styles.createBtn,
              { backgroundColor: colors.headerGradient[0] },
              loading && { opacity: 0.7 },
            ]}
            onPress={createAccount}
            disabled={loading}
          >
            <Text style={[styles.createBtnText, { color: colors.text }]}>
              {loading ? "Creating..." : "Create Account"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1 },
  scroll:        { paddingHorizontal: 26, paddingTop: 40, paddingBottom: 60 },
  backButton:    { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, marginBottom: 20 },
  backText:      { fontSize: 14, fontWeight: "600" },
  orb:           { position: "absolute", borderRadius: 999 },
  orb1:          { width: 300, height: 300, backgroundColor: "#3b82f6", opacity: 0.11, top: -80, left: -110 },
  orb2:          { width: 220, height: 220, backgroundColor: "#60a5fa", opacity: 0.08, bottom: 60, right: -90 },
  orb3:          { width: 150, height: 150, backgroundColor: "#1d4ed8", opacity: 0.1, top: "45%", left: -40 },
  header:        { alignItems: "center", marginBottom: 20 },
  appName:       { fontSize: 22, fontWeight: "900", color: "#2563eb", letterSpacing: 0.5, marginBottom: 10 },
  title:         { fontSize: 28, fontWeight: "800" },
  subtitle:      { fontSize: 14 },
  stepRow:       { flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 },
  stepActive:    { width: 28, height: 4, borderRadius: 2 },
  stepInactive:  { width: 12, height: 4, borderRadius: 2 },
  fieldWrapper:  { marginBottom: 16 },
  fieldLabel:    { fontSize: 11, marginBottom: 7 },
  inputWrapper:  { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 52 },
  inputIcon:     { marginRight: 10 },
  svgIcon:       { marginRight: 10, alignItems: "center", justifyContent: "center" },
  input:         { flex: 1 },
  eyeBtn:        { padding: 6 },
  strengthRow:   { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 },
  strengthDot:   { width: 24, height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 11 },
  createBtn:     { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 10 },
  createBtnText: { fontWeight: "700" },
  matchError:    { fontSize: 12, marginTop: 6, marginLeft: 4, fontWeight: "500" },
});