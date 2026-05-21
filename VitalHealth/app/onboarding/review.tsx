import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { auth, db } from "../../services/firebase";
import { doc, updateDoc } from "firebase/firestore";
import * as BiogearsAPI from "../../services/biogears";
import { buildDefaultRoutine } from "../../services/onboardingRoutineBuilder";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useTheme } from "../../context/ThemeContext";
// ✅ STEP 1: ADD FIREBASE IMPORT
import { saveProfile } from "../../services/profileService";

export default function Review() {
  const router  = useRouter();
  const params  = useLocalSearchParams();
  const { theme } = useTheme();

  const colors = theme === "light"
    ? { background: "#f8fafc", card: "#ffffff", text: "#020617", subText: "#64748b", border: "#e2e8f0", headerGradient: ["#6366f1", "#4f46e5"] }
    : { background: "#0D0D0F", card: "rgba(255,255,255,0.04)", text: "#ffffff", subText: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.08)", headerGradient: ["#0f0c29", "#302b63"] };

  const [signupName,  setSignupName]  = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [saving,      setSaving]      = useState(false);
  const [generatedRoutine, setGeneratedRoutine] = useState<any>(null);
  
  const [habits, setHabits] = useState<any>(null);
  const [customActivity, setCustomActivity] = useState<string>("Moderate");
  const [customDiet, setCustomDiet] = useState<string>("Vegetarian");

  // Load name & email from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      const n = await AsyncStorage.getItem("signupName");
      const e = await AsyncStorage.getItem("signupEmail");
      if (n) setSignupName(n);
      if (e) setSignupEmail(e);

      // Load onboarding habits to generate preview routine
      const user = auth.currentUser;
      if (user) {
        const raw = await AsyncStorage.getItem(`@onboarding_habits_${user.uid}`);
        if (raw) {
          const parsedHabits = JSON.parse(raw);
          setHabits(parsedHabits);
          if (parsedHabits.activity) setCustomActivity(parsedHabits.activity);
          if (parsedHabits.foodHabits?.dietType) setCustomDiet(parsedHabits.foodHabits.dietType);
        }
      }
      console.log("📋 Review loaded — name:", n, "email:", e);
    })();
  }, [params]);

  // Recalculate default routine when user adjusts custom controls
  useEffect(() => {
    if (!habits) return;
    const heightVal = parseFloat((params.height as string || '').replace(/[^0-9.]/g, '')) || 175;
    const weightVal = parseFloat((params.weight as string || '').replace(/[^0-9.]/g, '')) || 70;
    const updatedHabits = {
      ...habits,
      activity: customActivity,
      foodHabits: {
        ...habits.foodHabits,
        dietType: customDiet,
      }
    };
    const allergies = params.allergies ? (params.allergies as string).split(',').map(a => a.trim()).filter(Boolean) : [];
    const routine = buildDefaultRoutine(updatedHabits, {
      gender: params.gender as string,
      dateOfBirth: params.dateOfBirth as string,
      height: heightVal,
      weight: weightVal,
      allergies,
    });
    setGeneratedRoutine(routine);
  }, [customActivity, customDiet, habits, params]);

  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const makeLoop = (anim: Animated.Value, duration: number, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: -20, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0,   duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
    makeLoop(orb1Y, 3600, 0).start();
    makeLoop(orb2Y, 4200, 800).start();
    makeLoop(orb3Y, 3100, 1500).start();
  }, []);

  // ✅ STEP 2: FIX finishSetup() - SAVE TO FIREBASE
  const finishSetup = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const storedName  = await AsyncStorage.getItem("signupName")  || "";
      const storedEmail = await AsyncStorage.getItem("signupEmail") || "";

      const name  = storedName  || signupName;
      const email = storedEmail || signupEmail;

      const profileData = {
        firstName: (params.firstName as string) || name.split(" ")[0] || "",
        lastName: (params.lastName as string) || name.split(" ").slice(1).join(" ") || "",
        email,
        phone: (params.phone as string) || "",
        dateOfBirth: (params.dateOfBirth as string) || "",
        gender: (params.gender as string) || "",
        bloodGroup: (params.bloodGroup as string) || "",
        height: params.height ? `${params.height} cm` : "",
        weight: params.weight ? `${params.weight} kg` : "",
        allergies: params.allergies
          ? (params.allergies as string).split(",").map(a => a.trim()).filter(Boolean)
          : [],
        // ✅ STEP 3: IMPORTANT FIX (PARAM NAME BUG)
        medications: params.medications
          ? (params.medications as string).split(",").map(m => m.trim()).filter(Boolean)
          : [],
      };

      // Save profile to Firebase
      await saveProfile({
        ...profileData,
        emergencyContact: { name: "", phone: "", relation: "" },
      });

      // Save locally
      await AsyncStorage.setItem("userProfile", JSON.stringify(profileData));

      // ── Build & save default routine from onboarding habits ──────────────
      const user = auth.currentUser;
      if (user) {
        try {
          const raw = await AsyncStorage.getItem(`@onboarding_habits_${user.uid}`);
          if (raw) {
            const habitsObj = JSON.parse(raw);
            const updatedHabits = {
              ...habitsObj,
              activity: customActivity,
              foodHabits: {
                ...habitsObj.foodHabits,
                dietType: customDiet,
              }
            };
            
            // Save updated habits to AsyncStorage and Firestore
            await AsyncStorage.setItem(`@onboarding_habits_${user.uid}`, JSON.stringify(updatedHabits));
            await updateDoc(doc(db, "users", user.uid), {
              habits: updatedHabits,
            });

            const heightVal = parseFloat((profileData.height || '').replace(/[^0-9.]/g, '')) || 175;
            const weightVal = parseFloat((profileData.weight || '').replace(/[^0-9.]/g, '')) || 70;
            const routine = buildDefaultRoutine(updatedHabits, {
              gender: profileData.gender,
              dateOfBirth: profileData.dateOfBirth,
              height: heightVal,
              weight: weightVal,
              allergies: profileData.allergies,
            });
            // Save the routine then mark it as default
            await BiogearsAPI.saveRoutine(user.uid, routine);
            await BiogearsAPI.setDefaultRoutine(user.uid, routine.id);
            console.log('✅ Custom default routine "My Typical Day" created from onboarding habits');
          }
        } catch (routineErr) {
          // Non-fatal — user can always set a default manually
          console.log('⚠️ Could not build default routine:', routineErr);
        }
      }

      console.log("✅ Profile saved to Firebase:", profileData);
      router.replace("/");

    } catch (error) {
      console.log("Error:", error);
      router.replace("/");
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, value, icon }: { label: string; value?: string; icon: string }) => {
    if (!value?.trim()) return null;
    return (
      <View style={[styles.row, { borderBottomColor: colors.border }]}>
        <View style={styles.rowLeft}>
          <Text style={styles.rowIcon}>{icon}</Text>
          <Text style={[styles.rowLabel, { color: colors.subText }]}>{label}</Text>
        </View>
        <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
      </View>
    );
  };

  const bmi = params.height && params.weight
    ? (parseFloat(params.weight as string) / Math.pow(parseFloat(params.height as string) / 100, 2)).toFixed(1)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.View pointerEvents="none" style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.orb3, { transform: [{ translateY: orb3Y }] }]} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.iconEmoji}>🎉</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>You're all set!</Text>
          <Text style={[styles.subtitle, { color: colors.subText }]}>
            Review your profile before we personalise your health dashboard
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.headerGradient[0] }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.subText }]}>Complete ✓</Text>
        </View>

        {/* Personal Information */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>👤</Text>
            <Text style={[styles.sectionTitle, { color: colors.subText }]}>Personal Information</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowLeft}><Text style={styles.rowIcon}>🙍</Text><Text style={[styles.rowLabel, { color: colors.subText }]}>Full Name</Text></View>
            <Text style={[styles.rowValue, { color: colors.text }]}>{signupName || "—"}</Text>
          </View>
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowLeft}><Text style={styles.rowIcon}>✉️</Text><Text style={[styles.rowLabel, { color: colors.subText }]}>Email</Text></View>
            <Text style={[styles.rowValue, { color: colors.text }]}>{signupEmail || "—"}</Text>
          </View>
          <Row label="Phone"         icon="📱" value={params.phone       as string} />
          <Row label="Date of Birth" icon="🎂" value={params.dateOfBirth as string} />
          <Row label="Gender"        icon="🧬" value={params.gender      as string} />
        </View>

        {/* Body Stats */}
        <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>📏</Text>
            <Text style={[styles.sectionTitle, { color: colors.subText }]}>Body Stats</Text>
          </View>
          <Row label="Height"      icon="📏" value={params.height     ? `${params.height} cm`     : ""} />
          <Row label="Weight"      icon="⚖️" value={params.weight     ? `${params.weight} kg`     : ""} />
          <Row label="Blood Group" icon="🩸" value={params.bloodGroup as string} />
          {bmi && (
            <View style={[styles.bmiInline, { borderTopColor: colors.border }]}>
              <Text style={[styles.bmiInlineLabel, { color: colors.subText }]}>Estimated BMI</Text>
              <View style={styles.bmiInlineRight}>
                <Text style={[styles.bmiInlineValue, { color: colors.text }]}>{bmi}</Text>
                <Text style={[styles.bmiInlineTag, { color: colors.subText }]}>
                  {parseFloat(bmi) < 18.5 ? "Underweight" : parseFloat(bmi) < 25 ? "✓ Healthy" : parseFloat(bmi) < 30 ? "Overweight" : "Obese"}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Medical */}
        {(params.allergies || params.diseases || params.surgeries || params.familyHistory) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🏥</Text>
              <Text style={[styles.sectionTitle, { color: colors.subText }]}>Medical Details</Text>
            </View>
            <Row label="Allergies"      icon="⚠️"  value={params.allergies     as string} />
            <Row label="Conditions"     icon="💊"  value={params.diseases      as string} />
            <Row label="Surgeries"      icon="🔬"  value={params.surgeries     as string} />
            <Row label="Family History" icon="👨‍👩‍👧" value={params.familyHistory as string} />
          </View>
        )}

        {/* Daily Habits */}
        {(params.wakeUp || params.activity || params.water) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🌿</Text>
              <Text style={[styles.sectionTitle, { color: colors.subText }]}>Daily Habits</Text>
            </View>
            <Row label="Wake Up"   icon="🌅" value={params.wakeUp    as string} />
            <Row label="Breakfast" icon="🍳" value={params.breakfast as string} />
            <Row label="Lunch"     icon="🥗" value={params.lunch     as string} />
            <Row label="Dinner"    icon="🍽️" value={params.dinner    as string} />
            <Row label="Sleep"     icon="🌙" value={params.sleep     as string} />
            <Row label="Water"     icon="💧" value={params.water ? `${params.water} glasses/day` : ""} />
            <Row label="Activity"  icon="⚡" value={params.activity  as string} />
          </View>
        )}

        {/* Digital Twin Routine Preview */}
        {generatedRoutine && (
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>⭐</Text>
              <Text style={[styles.sectionTitle, { color: colors.subText }]}>Digital Twin Routine Baseline</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.text, fontWeight: '700', marginBottom: 12 }}>
              "My Typical Day" Catch-up Routine
            </Text>

            {/* Interactive Tuner Selection */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 10, color: colors.subText, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 6 }}>Tweak Activity Target</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                {['Sedentary', 'Moderate', 'Active'].map((lvl) => (
                  <TouchableOpacity
                    key={lvl}
                    onPress={() => setCustomActivity(lvl)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: customActivity === lvl ? colors.accent : colors.background,
                      borderWidth: 1,
                      borderColor: customActivity === lvl ? colors.accent : colors.border
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: customActivity === lvl ? '#fff' : colors.text }}>{lvl}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 10, color: colors.subText, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 6 }}>Tweak Diet Selection</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['Vegetarian', 'High Protein', 'Ketogenic'].map((dt) => (
                  <TouchableOpacity
                    key={dt}
                    onPress={() => setCustomDiet(dt)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: customDiet === dt ? colors.accent : colors.background,
                      borderWidth: 1,
                      borderColor: customDiet === dt ? colors.accent : colors.border
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: 'bold', color: customDiet === dt ? '#fff' : colors.text }}>{dt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            {/* Target energy metrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.background, padding: 12, borderRadius: 10, marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 10, color: colors.subText, textTransform: 'uppercase', fontWeight: 'bold' }}>Daily Calories</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{generatedRoutine.events.reduce((acc: number, e: any) => e.event_type === 'meal' ? acc + e.value : acc, 0)} kcal</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10, color: colors.subText, textTransform: 'uppercase', fontWeight: 'bold' }}>Water Intake</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>{generatedRoutine.events.reduce((acc: number, e: any) => e.event_type === 'water' ? acc + e.value : acc, 0)} ml</Text>
              </View>
            </View>

            {/* List of events */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16, marginBottom: 4 }}>
              {generatedRoutine.events.map((evt: any, idx: number) => (
                <View key={evt.id || idx} style={{ width: 115, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, marginRight: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, marginBottom: 4 }}>{evt.displayIcon}</Text>
                  <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.subText }}>{evt.wallTime}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 4 }} numberOfLines={1}>
                    {evt.event_type === 'meal' ? `${evt.value} kcal` : evt.event_type === 'water' ? `${evt.value} ml` : evt.event_type === 'sleep' ? 'Sleep' : 'Exercise'}
                  </Text>
                  <Text style={{ fontSize: 9, color: colors.subText, textAlign: 'center', marginTop: 2 }}>
                    {evt.event_type === 'meal' && evt.meal_type ? evt.meal_type.replace('_', ' ') : evt.event_type}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Note */}
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.infoIcon}>✨</Text>
          <Text style={[styles.infoText, { color: colors.subText }]}>
            Your profile is saved securely and syncs across all your devices.
          </Text>
        </View>

        {/* Launch Button */}
        <TouchableOpacity
          style={[styles.finishBtn, { backgroundColor: colors.headerGradient[0], opacity: saving ? 0.7 : 1 }]}
          onPress={finishSetup}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={[styles.finishBtnText, { color: "#fff" }]}>
            {saving ? "Saving..." : "Launch My Dashboard"}
          </Text>
          {!saving && <Text style={styles.finishBtnArrow}></Text>}
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  scroll:          { flexGrow: 1, paddingHorizontal: 20, paddingTop: 60, paddingBottom: 50 },
  orb:             { position: "absolute", borderRadius: 999 },
  orb1:            { width: 260, height: 260, backgroundColor: "#3b82f6", opacity: 0.1,  top: -50,    left: -90 },
  orb2:            { width: 200, height: 200, backgroundColor: "#60a5fa", opacity: 0.07, bottom: 100, right: -80 },
  orb3:            { width: 130, height: 130, backgroundColor: "#1d4ed8", opacity: 0.09, top: "40%",  left: -30 },
  header:          { alignItems: "center", marginBottom: 20 },
  iconBadge:       { width: 72, height: 72, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  iconEmoji:       { fontSize: 32 },
  title:           { fontSize: 28, fontWeight: "800", letterSpacing: -0.8, marginBottom: 6 },
  subtitle:        { fontSize: 13, opacity: 0.85, textAlign: "center", lineHeight: 19, paddingHorizontal: 14 },
  progressRow:     { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 24 },
  progressTrack:   { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill:    { height: "100%", width: "100%", borderRadius: 2 },
  progressLabel:   { fontSize: 12, fontWeight: "700" },
  sectionCard:     { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionHeader:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionIcon:     { fontSize: 16 },
  sectionTitle:    { fontSize: 13, fontWeight: "700", letterSpacing: 0.3, flex: 1 },
  row:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1 },
  rowLeft:         { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  rowIcon:         { fontSize: 14 },
  rowLabel:        { fontSize: 13 },
  rowValue:        { fontSize: 13, fontWeight: "600", textAlign: "right", flex: 1 },
  bmiInline:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, paddingTop: 10, borderTopWidth: 1 },
  bmiInlineLabel:  { fontSize: 13 },
  bmiInlineRight:  { flexDirection: "row", alignItems: "center", gap: 10 },
  bmiInlineValue:  { fontSize: 20, fontWeight: "800" },
  bmiInlineTag:    { fontSize: 12, fontWeight: "600" },
  infoBox:         { flexDirection: "row", alignItems: "flex-start", borderWidth: 1, borderRadius: 12, padding: 14, gap: 8, marginBottom: 24 },
  infoIcon:        { fontSize: 14, marginTop: 1 },
  infoText:        { flex: 1, fontSize: 12, lineHeight: 18 },
  finishBtn:       { width: "100%", height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  finishBtnText:   { fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  finishBtnArrow:  { fontSize: 18 },
});