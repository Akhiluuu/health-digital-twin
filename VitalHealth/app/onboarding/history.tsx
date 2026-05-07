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

const COMMON_CONDITIONS = [
  "Diabetes", "Hypertension", "Asthma", "Heart Disease",
  "Thyroid", "Arthritis", "Migraine", "PCOD",
];

const COMMON_FAMILY = [
  "Heart Disease", "Diabetes", "Cancer", "Stroke",
  "Hypertension", "Mental Health", "Kidney Disease",
];

const COMMON_MEDICATIONS = [
  "Aspirin", "Metformin", "Amlodipine", "Atorvastatin",
  "Levothyroxine", "Paracetamol", "Ibuprofen", "Losartan",
];

export default function History() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();

  const colors =
    theme === "light"
      ? {
          background:          "#f8fafc",
          card:                "#ffffff",
          text:                "#020617",
          subText:             "#475569",
          border:              "#e2e8f0",
          inputBg:             "#ffffff",
          inputBorder:         "#cbd5e1",
          inputFocusedBorder:  "#3b82f6",
          inputText:           "#0f172a",
          inputPlaceholder:    "#94a3b8",
          labelText:           "#334155",
          iconBadgeBg:         "#e2e8f0",
          titleText:           "#0f172a",
          subtitleText:        "#475569",
          progressTrackBg:     "#cbd5e1",
          progressFillBg:      "#2563eb",
          progressText:        "#64748b",
          orb1:                "#3b82f6",
          orb2:                "#60a5fa",
          orb3:                "#1d4ed8",
          nextBtnBg:           "#2563eb",
          nextBtnText:         "#ffffff",
          chipBg:              "#ffffff",
          chipBorder:          "#cbd5e1",
          chipText:            "#334155",
          chipActiveBg:        "#2563eb",
          chipActiveBorder:    "#2563eb",
          chipActiveText:      "#ffffff",
          sectionCardBg:       "#ffffff",
          sectionCardBorder:   "#e2e8f0",
          sectionTitle:        "#334155",
          backButtonBg:        "#ffffff",
          backButtonBorder:    "#cbd5e1",
          backButtonText:      "#334155",
          safeAreaBg:          "#f8fafc",
        }
      : {
          background:          "#040a14",
          card:                "#0d1f38",
          text:                "#f0f8ff",
          subText:             "#93c5fd",
          border:              "#1e3a5f",
          inputBg:             "#0d1f38",
          inputBorder:         "#1e3a5f",
          inputFocusedBorder:  "#3b82f6",
          inputText:           "#f0f8ff",
          inputPlaceholder:    "#4a7fa8",
          labelText:           "#93c5fd",
          iconBadgeBg:         "#0d1f38",
          titleText:           "#f0f8ff",
          subtitleText:        "#60a5fa",
          progressTrackBg:     "#1e3a5f",
          progressFillBg:      "#3b82f6",
          progressText:        "#4a7fa8",
          orb1:                "#3b82f6",
          orb2:                "#60a5fa",
          orb3:                "#1d4ed8",
          nextBtnBg:           "#2563eb",
          nextBtnText:         "#ffffff",
          chipBg:              "#0d1f38",
          chipBorder:          "#1e3a5f",
          chipText:            "#4a7fa8",
          chipActiveBg:        "#1e3a5f",
          chipActiveBorder:    "#3b82f6",
          chipActiveText:      "#f0f8ff",
          sectionCardBg:       "#070f1c",
          sectionCardBorder:   "#1e3a5f",
          sectionTitle:        "#93c5fd",
          backButtonBg:        "#0d1f38",
          backButtonBorder:    "#1e3a5f",
          backButtonText:      "#93c5fd",
          safeAreaBg:          "#040a14",
        };

  // ── Form state ─────────────────────────────────────────────────────────────
  const [diseases,            setDiseases]            = useState("");
  const [surgeries,           setSurgeries]           = useState("");
  const [familyHistory,       setFamilyHistory]       = useState("");
  const [currentMedications,  setCurrentMedications]  = useState("");
  const [selectedConditions,  setSelectedConditions]  = useState<string[]>([]);
  const [selectedFamily,      setSelectedFamily]       = useState<string[]>([]);
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);

  // ── Focus states ───────────────────────────────────────────────────────────
  const [diseasesFocused,     setDiseasesFocused]     = useState(false);
  const [surgeriesFocused,    setSurgeriesFocused]    = useState(false);
  const [familyHistoryFocused,setFamilyHistoryFocused]= useState(false);
  const [medicationsFocused,  setMedicationsFocused]  = useState(false);

  // ── Scroll ref + per-section Y offsets ────────────────────────────────────
  const scrollRef     = useRef<ScrollView>(null);
  const conditionsY   = useRef(0);
  const medicationsY  = useRef(0);
  const surgeriesY    = useRef(0);
  const familyY       = useRef(0);

  /**
   * Scrolls so that the focused section is clearly visible above the keyboard.
   * 80 px of padding above the tapped field feels comfortable on all screen sizes.
   */
  const scrollToY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  };

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
          Animated.timing(anim, { toValue:   0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
    makeLoop(orb1Y, 3600,    0).start();
    makeLoop(orb2Y, 4200,  800).start();
    makeLoop(orb3Y, 3100, 1500).start();
  }, []);

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  const toggleCondition  = (item: string) => setSelectedConditions(prev  => prev.includes(item)  ? prev.filter(c => c !== item)  : [...prev, item]);
  const toggleFamily     = (item: string) => setSelectedFamily(prev     => prev.includes(item)  ? prev.filter(c => c !== item)  : [...prev, item]);
  const toggleMedication = (item: string) => setSelectedMedications(prev => prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const goToReview = async () => {
    const user = auth.currentUser;
    if (!user) { alert("User not logged in"); return; }

    try {
      const allMedications = [...selectedMedications, currentMedications]
        .filter(Boolean)
        .join(", ");

      await updateDoc(doc(db, "users", user.uid), {
        history: {
          diseases, surgeries, familyHistory,
          selectedConditions, selectedFamily,
          medications: allMedications,
        },
        updatedAt: new Date().toISOString(),
      });

      router.push({
        pathname: "/onboarding/review",
        params: {
          ...params,
          diseases, surgeries, familyHistory,
          selectedConditions:  JSON.stringify(selectedConditions),
          selectedFamily:      JSON.stringify(selectedFamily),
          currentMedications:  allMedications,
        },
      });
    } catch (error: any) {
      alert(error.message);
    }
  };

  // ── Chip component (DRY) ──────────────────────────────────────────────────
  const Chip = ({
    label, active, onPress,
  }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.chipActiveBg   : colors.chipBg,
          borderColor:     active ? colors.chipActiveBorder : colors.chipBorder,
          borderWidth: active ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, { color: active ? colors.chipActiveText : colors.chipText }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.safeAreaBg }]}>
      {/*
        ✅ FIX: KeyboardAvoidingView shrinks the container when the keyboard
        opens. The ScrollView inside becomes scrollable automatically.
        keyboardShouldPersistTaps="handled" keeps the keyboard open while the
        user taps chips or scrolls to the next field.

        • iOS      → behavior="padding"  lifts the scroll view above the keyboard
        • Android  → behavior="height"   shrinks the scroll view height
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"   // ✅ tapping chips won't dismiss keyboard
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]}
        >
          {/* ── Decorative orbs ─────────────────────────────────────────── */}
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb1, { backgroundColor: colors.orb1, transform: [{ translateY: orb1Y }], opacity: theme === "light" ? 0.08 : 0.1 }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb2, { backgroundColor: colors.orb2, transform: [{ translateY: orb2Y }], opacity: theme === "light" ? 0.06 : 0.07 }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb3, { backgroundColor: colors.orb3, transform: [{ translateY: orb3Y }], opacity: theme === "light" ? 0.07 : 0.09 }]} />

          {/* ── Back button ─────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.backButtonBg, borderColor: colors.backButtonBorder }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={[styles.backText, { color: colors.backButtonText }]}>Back</Text>
          </TouchableOpacity>

          {/* ── Progress ────────────────────────────────────────────────── */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeaderRow}>
              <Text style={[styles.stepText,  { color: colors.progressText }]}>Step 4 of 4</Text>
              <Text style={[styles.stepLabel, { color: colors.progressText }]}>History</Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.progressTrackBg }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.progressFillBg }]} />
            </View>
          </View>

          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={[styles.iconBadge, { backgroundColor: colors.iconBadgeBg }]}>
              <Text style={styles.iconEmoji}>📋</Text>
            </View>
            <Text style={[styles.title,    { color: colors.titleText }]}>Medical History</Text>
            <Text style={[styles.subtitle, { color: colors.subtitleText }]}>This helps us give better health guidance</Text>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 1 — Chronic Conditions
              onLayout stores the Y position so onFocus can scroll to it.
          ══════════════════════════════════════════════════════════════ */}
          <View
            style={[styles.sectionCard, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}
            onLayout={(e) => { conditionsY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>🩺</Text>
              <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Chronic Conditions</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.inputPlaceholder }]}>
              Tap all that apply — or type below
            </Text>

            <View style={styles.chipGrid}>
              {COMMON_CONDITIONS.map(item => (
                <Chip key={item} label={item} active={selectedConditions.includes(item)} onPress={() => toggleCondition(item)} />
              ))}
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: diseasesFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
              <TextInput
                placeholder="Other conditions…"
                placeholderTextColor={colors.inputPlaceholder}
                value={diseases}
                onChangeText={setDiseases}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={() => {
                  setDiseasesFocused(true);
                  scrollToY(conditionsY.current);
                }}
                onBlur={() => setDiseasesFocused(false)}
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2 — Current Medications
          ══════════════════════════════════════════════════════════════ */}
          <View
            style={[styles.sectionCard, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}
            onLayout={(e) => { medicationsY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>💊</Text>
              <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Current Medications</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.inputPlaceholder }]}>
              Tap to select common ones — or type others below
            </Text>

            <View style={styles.chipGrid}>
              {COMMON_MEDICATIONS.map(item => (
                <Chip key={item} label={item} active={selectedMedications.includes(item)} onPress={() => toggleMedication(item)} />
              ))}
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: medicationsFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
              <TextInput
                placeholder="Other medications…"
                placeholderTextColor={colors.inputPlaceholder}
                value={currentMedications}
                onChangeText={setCurrentMedications}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={() => {
                  setMedicationsFocused(true);
                  // ✅ Scroll to this section so the field is above keyboard
                  scrollToY(medicationsY.current);
                }}
                onBlur={() => setMedicationsFocused(false)}
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3 — Past Surgeries
          ══════════════════════════════════════════════════════════════ */}
          <View
            style={[styles.sectionCard, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}
            onLayout={(e) => { surgeriesY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>🏥</Text>
              <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Past Surgeries</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.inputPlaceholder }]}>
              List any surgeries with approximate year
            </Text>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: surgeriesFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
              <TextInput
                placeholder="e.g. Appendectomy 2018…"
                placeholderTextColor={colors.inputPlaceholder}
                value={surgeries}
                onChangeText={setSurgeries}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="next"
                blurOnSubmit={false}
                onFocus={() => {
                  setSurgeriesFocused(true);
                  scrollToY(surgeriesY.current);
                }}
                onBlur={() => setSurgeriesFocused(false)}
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4 — Family Medical History
          ══════════════════════════════════════════════════════════════ */}
          <View
            style={[styles.sectionCard, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}
            onLayout={(e) => { familyY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>👨‍👩‍👧</Text>
              <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Family Medical History</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.inputPlaceholder }]}>
              Select conditions that run in your family
            </Text>

            <View style={styles.chipGrid}>
              {COMMON_FAMILY.map(item => (
                <Chip key={item} label={item} active={selectedFamily.includes(item)} onPress={() => toggleFamily(item)} />
              ))}
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: familyHistoryFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
              <TextInput
                placeholder="Other family conditions…"
                placeholderTextColor={colors.inputPlaceholder}
                value={familyHistory}
                onChangeText={setFamilyHistory}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="done"
                blurOnSubmit
                onFocus={() => {
                  setFamilyHistoryFocused(true);
                  // ✅ Scroll to bottom section — ensures button is also visible after typing
                  scrollToY(familyY.current);
                }}
                onBlur={() => setFamilyHistoryFocused(false)}
              />
            </View>
          </View>

          {/* ── Continue button ──────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.nextBtnBg }]}
            onPress={goToReview}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: colors.nextBtnText }]}>
              Review Profile →
            </Text>
          </TouchableOpacity>

          {/*
            ✅ KEY: Large bottom spacer.
            When the family-history field is focused and the keyboard is open,
            this space lets the user scroll the "Review Profile" button fully
            above the keyboard without dismissing it.
          */}
          <View style={styles.keyboardSpacer} />

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex:     { flex: 1 },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 40,
    // ✅ Large bottom padding so the Continue button is always scrollable
    // above the keyboard without needing to dismiss it.
    paddingBottom: 40,
    flexGrow: 1,
  },

  // ── Orbs ──────────────────────────────────────────────────────────────────
  orb:  { position: "absolute", borderRadius: 999 },
  orb1: { width: 260, height: 260, top: -50,    right: -90 },
  orb2: { width: 200, height: 200, bottom: 100, left: -80  },
  orb3: { width: 130, height: 130, top: "50%",  right: -30 },

  // ── Back button ───────────────────────────────────────────────────────────
  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, marginBottom: 18 },
  backText:   { fontSize: 14, fontWeight: "600" },

  // ── Progress ──────────────────────────────────────────────────────────────
  progressContainer: { marginBottom: 20 },
  progressHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  stepText:          { fontSize: 13, fontWeight: "600" },
  stepLabel:         { fontSize: 13, fontWeight: "600" },
  progressBar:       { height: 6, borderRadius: 6, overflow: "hidden" },
  progressFill:      { width: "100%", height: "100%" },

  // ── Header ────────────────────────────────────────────────────────────────
  header:    { alignItems: "center", marginBottom: 20 },
  iconBadge: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  iconEmoji: { fontSize: 26 },
  title:     { fontSize: 28, fontWeight: "800", marginBottom: 4 },
  subtitle:  { fontSize: 13, textAlign: "center" },

  // ── Section cards ─────────────────────────────────────────────────────────
  sectionCard:     { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionEmoji:    { fontSize: 16 },
  sectionTitle:    { fontSize: 14, fontWeight: "700" },
  sectionHint:     { fontSize: 11, marginBottom: 10, lineHeight: 16 },

  // ── Chips ─────────────────────────────────────────────────────────────────
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  chipText: { fontSize: 13, fontWeight: "500" },

  // ── Text inputs ───────────────────────────────────────────────────────────
  inputWrapper: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, height: 48, justifyContent: "center", marginTop: 4 },
  input:        { fontSize: 14 },

  // ── Continue button ───────────────────────────────────────────────────────
  nextBtn:     { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  nextBtnText: { fontSize: 16, fontWeight: "700" },

  // ✅ Space below the button so it can scroll above the keyboard
  keyboardSpacer: { height: 120 },
});