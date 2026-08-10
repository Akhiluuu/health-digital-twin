import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../context/ThemeContext";
import { colors as globalColors } from "../../theme/colors";
import { Ionicons } from "@expo/vector-icons";

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"];

const HEIGHT_PRESETS = [150, 155, 160, 163, 165, 168, 170, 173, 175, 178, 180, 183, 185, 188, 190];
const WEIGHT_PRESETS = [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 150];

function BloodGroupModal({ visible, selected, onSelect, onClose, colors, accent }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={{ backgroundColor: colors.card, borderRadius: 20, width: 300, overflow: "hidden" }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "center" }}>Blood Group</Text>
          </View>
          {BLOOD_GROUPS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: 20, paddingVertical: 14,
                borderBottomWidth: 0.5, borderBottomColor: colors.border,
                backgroundColor: selected === opt ? accent + "20" : "transparent",
              }}
              onPress={() => { onSelect(opt); onClose(); }}
            >
              <Text style={{ color: selected === opt ? accent : colors.text, fontSize: 16, fontWeight: selected === opt ? "800" : "400" }}>
                {opt}
              </Text>
              {selected === opt && <Ionicons name="checkmark" size={20} color={accent} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function ValueInput({ label, unit, icon, value, onChange, presets, min, max, placeholder, colors, accent, step = 1 }: {
  label: string; unit: string; icon: string; value: string; onChange: (v: string) => void;
  presets: number[]; min: number; max: number; placeholder: string; colors: any; accent: string; step?: number;
}) {
  const raw = parseFloat(value);
  const valid = !isNaN(raw) && raw >= min && raw <= max;
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={[vi.label, { color: colors.labelText }]}>{label}</Text>
      <View style={[vi.inputRow, { backgroundColor: colors.inputBg, borderColor: valid ? accent + "80" : colors.inputBorder }]}>
        <Text style={vi.icon}>{icon}</Text>
        <TextInput
          style={[vi.input, { color: colors.inputText }]}
          value={value}
          onChangeText={txt => {
            const cleaned = txt.replace(/[^0-9.]/g, '').replace(/(\..*)\./, '$1');
            onChange(cleaned);
          }}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          maxLength={6}
        />
        <Text style={[vi.unit, { color: accent }]}>{unit}</Text>
        {valid && <Ionicons name="checkmark-circle" size={18} color={accent} />}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={vi.chipsRow}>
        {presets.map(p => {
          const active = String(p) === value;
          return (
            <TouchableOpacity
              key={p}
              style={[vi.chip, { backgroundColor: active ? accent : colors.inputBg, borderColor: active ? accent : colors.inputBorder }]}
              onPress={() => onChange(String(p))}
            >
              <Text style={[vi.chipTxt, { color: active ? "#fff" : colors.subText }]}>{p}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {value !== "" && !valid && (
        <Text style={{ color: "#ef4444", fontSize: 11, marginTop: 4 }}>Enter a value between {min}–{max} {unit}</Text>
      )}
    </View>
  );
}

const vi = StyleSheet.create({
  label:    { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 8, marginBottom: 8 },
  icon:     { fontSize: 18 },
  input:    { flex: 1, fontSize: 20, fontWeight: "700" },
  unit:     { fontSize: 13, fontWeight: "700", opacity: 0.8 },
  chipsRow: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  chip:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  chipTxt:  { fontSize: 13, fontWeight: "600" },
});

export default function Medical() {
  const router = useRouter();
  const { theme } = useTheme();
  const params = useLocalSearchParams<{
    signupName?: string; signupEmail?: string; firstName?: string; lastName?: string; phone?: string; dateOfBirth?: string; gender?: string;
    height?: string; weight?: string; bloodGroup?: string; allergies?: string;
    restingHR?: string; systolicBP?: string; diastolicBP?: string; bodyFatPct?: string;
  }>();

  const activeTheme = theme === "light" ? "light" : "dark";
  const c = globalColors[activeTheme] || globalColors.dark;
  const colors = {
    background: c.bg, card: c.card, text: c.text, subText: c.sub, border: c.border,
    inputBg: c.inputBg, inputBorder: c.border, inputFocusedBorder: c.focusBorder,
    inputText: c.text, inputPlaceholder: c.placeholder, labelText: c.text,
    iconBadgeBg: c.border, titleText: c.text, subtitleText: c.sub,
    progressTrackBg: c.border, progressFillBg: c.primary, progressLabelText: c.sub,
    orb1: c.primary, orb2: c.primaryLight, orb3: c.primaryDark,
    nextBtnBg: c.accent, nextBtnText: "#ffffff", safeAreaBg: c.bg,
  };
  const accent = c.accent;

  const [height,      setHeight]      = useState(params.height || "");
  const [weight,      setWeight]      = useState(params.weight || "");
  const [bloodGroup,  setBloodGroup]  = useState(params.bloodGroup || "");
  const [allergies,   setAllergies]   = useState(params.allergies || "");
  // Clinical vitals for BioGears
  const [restingHR,   setRestingHR]   = useState(params.restingHR || "72");
  const [systolicBP,  setSystolicBP]  = useState(params.systolicBP || "120");
  const [diastolicBP, setDiastolicBP] = useState(params.diastolicBP || "80");
  const [bodyFatPct,  setBodyFatPct]  = useState(params.bodyFatPct || "20");

  const [showBloodPicker, setShowBloodPicker] = useState(false);
  const [allergiesFocused, setAllergiesFocused] = useState(false);

  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeLoop = (anim: Animated.Value, dur: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: -20, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0,   duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
    makeLoop(orb1Y, 3400, 0).start();
    makeLoop(orb2Y, 4000, 700).start();
    makeLoop(orb3Y, 3000, 1400).start();
  }, []);

  const scrollRef  = useRef<ScrollView>(null);
  const allergiesY = useRef(0);

  const goNext = async () => {
    const h  = parseFloat(height);
    const w  = parseFloat(weight);
    const hr = parseFloat(restingHR);
    const sp = parseFloat(systolicBP);
    const dp = parseFloat(diastolicBP);
    const bf = parseFloat(bodyFatPct);

    if (!height || !weight || !bloodGroup) { Alert.alert("Required Fields", "Please fill required fields (height, weight, blood group)"); return; }
    if (isNaN(h) || h < 50  || h > 300)   { Alert.alert("Invalid Input", "Enter a valid height (50–300 cm)"); return; }
    if (isNaN(w) || w < 5   || w > 500)   { Alert.alert("Invalid Input", "Enter a valid weight (5–500 kg)"); return; }
    if (isNaN(hr) || hr < 20 || hr > 300) { Alert.alert("Invalid Input", "Enter a valid resting heart rate (20–300 bpm)"); return; }
    if (isNaN(sp) || sp < 60 || sp > 300) { Alert.alert("Invalid Input", "Enter a valid systolic blood pressure (60–300 mmHg)"); return; }
    if (isNaN(dp) || dp < 30 || dp > 200) { Alert.alert("Invalid Input", "Enter a valid diastolic blood pressure (30–200 mmHg)"); return; }
    if (dp >= sp)                          { Alert.alert("Invalid Input", "Diastolic BP must be lower than Systolic BP"); return; }
    if (isNaN(bf) || bf < 1  || bf > 80)  { Alert.alert("Invalid Input", "Enter a valid body fat percentage (1–80%)"); return; }

    const targetParams = {
      signupName: params.signupName, signupEmail: params.signupEmail, firstName: params.firstName,
      lastName: params.lastName, phone: params.phone, dateOfBirth: params.dateOfBirth, gender: params.gender,
      primaryGoal: (params as any).primaryGoal || "wellness",
      height: String(Math.round(h)), weight: String(Math.round(w)), bloodGroup, allergies,
      restingHR: String(hr), systolicBP: String(sp), diastolicBP: String(dp), bodyFatPct: String(bf),
    };

    try {
      const user = auth.currentUser;
      const uid = user ? user.uid : "guest";

      const medicalData = {
        medical: {
          height: String(Math.round(h)), weight: String(Math.round(w)), bloodGroup, allergies,
          restingHR: hr, systolicBP: sp, diastolicBP: dp, bodyFatPct: bf,
        },
        biogears_resting_hr:   hr,
        biogears_systolic_bp:  sp,
        biogears_diastolic_bp: dp,
        biogears_body_fat:     bf / 100.0,
        updatedAt: new Date().toISOString(),
      };

      try {
        await AsyncStorage.setItem(`@onboarding_medical_${uid}`, JSON.stringify(medicalData));
      } catch (e) {}

      if (user) {
        try {
          await setDoc(doc(db, "users", user.uid), medicalData, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore medical save warning:", fsErr);
        }
      }

      router.push({
        pathname: "/onboarding/habits",
        params: targetParams,
      });
    } catch (error: any) {
      console.error("[Medical] goNext error:", error);
      router.push({
        pathname: "/onboarding/habits",
        params: targetParams,
      });
    }
  };

  const canContinue = !!height && !!weight && !!bloodGroup && !!restingHR && !!systolicBP && !!diastolicBP && !!bodyFatPct;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.safeAreaBg }]}>
      <BloodGroupModal
        visible={showBloodPicker}
        selected={bloodGroup}
        onSelect={setBloodGroup}
        onClose={() => setShowBloodPicker(false)}
        colors={colors}
        accent={accent}
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]}
        >
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb1, { backgroundColor: colors.orb1, transform: [{ translateY: orb1Y }], opacity: theme === "light" ? 0.08 : 0.1 }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb2, { backgroundColor: colors.orb2, transform: [{ translateY: orb2Y }], opacity: theme === "light" ? 0.06 : 0.08 }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb3, { backgroundColor: colors.orb3, transform: [{ translateY: orb3Y }], opacity: theme === "light" ? 0.07 : 0.09 }]} />

          {/* Twin Calibration Progress Header */}
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.progressTrackBg }]}>
              <View style={[styles.progressFill, { width: "50%", backgroundColor: accent }]} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: accent }}>⚡ TWIN CALIBRATION 50%</Text>
            </View>
          </View>

          {/* AI Guide Conversational Box */}
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 16,
            padding: 14,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: accent + "40",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            shadowColor: accent,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 2,
          }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accent + "20", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>🩺</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: accent, letterSpacing: 0.5, textTransform: "uppercase" }}>BioGears Physiological Calibration</Text>
              <Text style={{ fontSize: 13, color: colors.titleText, fontWeight: "600", marginTop: 2, lineHeight: 18 }}>
                As you adjust your measurements, watch your Digital Twin calculate your live BMI, BMR, and cardiac baselines below!
              </Text>
            </View>
          </View>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.titleText }]}>Vitals & Biometrics Calibration</Text>
            <Text style={[styles.subtitle, { color: colors.subtitleText }]}>
              Your body measurements and vitals calibrate your BioGears digital twin engine
            </Text>
          </View>

          {/* Body Measurements */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.inputBorder }]}>
            <Text style={[styles.sectionTitle, { color: colors.subText }]}>📏  Body Measurements</Text>

            <ValueInput label="Height *" unit="cm" icon="📏" value={height} onChange={setHeight}
              presets={HEIGHT_PRESETS} min={50} max={300} placeholder="e.g. 175" colors={colors} accent={accent} />

            <ValueInput label="Weight *" unit="kg" icon="⚖️" value={weight} onChange={setWeight}
              presets={WEIGHT_PRESETS} min={5} max={500} placeholder="e.g. 70" colors={colors} accent={accent} />

            <ValueInput label="Body Fat % *" unit="%" icon="🫀" value={bodyFatPct} onChange={setBodyFatPct}
              presets={[8,12,15,18,20,22,25,28,30,35,40,45,50]} min={1} max={80} placeholder="e.g. 20" colors={colors} accent={accent} />

            {/* Blood Group */}
            <View style={{ marginBottom: 20 }}>
              <Text style={[vi.label, { color: colors.labelText }]}>Blood Group *</Text>
              <TouchableOpacity
                style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: showBloodPicker ? colors.inputFocusedBorder : colors.inputBorder }]}
                onPress={() => setShowBloodPicker(true)}
              >
                <Text style={styles.inputIcon}>🩸</Text>
                <Text style={[styles.input, { color: bloodGroup ? colors.inputText : colors.inputPlaceholder }]}>
                  {bloodGroup || "Select Blood Group"}
                </Text>
                <Ionicons name="chevron-down" size={18} color={colors.subText} />
              </TouchableOpacity>
            </View>

            {/* Allergies */}
            <View style={{ marginBottom: 4 }} onLayout={(e) => { allergiesY.current = e.nativeEvent.layout.y; }}>
              <Text style={[vi.label, { color: colors.labelText }]}>
                Allergies <Text style={{ fontWeight: "400", textTransform: "none", opacity: 0.6, letterSpacing: 0 }}>(optional)</Text>
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: allergiesFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
                <Text style={styles.inputIcon}>⚠️</Text>
                <TextInput
                  placeholder="e.g. pollen, penicillin"
                  placeholderTextColor={colors.inputPlaceholder}
                  value={allergies}
                  onChangeText={setAllergies}
                  style={[styles.input, { color: colors.inputText }]}
                  returnKeyType="done"
                  blurOnSubmit
                  onFocus={() => { setAllergiesFocused(true); scrollRef.current?.scrollTo({ y: allergiesY.current - 24, animated: true }); }}
                  onBlur={() => setAllergiesFocused(false)}
                />
              </View>
              <Text style={[styles.allergiesHint, { color: colors.subText }]}>Separate multiple with a comma</Text>
            </View>
          </View>

          {/* Cardiovascular Vitals */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.inputBorder, marginTop: 8 }]}>
            <Text style={[styles.sectionTitle, { color: colors.subText }]}>❤️  Baseline Vitals  <Text style={{ fontWeight: "400", fontSize: 11 }}>(for digital twin calibration)</Text></Text>

            <ValueInput label="Resting Heart Rate *" unit="bpm" icon="💓" value={restingHR} onChange={setRestingHR}
              presets={[45,50,55,60,65,70,72,75,80,85,90,95,100,110,120]} min={20} max={300} placeholder="e.g. 72" colors={colors} accent={accent} />

            <ValueInput label="Systolic BP *" unit="mmHg" icon="🩺" value={systolicBP} onChange={setSystolicBP}
              presets={[90,100,110,114,120,125,130,140,150,160,170,180,200]} min={60} max={300} placeholder="e.g. 120" colors={colors} accent={accent} />

            <ValueInput label="Diastolic BP *" unit="mmHg" icon="🩺" value={diastolicBP} onChange={setDiastolicBP}
              presets={[55,60,65,70,73,75,80,85,90,95,100,110]} min={30} max={200} placeholder="e.g. 80" colors={colors} accent={accent} />

            <View style={{ backgroundColor: accent + "12", borderRadius: 10, padding: 12, marginTop: 4 }}>
              <Text style={{ color: accent, fontSize: 11, lineHeight: 17 }}>
                💡 These values are used to build your personalised physiological baseline. They are clamped automatically for engine stability — your real values are always stored.
              </Text>
            </View>
          </View>

          {canContinue && (() => {
            const hM = parseFloat(height) / 100.0;
            const wK = parseFloat(weight);
            const calcBmi = (wK / (hM * hM)).toFixed(1);
            const calcBsa = (0.007184 * Math.pow(parseFloat(height), 0.725) * Math.pow(wK, 0.425)).toFixed(2);
            const calcBmr = Math.round(10 * wK + 6.25 * parseFloat(height) - 5 * 30 + 5);
            const sbp = parseFloat(systolicBP);
            const dbp = parseFloat(diastolicBP);
            const bpStatus = sbp < 120 && dbp < 80 ? "Optimal" : sbp < 130 ? "Elevated" : "Hypertension Risk";

            return (
              <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: accent + "60", borderWidth: 1.5 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 16 }}>🧬</Text>
                    <Text style={[styles.summaryTitle, { color: colors.labelText, marginBottom: 0 }]}>
                      Live Digital Twin Baseline
                    </Text>
                  </View>
                  <View style={{ backgroundColor: accent + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ color: accent, fontSize: 10, fontWeight: "700" }}>AUTO CALIBRATED</Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.inputBg, padding: 12, borderRadius: 12, marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.subText, fontWeight: "700", textTransform: "uppercase" }}>Calculated BMI</Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 2 }}>{calcBmi}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.subText, fontWeight: "700", textTransform: "uppercase" }}>Est. BMR Burn</Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 2 }}>{calcBmr} <Text style={{ fontSize: 10 }}>kcal/d</Text></Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 10, color: colors.subText, fontWeight: "700", textTransform: "uppercase" }}>Heart Status</Text>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: bpStatus === "Optimal" ? "#22c55e" : "#f59e0b", marginTop: 4 }}>{bpStatus}</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 11, color: colors.subText, lineHeight: 16 }}>
                  BSA: {calcBsa} m² · Body Fat: {bodyFatPct}% · Blood: {bloodGroup} · Resting HR: {restingHR} bpm
                </Text>
              </View>
            );
          })()}

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: canContinue ? colors.nextBtnBg : colors.inputBorder }]}
            onPress={goNext}
            disabled={!canContinue}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextBtnText, { color: canContinue ? colors.nextBtnText : colors.inputPlaceholder }]}>
              Continue →
            </Text>
          </TouchableOpacity>

          <View style={styles.keyboardSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex:     { flex: 1 },
  scroll: { paddingHorizontal: 26, paddingTop: 40, paddingBottom: 120, flexGrow: 1 },
  orb:  { position: "absolute", borderRadius: 999 },
  orb1: { width: 280, height: 280, top: -60,   left: -100 },
  orb2: { width: 200, height: 200, bottom: 60, right: -80 },
  orb3: { width: 140, height: 140, top: "45%", right: -40 },
  progressRow:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 30 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill:  { height: "100%" },
  progressLabel: { fontSize: 12 },
  header:    { alignItems: "center", marginBottom: 24 },
  iconBadge: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  iconEmoji: { fontSize: 26 },
  title:     { fontSize: 28, fontWeight: "800", marginBottom: 6 },
  subtitle:  { fontSize: 13, textAlign: "center", lineHeight: 20 },
  sectionCard:  { borderWidth: 1.5, borderRadius: 18, padding: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 16 },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, height: 52 },
  inputIcon:    { marginRight: 8, fontSize: 16 },
  input:        { flex: 1, fontSize: 15 },
  allergiesHint: { fontSize: 11, marginTop: 5, opacity: 0.7 },
  summaryCard:   { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 20, marginTop: 8 },
  summaryTitle:  { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  summaryLine:   { fontSize: 12, lineHeight: 18 },
  nextBtn:     { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 4 },
  nextBtnText: { fontSize: 16, fontWeight: "700" },
  keyboardSpacer: { height: 40 },
});