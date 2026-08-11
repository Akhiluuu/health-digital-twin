import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../context/ThemeContext";
import { colors as globalColors } from "../../theme/colors";
import {
  fetchAdaptiveOnboardingQuestions,
  searchMedicalDatabase,
  COMPREHENSIVE_MEDICAL_TAXONOMY_FALLBACK,
  MedicalSearchItem,
} from "../../services/onboardingService";
import { Ionicons } from "@expo/vector-icons";

const CATEGORY_EMOJIS: Record<string, string> = {
  "All": "🌐",
  "Cardiovascular": "🫀",
  "Endocrine & Metabolic": "🩸",
  "Respiratory": "🫁",
  "Neurological": "🧠",
  "Gastrointestinal & Hepatic": "🥗",
  "Renal & Urological": "🧪",
  "Musculoskeletal & Autoimmune": "🦴",
  "Dermatological": "🧴",
  "Hematological & Immune": "🛡️",
  "Mental Health & Neurodiversity": "💭",
  "Oncology": "🎗️",
  "Reproductive & Womens Health": "🌸",
};

const COMMON_FAMILY = [
  "Heart Disease", "Diabetes", "Cancer", "Stroke",
  "Hypertension", "Mental Health", "Kidney Disease", "Obesity", "Thyroid", "Asthma"
];

const COMMON_MEDICATIONS = [
  "Aspirin", "Metformin", "Amlodipine", "Atorvastatin",
  "Levothyroxine", "Paracetamol", "Ibuprofen", "Losartan",
  "Insulin", "Salbutamol", "Ramipril", "Omeprazole",
];

/** Maps selected conditions to BioGears clinical fields */
function conditionsToBiogearsFields(conditions: string[], extraText: string): Record<string, any> {
  const all = [...conditions, ...extraText.split(",").map(s => s.trim())].map(s => s.toLowerCase());
  return {
    biogears_has_type1_diabetes: all.some(c => c.includes("type 1") || c.includes("t1d")),
    biogears_has_type2_diabetes: all.some(c => c.includes("type 2") || c.includes("t2d") || (c.includes("diabetes") && !c.includes("type 1") && !c.includes("t1d"))),
    biogears_has_anemia:         all.some(c => c.includes("anemia") || c.includes("anaemia")),
    biogears_is_smoker:          all.some(c => c.includes("copd") || c.includes("asthma") || c.includes("smoker")),
    biogears_has_hypertension:   all.some(c => c.includes("hypertension") || c.includes("high bp")),
    biogears_has_ckd:            all.some(c => c.includes("kidney") || c.includes("ckd")),
  };
}

export default function History() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();

  const activeTheme = theme === "light" ? "light" : "dark";
  const c = globalColors[activeTheme] || globalColors.dark;
  const primaryGoal = (params.primaryGoal as string) || "";
  const colors = {
    background:          c.bg,
    card:                c.card,
    cardBg:              c.card,
    accent:              c.accent || "#3b82f6",
    text:                c.text,
    subText:             c.sub,
    border:              c.border,
    inputBg:             c.inputBg,
    inputBorder:         c.border,
    inputFocusedBorder:  c.focusBorder,
    inputText:           c.text,
    inputPlaceholder:    c.placeholder,
    labelText:           c.text,
    iconBadgeBg:         c.border,
    titleText:           c.text,
    subtitleText:        c.sub,
    progressTrackBg:     c.border,
    progressFillBg:      c.primary,
    progressText:        c.sub,
    orb1:                c.primary,
    orb2:                c.primaryLight,
    orb3:                c.primaryDark,
    nextBtnBg:           c.accent || "#3b82f6",
    nextBtnText:         "#ffffff",
    chipBg:              c.card,
    chipBorder:          c.border,
    chipText:            c.sub,
    chipActiveBg:        c.accent || "#3b82f6",
    chipActiveBorder:    c.accent || "#3b82f6",
    chipActiveText:      "#ffffff",
    sectionCardBg:       c.card,
    sectionCardBorder:   c.border,
    sectionTitle:        c.text,
    backButtonBg:        c.card,
    backButtonBorder:    c.border,
    backButtonText:      c.sub,
    safeAreaBg:          c.bg,
  };

  // ── Form State ─────────────────────────────────────────────────────────────
  const [selectedConditions,  setSelectedConditions]  = useState<string[]>([]);
  const [selectedFamily,      setSelectedFamily]       = useState<string[]>([]);
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);
  const [surgeries,           setSurgeries]           = useState("");
  const [customConditionInput, setCustomConditionInput] = useState("");
  const [currentMedications,  setCurrentMedications]  = useState("");

  // ── Taxonomy & Search State ─────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [taxonomyMap, setTaxonomyMap] = useState<Record<string, string[]>>(COMPREHENSIVE_MEDICAL_TAXONOMY_FALLBACK);
  const [searchResults, setSearchResults] = useState<MedicalSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // ── Dynamic Smart Chips state from backend ─────────────────────────────────
  const [dynamicFamily,     setDynamicFamily]     = useState<string[]>(COMMON_FAMILY);
  const [dynamicMeds,       setDynamicMeds]       = useState<string[]>(COMMON_MEDICATIONS);

  // ── Focus states ───────────────────────────────────────────────────────────
  const [searchFocused,       setSearchFocused]       = useState(false);
  const [surgeriesFocused,    setSurgeriesFocused]    = useState(false);
  const [medicationsFocused,  setMedicationsFocused]  = useState(false);
  const [customCondFocused,   setCustomCondFocused]   = useState(false);

  // ── Scroll ref ─────────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const conditionsY = useRef(0);
  const medicationsY = useRef(0);
  const surgeriesY = useRef(0);
  const familyY = useRef(0);

  const scrollToY = (y: number) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  };

  // ── Orb animations & Adaptive Intake Fetching ──────────────────────────────
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

    // Fetch dynamic question chips from backend
    (async () => {
      try {
        const res = await fetchAdaptiveOnboardingQuestions({
          patient_id: auth.currentUser?.uid || "guest",
          primary_goal: (params.primaryGoal as string) || "wellness",
          sex: (params.gender as string) || "male",
        });
        if (res && res.categorized_taxonomy) {
          setTaxonomyMap(res.categorized_taxonomy);
        }
        if (res && res.suggested_family_history && res.suggested_family_history.length > 0) {
          setDynamicFamily(res.suggested_family_history);
        }
        if (res && res.suggested_medications && res.suggested_medications.length > 0) {
          setDynamicMeds(res.suggested_medications);
        }
      } catch (err) {
        console.log("[History] Used static fallback chips:", err);
      }
    })();
  }, []);

  // ── Dynamic Search Effect ──────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 0 || selectedCategory !== "All") {
        setIsSearching(true);
        try {
          const res = await searchMedicalDatabase(searchQuery, selectedCategory, 40);
          setSearchResults(res.results || []);
        } catch (e) {
          // Fallback search
          const q = searchQuery.toLowerCase().trim();
          const results: MedicalSearchItem[] = [];
          Object.entries(taxonomyMap).forEach(([cat, items]) => {
            if (selectedCategory !== "All" && !cat.toLowerCase().includes(selectedCategory.toLowerCase())) return;
            items.forEach(item => {
              if (!q || item.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) {
                results.push({ condition: item, category: cat });
              }
            });
          });
          setSearchResults(results.slice(0, 40));
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, taxonomyMap]);

  // ── Toggle helpers ─────────────────────────────────────────────────────────
  const toggleCondition = (item: string) => {
    setSelectedConditions(prev => prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]);
  };

  const addCustomCondition = () => {
    const trimmed = customConditionInput.trim();
    if (trimmed && !selectedConditions.includes(trimmed)) {
      setSelectedConditions(prev => [...prev, trimmed]);
      setCustomConditionInput("");
    }
  };

  const toggleFamily     = (item: string) => setSelectedFamily(prev     => prev.includes(item)  ? prev.filter(c => c !== item)  : [...prev, item]);
  const toggleMedication = (item: string) => setSelectedMedications(prev => prev.includes(item) ? prev.filter(c => c !== item) : [...prev, item]);

  // ── Compute Active Display Conditions ──────────────────────────────────────
  const categoryNames = ["All", ...Object.keys(taxonomyMap)];

  // Active items for selected category when search is empty
  const activeCategoryConditions = selectedCategory === "All"
    ? Object.values(taxonomyMap).flat().slice(0, 24)
    : taxonomyMap[selectedCategory] || [];

  // ── Submit Handler ─────────────────────────────────────────────────────────
  const goToReview = async () => {
    const allMedications = [...selectedMedications, currentMedications]
      .filter(Boolean)
      .join(", ");

    const biogearsConditions = conditionsToBiogearsFields(selectedConditions, "");

    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.keys(params).forEach((key) => {
        const val = params[key];
        if (typeof val === "string") {
          cleanParams[key] = val;
        } else if (typeof val === "number" || typeof val === "boolean") {
          cleanParams[key] = String(val);
        }
      });
    }

    const targetParams = {
      ...cleanParams,
      diseases: selectedConditions.join(", "),
      surgeries: surgeries || "",
      familyHistory: selectedFamily.join(", "),
      selectedConditions:  JSON.stringify(selectedConditions),
      selectedFamily:      JSON.stringify(selectedFamily),
      currentMedications:  allMedications,
      hasT1D:    String(biogearsConditions.biogears_has_type1_diabetes),
      hasT2D:    String(biogearsConditions.biogears_has_type2_diabetes),
      hasAnemia: String(biogearsConditions.biogears_has_anemia),
      isSmoker:  String(biogearsConditions.biogears_is_smoker),
    };

    try {
      const user = auth.currentUser;
      const uid = user ? user.uid : "guest";

      const historyData = {
        history: {
          diseases: selectedConditions.join(", "),
          surgeries,
          familyHistory: selectedFamily.join(", "),
          selectedConditions,
          selectedFamily,
          medications: allMedications,
        },
        ...biogearsConditions,
        medications: allMedications
          ? allMedications.split(",").map((m: string) => m.trim()).filter(Boolean)
          : [],
        updatedAt: new Date().toISOString(),
      };

      try {
        await AsyncStorage.setItem(`@onboarding_history_${uid}`, JSON.stringify(historyData));
      } catch (e) {}

      if (user) {
        try {
          await setDoc(doc(db, "users", user.uid), historyData, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore history save warning:", fsErr);
        }
      }

      router.push({
        pathname: "/onboarding/review",
        params: targetParams,
      });
    } catch (error: any) {
      console.error("[History] goToReview error:", error);
      router.push({
        pathname: "/onboarding/review",
        params: targetParams,
      });
    }
  };

  const Chip = ({
    label, active, onPress, categoryTag,
  }: { label: string; active: boolean; onPress: () => void; categoryTag?: string }) => (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.chipActiveBg : colors.chipBg,
          borderColor:     active ? colors.chipActiveBorder : colors.chipBorder,
          borderWidth: active ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, { color: active ? colors.chipActiveText : colors.chipText }]}>
        {active ? "✓ " : ""}{label}
      </Text>
      {categoryTag && !active ? (
        <Text style={{ fontSize: 9, color: colors.subText, opacity: 0.6, marginTop: 2 }}>
          {CATEGORY_EMOJIS[categoryTag] || "🩺"} {categoryTag.split(" ")[0]}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  const totalNodesCount = selectedConditions.length + selectedFamily.length + selectedMedications.length + (surgeries ? 1 : 0);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.safeAreaBg }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]}
        >
          {/* Decorative Orbs */}
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb1, { backgroundColor: colors.orb1, transform: [{ translateY: orb1Y }], opacity: theme === "light" ? 0.08 : 0.1 }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb2, { backgroundColor: colors.orb2, transform: [{ translateY: orb2Y }], opacity: theme === "light" ? 0.06 : 0.07 }]} />
          <Animated.View pointerEvents="none" style={[styles.orb, styles.orb3, { backgroundColor: colors.orb3, transform: [{ translateY: orb3Y }], opacity: theme === "light" ? 0.07 : 0.09 }]} />

          {/* Back Button */}
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.backButtonBg, borderColor: colors.backButtonBorder }]}
            onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}
            activeOpacity={0.8}
          >
            <Text style={[styles.backText, { color: colors.backButtonText }]}>← Back</Text>
          </TouchableOpacity>

          {/* Progress Header */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeaderRow}>
              <Text style={[styles.stepText, { color: colors.progressText }]}>Step 3 of 4</Text>
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.accent }}>⚡ TWIN CALIBRATION 75%</Text>
            </View>
            <View style={[styles.progressBar, { backgroundColor: colors.progressTrackBg }]}>
              <View style={[styles.progressFill, { width: "75%", backgroundColor: colors.accent }]} />
            </View>
          </View>

          {/* Conversational AI Banner */}
          <View style={{
            backgroundColor: colors.cardBg,
            borderRadius: 16,
            padding: 14,
            marginBottom: 18,
            borderWidth: 1,
            borderColor: colors.accent + "40",
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            elevation: 2,
          }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent + "20", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 24 }}>🧠</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: colors.accent, letterSpacing: 0.5, textTransform: "uppercase" }}>Personal Health OS Taxonomy</Text>
              <Text style={{ fontSize: 13, color: colors.titleText, fontWeight: "600", marginTop: 2, lineHeight: 18 }}>
                Search across 120+ clinical conditions, filter by organ system, or add custom diagnoses!
              </Text>
            </View>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.titleText }]}>Medical History & Taxonomy</Text>
            <Text style={[styles.subtitle, { color: colors.subtitleText }]}>Seeding medical timeline, active diagnoses & genetic risk factors</Text>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SELECTED CONDITIONS BADGE CONTAINER (Pills Bar)
          ══════════════════════════════════════════════════════════════ */}
          {selectedConditions.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: colors.accent + "10", borderColor: colors.accent + "50", marginBottom: 16 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: colors.accent, letterSpacing: 0.5, textTransform: "uppercase" }}>
                  📋 Selected Medical Profile ({selectedConditions.length})
                </Text>
                <TouchableOpacity onPress={() => setSelectedConditions([])}>
                  <Text style={{ fontSize: 11, color: colors.subText, fontWeight: "600" }}>Clear All</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {selectedConditions.map(item => (
                  <View
                    key={item}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.accent,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{item}</Text>
                    <TouchableOpacity onPress={() => toggleCondition(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 1 — Chronic Conditions Search & System Taxonomy
          ══════════════════════════════════════════════════════════════ */}
          <View
            style={[styles.sectionCard, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}
            onLayout={(e) => { conditionsY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>🩺</Text>
              <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Medical Conditions & Diagnoses</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.inputPlaceholder }]}>
              Search by medical condition, filter by body system, or add a custom diagnosis below
            </Text>

            {/* 🔎 Live Search Bar */}
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: searchFocused ? colors.inputFocusedBorder : colors.inputBorder, marginBottom: 12 }]}>
              <Ionicons name="search" size={18} color={colors.subText} style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Search any condition (e.g. Lupus, Asthma, Diabetes)..."
                placeholderTextColor={colors.inputPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="search"
                onFocus={() => {
                  setSearchFocused(true);
                  scrollToY(conditionsY.current);
                }}
                onBlur={() => setSearchFocused(false)}
              />
              {searchQuery !== "" && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color={colors.subText} />
                </TouchableOpacity>
              )}
            </View>

            {/* 🏷️ Medical Specialty Category Scroll Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
              {categoryNames.map(cat => {
                const isActive = selectedCategory === cat;
                const emoji = CATEGORY_EMOJIS[cat] || "🏷️";
                return (
                  <TouchableOpacity
                    key={cat}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 18,
                      borderWidth: 1.5,
                      backgroundColor: isActive ? colors.accent : colors.inputBg,
                      borderColor: isActive ? colors.accent : colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text style={{ fontSize: 13 }}>{emoji}</Text>
                    <Text style={{ fontSize: 12, fontWeight: isActive ? "800" : "600", color: isActive ? "#fff" : colors.text }}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Chip Grid (Search results or Category taxonomy) */}
            <View style={styles.chipGrid}>
              {searchQuery.trim().length > 0 || selectedCategory !== "All" ? (
                searchResults.length > 0 ? (
                  searchResults.map(res => (
                    <Chip
                      key={res.condition}
                      label={res.condition}
                      categoryTag={res.category}
                      active={selectedConditions.includes(res.condition)}
                      onPress={() => toggleCondition(res.condition)}
                    />
                  ))
                ) : (
                  <View style={{ padding: 14, alignItems: "center", width: "100%" }}>
                    <Text style={{ color: colors.subText, fontSize: 13 }}>No exact match found for "{searchQuery}".</Text>
                  </View>
                )
              ) : (
                activeCategoryConditions.map(item => (
                  <Chip
                    key={item}
                    label={item}
                    active={selectedConditions.includes(item)}
                    onPress={() => toggleCondition(item)}
                  />
                ))
              )}
            </View>

            {/* ➕ Custom Condition Input Creator */}
            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.subText, marginBottom: 6, textTransform: "uppercase" }}>
                Add Custom / Unlisted Diagnosis
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: customCondFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
                <Ionicons name="add-circle" size={20} color={colors.accent} style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Type any custom diagnosis & press add..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={customConditionInput}
                  onChangeText={setCustomConditionInput}
                  onSubmitEditing={addCustomCondition}
                  style={[styles.input, { color: colors.inputText }]}
                  returnKeyType="done"
                  onFocus={() => setCustomCondFocused(true)}
                  onBlur={() => setCustomCondFocused(false)}
                />
                {customConditionInput.trim().length > 0 && (
                  <TouchableOpacity
                    style={{ backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                    onPress={addCustomCondition}
                  >
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>+ Add</Text>
                  </TouchableOpacity>
                )}
              </View>
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
              Select common active prescriptions — or type others below
            </Text>

            <View style={styles.chipGrid}>
              {dynamicMeds.map(item => (
                <Chip key={item} label={item} active={selectedMedications.includes(item)} onPress={() => toggleMedication(item)} />
              ))}
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: medicationsFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
              <TextInput
                placeholder="Other medications (e.g. Levothyroxine 50mcg)..."
                placeholderTextColor={colors.inputPlaceholder}
                value={currentMedications}
                onChangeText={setCurrentMedications}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="next"
                onFocus={() => {
                  setMedicationsFocused(true);
                  scrollToY(medicationsY.current);
                }}
                onBlur={() => setMedicationsFocused(false)}
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3 — Past Surgeries & Procedures
          ══════════════════════════════════════════════════════════════ */}
          <View
            style={[styles.sectionCard, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}
            onLayout={(e) => { surgeriesY.current = e.nativeEvent.layout.y; }}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionEmoji}>🏥</Text>
              <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Past Surgeries & Major Procedures</Text>
            </View>
            <Text style={[styles.sectionHint, { color: colors.inputPlaceholder }]}>
              List any historical surgeries or hospitalization procedures with year
            </Text>

            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: surgeriesFocused ? colors.inputFocusedBorder : colors.inputBorder }]}>
              <TextInput
                placeholder="e.g. Appendectomy 2019, ACL Reconstruction 2021…"
                placeholderTextColor={colors.inputPlaceholder}
                value={surgeries}
                onChangeText={setSurgeries}
                style={[styles.input, { color: colors.inputText }]}
                returnKeyType="next"
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
              Select conditions that run in your family lineage
            </Text>

            <View style={styles.chipGrid}>
              {dynamicFamily.map(item => (
                <Chip key={item} label={item} active={selectedFamily.includes(item)} onPress={() => toggleFamily(item)} />
              ))}
            </View>
          </View>

          {/* ── Knowledge Graph Live Preview ─────────────────────────────── */}
          <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.nextBtnBg + "50", borderWidth: 1.5 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontSize: 16 }}>🕸️</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Health Knowledge Graph</Text>
              </View>
              <View style={{ backgroundColor: colors.nextBtnBg + "20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: colors.nextBtnBg, fontSize: 10, fontWeight: "800" }}>
                  {totalNodesCount} NODES READY
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: colors.subText, lineHeight: 16 }}>
              {selectedConditions.length} Diagnoses · {selectedMedications.length} Medications · {selectedFamily.length} Family Genetic Risks. Seeding your Personal Digital Twin timeline.
            </Text>
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

          <View style={styles.keyboardSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex:     { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 40,
    flexGrow: 1,
  },
  orb:  { position: "absolute", borderRadius: 999 },
  orb1: { width: 260, height: 260, top: -50,    right: -90 },
  orb2: { width: 200, height: 200, bottom: 100, left: -80  },
  orb3: { width: 130, height: 130, top: "50%",  right: -30 },

  backButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, marginBottom: 16 },
  backText:   { fontSize: 14, fontWeight: "600" },

  progressContainer: { marginBottom: 18 },
  progressHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  stepText:          { fontSize: 13, fontWeight: "600" },
  progressBar:       { height: 6, borderRadius: 6, overflow: "hidden" },
  progressFill:      { height: "100%" },

  header:    { alignItems: "center", marginBottom: 18 },
  title:     { fontSize: 26, fontWeight: "800", marginBottom: 4 },
  subtitle:  { fontSize: 13, textAlign: "center" },

  sectionCard:     { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionEmoji:    { fontSize: 16 },
  sectionTitle:    { fontSize: 14, fontWeight: "700" },
  sectionHint:     { fontSize: 11, marginBottom: 10, lineHeight: 16 },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip:     { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  chipText: { fontSize: 13, fontWeight: "600" },

  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, height: 48 },
  input:        { flex: 1, fontSize: 14 },

  nextBtn:     { height: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  nextBtnText: { fontSize: 16, fontWeight: "700" },

  keyboardSpacer: { height: 120 },
});