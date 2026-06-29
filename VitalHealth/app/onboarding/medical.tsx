import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
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
  const { signupName, signupEmail, firstName, lastName, phone, dateOfBirth, gender } =
    useLocalSearchParams<{ signupName: string; signupEmail: string; firstName: string; lastName: string; phone: string; dateOfBirth: string; gender: string }>();

  const c = globalColors[theme];
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

  const [height,      setHeight]      = useState("");
  const [weight,      setWeight]      = useState("");
  const [bloodGroup,  setBloodGroup]  = useState("");
  const [allergies,   setAllergies]   = useState("");
  // Clinical vitals for BioGears
  const [restingHR,   setRestingHR]   = useState("72");
  const [systolicBP,  setSystolicBP]  = useState("120");
  const [diastolicBP, setDiastolicBP] = useState("80");
  const [bodyFatPct,  setBodyFatPct]  = useState("20");

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
    const user = auth.currentUser;
    if (!user) { alert("User not logged in"); return; }

    const h  = parseFloat(height);
    const w  = parseFloat(weight);
    const hr = parseFloat(restingHR);
    const sp = parseFloat(systolicBP);
    const dp = parseFloat(diastolicBP);
    const bf = parseFloat(bodyFatPct);

    if (!height || !weight || !bloodGroup) { alert("Please fill required fields (height, weight, blood group)"); return; }
    if (isNaN(h) || h < 50  || h > 300)   { alert("Enter a valid height (50–300 cm)"); return; }
    if (isNaN(w) || w < 5   || w > 500)   { alert("Enter a valid weight (5–500 kg)"); return; }
    if (isNaN(hr) || hr < 20 || hr > 300) { alert("Enter a valid resting heart rate (20–300 bpm)"); return; }
    if (isNaN(sp) || sp < 60 || sp > 300) { alert("Enter a valid systolic blood pressure (60–300 mmHg)"); return; }
    if (isNaN(dp) || dp < 30 || dp > 200) { alert("Enter a valid diastolic blood pressure (30–200 mmHg)"); return; }
    if (dp >= sp)                          { alert("Diastolic BP must be lower than Systolic BP"); return; }
    if (isNaN(bf) || bf < 1  || bf > 80)  { alert("Enter a valid body fat percentage (1–80%)"); return; }

    try {
      await updateDoc(doc(db, "users", user.uid), {
        medical: {
          height: String(Math.round(h)), weight: String(Math.round(w)), bloodGroup, allergies,
          restingHR: hr, systolicBP: sp, diastolicBP: dp, bodyFatPct: bf,
        },
        // Write biogears_ fields directly so they are available at calibration time
        biogears_resting_hr:   hr,
        biogears_systolic_bp:  sp,
        biogears_diastolic_bp: dp,
        biogears_body_fat:     bf / 100.0,
        updatedAt: new Date().toISOString(),
      });
      router.push({
        pathname: "/onboarding/habits",
        params: {
          signupName, signupEmail, firstName, lastName, phone, dateOfBirth, gender,
          height: String(Math.round(h)), weight: String(Math.round(w)), bloodGroup, allergies,
          restingHR: String(hr), systolicBP: String(sp), diastolicBP: String(dp), bodyFatPct: String(bf),
        },
      });
    } catch (error: any) {
      alert(error.message);
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

          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.progressTrackBg }]}>
              <View style={[styles.progressFill, { width: "50%", backgroundColor: colors.progressFillBg }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.progressLabelText }]}>Step 2 of 4</Text>
          </View>

          <View style={styles.header}>
            <View style={[styles.iconBadge, { backgroundColor: colors.iconBadgeBg }]}>
              <Text style={styles.iconEmoji}>🩺</Text>
            </View>
            <Text style={[styles.title, { color: colors.titleText }]}>Medical Info</Text>
            <Text style={[styles.subtitle, { color: colors.subtitleText }]}>
              Your body measurements and vitals help us calibrate your digital twin precisely
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

          {canContinue && (
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: accent + "40" }]}>
              <Text style={[styles.summaryTitle, { color: colors.labelText }]}>✅ Looking good!</Text>
              <Text style={[styles.summaryLine, { color: colors.subText }]}>
                {height} cm · {weight} kg · {bodyFatPct}% fat · Blood {bloodGroup}
              </Text>
              <Text style={[styles.summaryLine, { color: colors.subText }]}>
                HR {restingHR} bpm · BP {systolicBP}/{diastolicBP} mmHg
              </Text>
            </View>
          )}

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