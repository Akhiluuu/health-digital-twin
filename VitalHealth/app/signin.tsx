import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path, Line } from "react-native-svg";

import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useTheme } from "../context/ThemeContext";
import { colors as globalColors } from "../theme/colors";
import { setLoggedIn } from "../services/authStorage";
import { sendLoginEmail } from "../services/emailService";
import { auth } from "../services/firebase";

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

export default function SignIn() {

  const router = useRouter();
  const { theme } = useTheme();

  const c = globalColors[theme];
  const colors = {
    background: c.bg,
    card: c.card,
    text: c.text,
    subText: c.sub,
    border: c.border,
    headerGradient: c.headerGradient,
  };

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");

  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused,  setPassFocused]  = useState(false);
  const [showPass,     setShowPass]     = useState(false);
  const [loading,      setLoading]      = useState(false);

  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail,        setForgotEmail]        = useState("");
  const [forgotLoading,      setForgotLoading]      = useState(false);

  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;

  const scrollRef = useRef<ScrollView>(null);

  // ✅ FIX: Refs now point to TextInput (native component), not wrapper View
  const emailInputRef = useRef<TextInput>(null);
  const passInputRef  = useRef<TextInput>(null);

  // ✅ FIX: measureLayout called on TextInput ref → native component ✓
  const scrollToField = (fieldRef: React.RefObject<TextInput | null>) => {
    if (!fieldRef.current || !scrollRef.current) return;
    fieldRef.current.measureLayout(
      scrollRef.current as any,
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

  const login = async () => {
    if (!email || !password) {
      Alert.alert("Input Required", "Please enter both email and password.");
      return;
    }

    setLoading(true);

    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (firebaseError: any) {
      setLoading(false);
      let errorMessage = "Incorrect email or password. Please try again.";
      if (firebaseError.code === "auth/invalid-email" || firebaseError.message?.includes("invalid-email")) {
        errorMessage = "Please enter a valid email address.";
      } else if (
        firebaseError.code === "auth/user-not-found" || 
        firebaseError.code === "auth/wrong-password" || 
        firebaseError.code === "auth/invalid-credential" ||
        firebaseError.message?.includes("invalid-credential")
      ) {
        errorMessage = "Incorrect email or password. Please try again.";
      } else if (firebaseError.code === "auth/network-request-failed" || firebaseError.message?.includes("network-request-failed")) {
        errorMessage = "Network connection failed. Please check your internet connection.";
      }
      Alert.alert("Sign In Failed", errorMessage, [{ text: "OK" }]);
      return;
    }

    await setLoggedIn();

    try {
      const user = userCredential.user;
      const fullName = user?.displayName || email;
      sendLoginEmail(fullName, email.trim());
    } catch (e) {
      console.log("⚠️ Login email error (non-critical):", e);
    }

    setLoading(false);
    router.replace("/startup");
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = forgotEmail.trim();
    if (!trimmedEmail) {
      Alert.alert("Input Required", "Please enter your email address.");
      return;
    }

    // Basic email format check before hitting Firebase
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setForgotLoading(true);
    try {
      // NOTE: fetchSignInMethodsForEmail is deprecated when Firebase Email Enumeration
      // Protection is enabled (default for new projects). We call sendPasswordResetEmail
      // directly — Firebase handles unknown emails gracefully in that mode.
      await sendPasswordResetEmail(auth, trimmedEmail);
      setForgotModalVisible(false);
      setForgotEmail("");
      Alert.alert(
        "Reset Email Sent",
        "If an account exists for " + trimmedEmail + ", a password reset link has been sent. Please check your inbox (and spam folder)."
      );
    } catch (error: any) {
      console.log("Forgot password error:", error.code, error.message);
      let errMsg = "Failed to send reset link. Please try again.";
      if (
        error.code === "auth/invalid-email" ||
        error.message?.includes("invalid-email")
      ) {
        errMsg = "Please enter a valid email address.";
      } else if (
        error.code === "auth/user-not-found" ||
        error.message?.includes("user-not-found")
      ) {
        // With enumeration protection off, this may still appear
        errMsg = "No account found with this email address.";
      } else if (
        error.code === "auth/network-request-failed" ||
        error.message?.includes("network-request-failed")
      ) {
        errMsg = "Network error. Please check your connection and try again.";
      } else if (
        error.code === "auth/too-many-requests" ||
        error.message?.includes("too-many-requests")
      ) {
        errMsg = "Too many requests. Please wait a moment and try again.";
      }
      Alert.alert("Reset Failed", errMsg);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { backgroundColor: colors.background }]}>

          {/* Animated Background Orbs */}
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb3, { transform: [{ translateY: orb3Y }] }]} />

          <View style={styles.inner}>

            {/* BACK BUTTON */}
            <TouchableOpacity
              style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}
            >
              <Text style={[styles.backText, { color: colors.subText }]}>Back</Text>
            </TouchableOpacity>

            {/* HEADER */}
            <View style={styles.header}>
              <View style={[styles.iconBadge, { backgroundColor: colors.card }]}>
                <Text style={styles.iconEmoji}>🔐</Text>
              </View>
              <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
              <Text style={[styles.subtitle, { color: colors.subText }]}>
                Sign in to continue your health journey
              </Text>
            </View>

            {/* EMAIL */}
            {/* ✅ FIX: wrapper View has no ref; TextInput carries the ref */}
            <View style={styles.fieldWrapper}>
              <Text style={[styles.fieldLabel, { color: colors.subText }]}>Email Address</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  emailFocused && styles.inputFocused,
                ]}
              >
                <Text style={styles.inputIcon}>✉️</Text>
                <TextInput
                  ref={emailInputRef}                          // ✅ ref on TextInput
                  placeholder="you@example.com"
                  placeholderTextColor={colors.subText}
                  value={email}
                  onChangeText={setEmail}
                  style={[styles.input, { color: colors.text }]}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  blurOnSubmit={false}
                  onFocus={() => {
                    setEmailFocused(true);
                    scrollToField(emailInputRef);              // ✅ pass TextInput ref
                  }}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>
            </View>

            {/* PASSWORD */}
            {/* ✅ FIX: wrapper View has no ref; TextInput carries the ref */}
            <View style={styles.fieldWrapper}>
              <Text style={[styles.fieldLabel, { color: colors.subText }]}>Password</Text>
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  passFocused && styles.inputFocused,
                ]}
              >
                <Text style={styles.inputIcon}>🔒</Text>
                <TextInput
                  ref={passInputRef}                           // ✅ ref on TextInput
                  placeholder="••••••••"
                  placeholderTextColor={colors.subText}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                  style={[styles.input, { color: colors.text }]}
                  autoCorrect={false}
                  blurOnSubmit={false}
                  onFocus={() => {
                    setPassFocused(true);
                    scrollToField(passInputRef);               // ✅ pass TextInput ref
                  }}
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
            </View>

            {/* FORGOT PASSWORD */}
            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => {
                setForgotEmail("");
                setForgotModalVisible(true);
              }}
            >
              <Text style={[styles.forgotText, { color: colors.subText }]}>Forgot password?</Text>
            </TouchableOpacity>

            {/* LOGIN BUTTON */}
            <TouchableOpacity
              style={[styles.loginBtn, loading && { opacity: 0.7 }]}
              onPress={login}
              activeOpacity={0.85}
              disabled={loading}
            >
              <Text style={[styles.loginBtnText, { color: colors.text }]}>
                {loading ? "Signing in…" : "Sign In"}
              </Text>
              {!loading && (
                <Text style={[styles.loginBtnArrow, { color: colors.subText }]}>→</Text>
              )}
            </TouchableOpacity>

            {/* DIVIDER */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.subText }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* SIGNUP */}
            <TouchableOpacity onPress={() => router.push("/signup")}>
              <Text style={[styles.signupText, { color: colors.subText }]}>
                Don't have an account?{" "}
                <Text style={[styles.signupHighlight, { color: colors.text }]}>Create one</Text>
              </Text>
            </TouchableOpacity>

          </View>

          {/* FORGOT PASSWORD MODAL */}
          <Modal visible={forgotModalVisible} transparent animationType="slide">
            <View style={styles.overlay}>
              <View style={[styles.modal, { backgroundColor: theme === "light" ? "#ffffff" : "#0f172a" }]}>

                <Text style={[styles.modalTitle, { color: colors.text }]}>Forgot Password</Text>
                <Text style={[styles.modalSub, { color: colors.subText }]}>
                  Enter your registered email to receive a reset link.
                </Text>

                <TextInput
                  style={[styles.modalInput, {
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderColor: colors.border,
                  }]}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.subText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                />

                {forgotLoading ? (
                  <ActivityIndicator style={{ marginTop: 12 }} color="#3b82f6" />
                ) : (
                  <TouchableOpacity style={styles.modalBtn} onPress={handleForgotPassword}>
                    <Text style={styles.modalBtnText}>Send Reset Email</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setForgotModalVisible(false)}
                  style={styles.modalCancel}
                >
                  <Text style={{ color: colors.subText }}>Cancel</Text>
                </TouchableOpacity>

              </View>
            </View>
          </Modal>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  inner:           { flex: 1, paddingHorizontal: 26, justifyContent: "center" },
  backText:        { fontSize: 14, fontWeight: "600" },
  backButton:      { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, marginBottom: 24 },
  orb:             { position: "absolute", borderRadius: 999 },
  orb1:            { width: 320, height: 320, backgroundColor: "#3b82f6", opacity: 0.12, top: -100, right: -110 },
  orb2:            { width: 240, height: 240, backgroundColor: "#60a5fa", opacity: 0.09, bottom: 40, left: -100 },
  orb3:            { width: 160, height: 160, backgroundColor: "#1d4ed8", opacity: 0.1, top: "42%", right: -50 },
  header:          { alignItems: "center", marginBottom: 32 },
  iconBadge:       { width: 66, height: 66, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  iconEmoji:       { fontSize: 30 },
  title:           { fontSize: 30, fontWeight: "800" },
  subtitle:        { fontSize: 14 },
  fieldWrapper:    { marginBottom: 18 },
  fieldLabel:      { fontSize: 11, marginBottom: 8 },
  inputWrapper:    { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 52 },
  inputFocused:    { borderColor: "#3b82f6" },
  inputIcon:       { fontSize: 15, marginRight: 10 },
  input:           { flex: 1, fontSize: 15 },
  eyeBtn:          { padding: 6 },
  forgotRow:       { alignItems: "flex-end", marginBottom: 24 },
  forgotText:      { fontSize: 13 },
  loginBtn:        { height: 52, backgroundColor: "#2563eb", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  loginBtnText:    { fontSize: 16, fontWeight: "700" },
  loginBtnArrow:   { marginLeft: 8 },
  dividerRow:      { flexDirection: "row", alignItems: "center", marginVertical: 20 },
  dividerLine:     { flex: 1, height: 1 },
  dividerText:     { marginHorizontal: 12 },
  signupText:      { textAlign: "center" },
  signupHighlight: { fontWeight: "700" },

  // Modal styles
  overlay:         { flex: 1, backgroundColor: "#00000088", justifyContent: "center", padding: 24 },
  modal:           { borderRadius: 16, padding: 24, gap: 12 },
  modalTitle:      { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  modalSub:        { fontSize: 13, marginBottom: 4 },
  modalInput:      { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15 },
  modalBtn:        { backgroundColor: "#2563eb", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 4 },
  modalBtnText:    { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalCancel:     { alignItems: "center", paddingTop: 8 },
});