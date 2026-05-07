import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
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
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../context/ThemeContext";

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];

export default function Medical() {
  const router = useRouter();
  const { theme } = useTheme();

  const {
    signupName,
    signupEmail,
    firstName,
    lastName,
    phone,
    dateOfBirth,
    gender,
  } = useLocalSearchParams<{
    signupName:  string;
    signupEmail: string;
    firstName:   string;
    lastName:    string;
    phone:       string;
    dateOfBirth: string;
    gender:      string;
  }>();

  const colors =
    theme === "light"
      ? {
          background:            "#f8fafc",
          card:                  "#ffffff",
          text:                  "#020617",
          subText:               "#475569",
          border:                "#e2e8f0",
          inputBg:               "#ffffff",
          inputBorder:           "#cbd5e1",
          inputFocusedBorder:    "#3b82f6",
          inputText:             "#0f172a",
          inputPlaceholder:      "#94a3b8",
          labelText:             "#334155",
          iconBadgeBg:           "#e2e8f0",
          titleText:             "#0f172a",
          subtitleText:          "#475569",
          progressTrackBg:       "#cbd5e1",
          progressFillBg:        "#2563eb",
          progressLabelText:     "#64748b",
          orb1:                  "#3b82f6",
          orb2:                  "#60a5fa",
          orb3:                  "#1d4ed8",
          nextBtnBg:             "#2563eb",
          nextBtnText:           "#ffffff",
          chipBg:                "#ffffff",
          chipBorder:            "#cbd5e1",
          chipText:              "#334155",
          chipActiveBg:          "#2563eb",
          chipActiveBorder:      "#2563eb",
          chipActiveText:        "#ffffff",
          safeAreaBg:            "#f8fafc",
          sectionHeaderBg:       "#f1f5f9",
          sectionHeaderText:     "#64748b",
        }
      : {
          background:            "#040a14",
          card:                  "#0d1f38",
          text:                  "#f0f8ff",
          subText:               "#93c5fd",
          border:                "#1e3a5f",
          inputBg:               "#0d1f38",
          inputBorder:           "#1e3a5f",
          inputFocusedBorder:    "#3b82f6",
          inputText:             "#f0f8ff",
          inputPlaceholder:      "#4a7fa8",
          labelText:             "#93c5fd",
          iconBadgeBg:           "#0d1f38",
          titleText:             "#f0f8ff",
          subtitleText:          "#60a5fa",
          progressTrackBg:       "#1e3a5f",
          progressFillBg:        "#3b82f6",
          progressLabelText:     "#4a7fa8",
          orb1:                  "#3b82f6",
          orb2:                  "#60a5fa",
          orb3:                  "#1d4ed8",
          nextBtnBg:             "#2563eb",
          nextBtnText:           "#ffffff",
          chipBg:                "#0d1f38",
          chipBorder:            "#1e3a5f",
          chipText:              "#f0f8ff",
          chipActiveBg:          "#1e3a5f",
          chipActiveBorder:      "#3b82f6",
          chipActiveText:        "#f0f8ff",
          safeAreaBg:            "#040a14",
          sectionHeaderBg:       "#0d1f38",
          sectionHeaderText:     "#4a7fa8",
        };

  const [height,      setHeight]      = useState("");
  const [weight,      setWeight]      = useState("");
  const [bloodGroup,  setBloodGroup]  = useState("");
  const [allergies,   setAllergies]   = useState("");

  const [heightFocused,    setHeightFocused]    = useState(false);
  const [weightFocused,    setWeightFocused]    = useState(false);
  const [allergiesFocused, setAllergiesFocused] = useState(false);

  // ── Orb animations ────────────────────────────────────────────────────────
  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeLoop = (anim: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: -20, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0,   duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    makeLoop(orb1Y, 3400, 0).start();
    makeLoop(orb2Y, 4000, 700).start();
    makeLoop(orb3Y, 3000, 1400).start();
  }, []);

  // ── Scroll ref — used to scroll a field into view when focused ────────────
  const scrollRef = useRef<ScrollView>(null);

  // ── Field layout refs — store each field's Y position ────────────────────
  const heightY    = useRef(0);
  const weightY    = useRef(0);
  const bloodY     = useRef(0);
  const allergiesY = useRef(0);

  /** Scroll to a stored Y offset with comfortable padding above the field */
  const scrollToY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const goNext = async () => {
    const user = auth.currentUser;
    if (!user) { alert("User not logged in"); return; }
    if (!height || !weight || !bloodGroup) {
      alert("Please fill required medical details");
      return;
    }
    try {
      await updateDoc(doc(db, "users", user.uid), {
        medical:   { height, weight, bloodGroup, allergies },
        updatedAt: new Date().toISOString(),
      });
      router.push({
        pathname: "/onboarding/habits",
        params: { signupName, signupEmail, firstName, lastName, phone, dateOfBirth, gender, height, weight, bloodGroup, allergies },
      });
    } catch (error: any) {
      alert(error.message);
    }
  };

  const canContinue = !!height && !!weight && !!bloodGroup;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.safeAreaBg }]}>
      {/*
        ✅ FIX: KeyboardAvoidingView shrinks the available space when the keyboard
        appears. The ScrollView inside then becomes scrollable so every field
        is reachable without dismissing the keyboard.

        • iOS  → behavior="padding"  pushes the scroll view up by the keyboard height
        • Android → behavior="height" shrinks the container instead
        Both combined with keyboardShouldPersistTaps="handled" keep the keyboard
        visible while the user scrolls to the next field.
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        // On iOS give a little extra room above the keyboard
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"   // ✅ tap chips/button without dismissing keyboard
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { backgroundColor: colors.background },
          ]}
        >
          {/* ── Background Orbs (decorative, pointer-events: none) ──────── */}
          <Animated.View
            pointerEvents="none"
            style={[styles.orb, styles.orb1, { backgroundColor: colors.orb1, transform: [{ translateY: orb1Y }], opacity: theme === "light" ? 0.08 : 0.1 }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.orb, styles.orb2, { backgroundColor: colors.orb2, transform: [{ translateY: orb2Y }], opacity: theme === "light" ? 0.06 : 0.08 }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.orb, styles.orb3, { backgroundColor: colors.orb3, transform: [{ translateY: orb3Y }], opacity: theme === "light" ? 0.07 : 0.09 }]}
          />

          {/* ── Progress bar ──────────────────────────────────────────────── */}
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.progressTrackBg }]}>
              <View style={[styles.progressFill, { width: "50%", backgroundColor: colors.progressFillBg }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.progressLabelText }]}>Step 2 of 4</Text>
          </View>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={[styles.iconBadge, { backgroundColor: colors.iconBadgeBg }]}>
              <Text style={styles.iconEmoji}>🩺</Text>
            </View>
            <Text style={[styles.title, { color: colors.titleText }]}>Medical Info</Text>
            <Text style={[styles.subtitle, { color: colors.subtitleText }]}>
              Help us understand your body better for accurate health insights
            </Text>
          </View>

          {/* ── Height + Weight (side by side) ────────────────────────────── */}
          <View
            style={styles.rowFields}
            onLayout={(e) => {
              // Store Y of the entire row so we can scroll to it
              heightY.current = e.nativeEvent.layout.y;
              weightY.current = e.nativeEvent.layout.y;
            }}
          >
            {/* Height */}
            <View style={[styles.fieldWrapper, styles.flex]}>
              <Text style={[styles.fieldLabel, { color: colors.labelText }]}>Height (cm) *</Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: heightFocused ? colors.inputFocusedBorder : colors.inputBorder,
                  },
                ]}
              >
                <Text style={styles.inputIcon}>📏</Text>
                <TextInput
                  placeholder="175"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={height}
                  onChangeText={setHeight}
                  style={[styles.input, { color: colors.inputText }]}
                  keyboardType="numeric"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onFocus={() => {
                    setHeightFocused(true);
                    scrollToY(heightY.current);
                  }}
                  onBlur={() => setHeightFocused(false)}
                />
              </View>
            </View>

            {/* Weight */}
            <View style={[styles.fieldWrapper, styles.flex]}>
              <Text style={[styles.fieldLabel, { color: colors.labelText }]}>Weight (kg) *</Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: weightFocused ? colors.inputFocusedBorder : colors.inputBorder,
                  },
                ]}
              >
                <Text style={styles.inputIcon}>⚖️</Text>
                <TextInput
                  placeholder="70"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={weight}
                  onChangeText={setWeight}
                  style={[styles.input, { color: colors.inputText }]}
                  keyboardType="numeric"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onFocus={() => {
                    setWeightFocused(true);
                    scrollToY(weightY.current);
                  }}
                  onBlur={() => setWeightFocused(false)}
                />
              </View>
            </View>
          </View>

          {/* ── Blood Group grid ──────────────────────────────────────────── */}
          <View
            style={styles.fieldWrapper}
            onLayout={(e) => { bloodY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.fieldLabel, { color: colors.labelText }]}>Blood Group *</Text>

            {/* Tip — shown when nothing selected yet */}
            {!bloodGroup && (
              <Text style={[styles.bloodTip, { color: colors.subText }]}>
                Tap to select your blood group
              </Text>
            )}

            <View style={styles.bloodGroupGrid}>
              {BLOOD_GROUPS.map((bg) => {
                const active = bloodGroup === bg;
                return (
                  <TouchableOpacity
                    key={bg}
                    style={[
                      styles.bloodGroupChip,
                      {
                        backgroundColor: active ? colors.chipActiveBg  : colors.chipBg,
                        borderColor:     active ? colors.chipActiveBorder : colors.chipBorder,
                        // Give selected chip a subtle shadow so it "pops"
                        shadowColor: active ? colors.chipActiveBg : "transparent",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: active ? 0.35 : 0,
                        shadowRadius: 4,
                        elevation: active ? 4 : 0,
                      },
                    ]}
                    onPress={() => setBloodGroup(bg)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.bloodGroupText,
                        { color: active ? colors.chipActiveText : colors.chipText },
                      ]}
                    >
                      {bg}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── Allergies ─────────────────────────────────────────────────── */}
          <View
            style={styles.fieldWrapper}
            onLayout={(e) => { allergiesY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.fieldLabel, { color: colors.labelText }]}>
              Allergies{" "}
              <Text style={{ fontWeight: "400", opacity: 0.6 }}>(optional)</Text>
            </Text>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: allergiesFocused ? colors.inputFocusedBorder : colors.inputBorder,
                },
              ]}
            >
              <Text style={styles.inputIcon}>⚠️</Text>
              <TextInput
                placeholder="e.g. pollen, penicillin"
                placeholderTextColor={colors.inputPlaceholder}
                value={allergies}
                onChangeText={setAllergies}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="done"
                blurOnSubmit
                onFocus={() => {
                  setAllergiesFocused(true);
                  // ✅ Scroll extra far so the field + button are both visible
                  scrollToY(allergiesY.current);
                }}
                onBlur={() => setAllergiesFocused(false)}
              />
            </View>
            <Text style={[styles.allergiesHint, { color: colors.subText }]}>
              Separate multiple allergies with a comma
            </Text>
          </View>

          {/* ── Summary card (appears once all required fields are filled) ── */}
          {canContinue && (
            <View
              style={[
                styles.summaryCard,
                { backgroundColor: colors.card, borderColor: colors.inputFocusedBorder + "40" },
              ]}
            >
              <Text style={[styles.summaryTitle, { color: colors.labelText }]}>✅ Looking good!</Text>
              <Text style={[styles.summaryLine, { color: colors.subText }]}>
                {height} cm · {weight} kg · Blood {bloodGroup}
                {allergies ? `  ·  ${allergies}` : ""}
              </Text>
            </View>
          )}

          {/* ── Continue button ────────────────────────────────────────────── */}
          {/*
            Extra bottom padding inside the scroll view ensures the button is
            fully visible even when the keyboard is open (it will just scroll
            to the bottom naturally via the extra padding).
          */}
          <TouchableOpacity
            style={[
              styles.nextBtn,
              { backgroundColor: canContinue ? colors.nextBtnBg : colors.inputBorder },
            ]}
            onPress={goNext}
            disabled={!canContinue}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: canContinue ? colors.nextBtnText : colors.inputPlaceholder }]}>
              Continue →
            </Text>
          </TouchableOpacity>

          {/* Extra space at the bottom so the button clears the keyboard */}
          <View style={styles.keyboardSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:  { flex: 1 },
  flex:      { flex: 1 },

  /*
   * paddingBottom is large enough so that when the keyboard is open and
   * the user focuses the Allergies field, there is still room to scroll
   * the Continue button into view.
   */
  scroll: {
    paddingHorizontal: 26,
    paddingTop: 40,
    paddingBottom: 120,   // ✅ KEY: generous bottom padding = button always reachable
    flexGrow: 1,
  },

  // Orbs
  orb:  { position: "absolute", borderRadius: 999 },
  orb1: { width: 280, height: 280, top: -60,   left: -100 },
  orb2: { width: 200, height: 200, bottom: 60, right: -80 },
  orb3: { width: 140, height: 140, top: "45%", right: -40 },

  // Progress
  progressRow:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 30 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill:  { height: "100%" },
  progressLabel: { fontSize: 12 },

  // Header
  header:     { alignItems: "center", marginBottom: 30 },
  iconBadge:  { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  iconEmoji:  { fontSize: 26 },
  title:      { fontSize: 28, fontWeight: "800", marginBottom: 6 },
  subtitle:   { fontSize: 13, textAlign: "center", lineHeight: 20 },

  // Fields
  rowFields:    { flexDirection: "row", gap: 12, marginBottom: 0 },
  fieldWrapper: { marginBottom: 20 },
  fieldLabel:   { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginBottom: 8, textTransform: "uppercase" },

  // Input
  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, height: 52 },
  inputIcon:    { marginRight: 8, fontSize: 16 },
  input:        { flex: 1, fontSize: 15 },

  // Blood group
  bloodTip:       { fontSize: 12, marginBottom: 10, opacity: 0.6 },
  bloodGroupGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  bloodGroupChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, minWidth: 60, alignItems: "center" },
  bloodGroupText: { fontWeight: "700", fontSize: 14 },

  // Allergies hint
  allergiesHint: { fontSize: 11, marginTop: 5, opacity: 0.7 },

  // Summary card
  summaryCard:  { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 20 },
  summaryTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  summaryLine:  { fontSize: 12, lineHeight: 18 },

  // Button
  nextBtn:      { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  nextBtnText:  { fontSize: 16, fontWeight: "700" },

  // ✅ Extra space so the button is visible above the keyboard
  keyboardSpacer: { height: 40 },
});