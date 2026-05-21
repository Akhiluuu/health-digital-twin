import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import React, { memo, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../context/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { label: "Sedentary", icon: "🪑", desc: "Little to no exercise" },
  { label: "Moderate",  icon: "🚶", desc: "Light exercise 1–3 days" },
  { label: "Active",    icon: "🏃", desc: "Hard exercise 4–5 days" },
];

const WATER_OPTIONS = ["1L", "2L", "3L", "4L", "5L", "6L"];

// ─── Food Quiz Questions ───────────────────────────────────────────────────────

const FOOD_QUIZ: {
  id: string;
  question: string;
  subtitle: string;
  emoji: string;
  type: "chips" | "single" | "dropdown" | "text";
  multi?: boolean;
  options?: { label: string; emoji?: string }[];
  placeholder?: string;
}[] = [
  {
    id: "dietType",
    question: "What best describes your diet?",
    subtitle: "Pick the one that fits your lifestyle",
    emoji: "🥗",
    type: "chips",
    multi: false,
    options: [
      { label: "Vegetarian",  emoji: "🥦" },
      { label: "Vegan",       emoji: "🌱" },
      { label: "Non-Veg",     emoji: "🍗" },
      { label: "Keto",        emoji: "🥩" },
      { label: "Paleo",       emoji: "🍖" },
      { label: "Flexitarian", emoji: "🥙" },
      { label: "Other",       emoji: "🍽️" },
    ],
  },
  {
    id: "mealFreq",
    question: "How many times do you eat in a day?",
    subtitle: "Including snacks and small bites",
    emoji: "🍽️",
    type: "single",
    options: [
      { label: "1–2 meals", emoji: "1️⃣" },
      { label: "3 meals",   emoji: "3️⃣" },
      { label: "4–5 meals", emoji: "🔢" },
      { label: "6+ meals",  emoji: "➕" },
    ],
  },
  {
    id: "snacking",
    question: "How often do you snack between meals?",
    subtitle: "Be honest — no judgement here!",
    emoji: "🍿",
    type: "single",
    options: [
      { label: "Never",        emoji: "🚫" },
      { label: "Rarely",       emoji: "😌" },
      { label: "Sometimes",    emoji: "🤔" },
      { label: "Often",        emoji: "😅" },
      { label: "All the time", emoji: "😬" },
    ],
  },
  {
    id: "cookingFreq",
    question: "How often do you cook at home?",
    subtitle: "Home-cooked vs ordered / eaten out",
    emoji: "👨‍🍳",
    type: "single",
    options: [
      { label: "Always",    emoji: "🏆" },
      { label: "Often",     emoji: "✅" },
      { label: "Sometimes", emoji: "🤷" },
      { label: "Rarely",    emoji: "😬" },
      { label: "Never",     emoji: "🙈" },
    ],
  },
  {
    id: "eatingOut",
    question: "How often do you eat out or order in?",
    subtitle: "Restaurants, delivery, takeaway",
    emoji: "🛵",
    type: "single",
    options: [
      { label: "Daily",        emoji: "📅" },
      { label: "4–5x a week",  emoji: "🔥" },
      { label: "2–3x a week",  emoji: "🙂" },
      { label: "Once a week",  emoji: "😌" },
      { label: "Rarely",       emoji: "🥗" },
    ],
  },
  {
    id: "allergies",
    question: "Any food allergies or intolerances?",
    subtitle: "Select all that apply",
    emoji: "⚠️",
    type: "chips",
    multi: true,
    options: [
      { label: "Gluten",    emoji: "🌾" },
      { label: "Dairy",     emoji: "🥛" },
      { label: "Eggs",      emoji: "🥚" },
      { label: "Nuts",      emoji: "🥜" },
      { label: "Soy",       emoji: "🫘" },
      { label: "Shellfish", emoji: "🦐" },
      { label: "None",      emoji: "✅" },
    ],
  },
  {
    id: "cuisines",
    question: "Which cuisines do you love most?",
    subtitle: "Pick all your favourites",
    emoji: "🌍",
    type: "chips",
    multi: true,
    options: [
      { label: "Indian",         emoji: "🍛" },
      { label: "Mediterranean",  emoji: "🫒" },
      { label: "Asian",          emoji: "🍜" },
      { label: "Mexican",        emoji: "🌮" },
      { label: "American",       emoji: "🍔" },
      { label: "Middle Eastern", emoji: "🧆" },
      { label: "Italian",        emoji: "🍝" },
      { label: "Japanese",       emoji: "🍱" },
    ],
  },
  {
    id: "favFoods",
    question: "What are your absolute favourite foods?",
    subtitle: "The ones you'd never say no to",
    emoji: "❤️",
    type: "dropdown",
    options: [
      { label: "Rice & Dal",       emoji: "🍚" },
      { label: "Biryani",          emoji: "🍛" },
      { label: "Pasta",            emoji: "🍝" },
      { label: "Pizza",            emoji: "🍕" },
      { label: "Salads",           emoji: "🥗" },
      { label: "Grilled Chicken",  emoji: "🍗" },
      { label: "Paneer dishes",    emoji: "🧀" },
      { label: "Sushi",            emoji: "🍱" },
      { label: "Burgers",          emoji: "🍔" },
      { label: "Avocado Toast",    emoji: "🥑" },
      { label: "Oats & Smoothies", emoji: "🥣" },
      { label: "Eggs",             emoji: "🍳" },
      { label: "Tacos",            emoji: "🌮" },
      { label: "Noodles / Ramen",  emoji: "🍜" },
      { label: "Dosa / Idli",      emoji: "🫓" },
      { label: "Other",            emoji: "✨" },
    ],
  },
  {
    id: "foodGoal",
    question: "What's your main food goal right now?",
    subtitle: "What do you want to achieve through eating?",
    emoji: "🎯",
    type: "chips",
    multi: false,
    options: [
      { label: "Lose weight",       emoji: "⚖️" },
      { label: "Build muscle",      emoji: "💪" },
      { label: "Eat cleaner",       emoji: "🥦" },
      { label: "More energy",       emoji: "⚡" },
      { label: "Better gut health", emoji: "🦠" },
      { label: "Just stay healthy", emoji: "🌿" },
    ],
  },
  {
    id: "avoidFoods",
    question: "Any foods you actively avoid?",
    subtitle: "Beyond allergies — things you just don't enjoy",
    emoji: "🚫",
    type: "text",
    placeholder: "e.g. Spicy food, raw onions, processed snacks…",
  },
  {
    id: "cheatMeal",
    question: "What's your go-to cheat meal?",
    subtitle: "We won't tell anyone 🤫",
    emoji: "🍩",
    type: "text",
    placeholder: "e.g. Double cheeseburger, gulab jamun, ice cream…",
  },
  {
    id: "mealPrepDay",
    question: "Do you meal prep in advance?",
    subtitle: "Planning meals ahead for the week",
    emoji: "📦",
    type: "single",
    options: [
      { label: "Yes, every week", emoji: "🏆" },
      { label: "Occasionally",    emoji: "🙂" },
      { label: "Want to start",   emoji: "🤔" },
      { label: "Not my thing",    emoji: "🙈" },
    ],
  },
  {
    id: "waterPref",
    question: "How do you usually drink water?",
    subtitle: "Your hydration style",
    emoji: "💧",
    type: "single",
    options: [
      { label: "Plain water",     emoji: "🫗" },
      { label: "Infused / lemon", emoji: "🍋" },
      { label: "Sparkling",       emoji: "🫧" },
      { label: "Coconut water",   emoji: "🥥" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function formatDisplayTime(timeStr: string): string {
  if (!timeStr) return "";
  const [hStr, mStr] = timeStr.split(":");
  const h24 = parseInt(hStr, 10);
  const m   = parseInt(mStr, 10);
  const isPM = h24 >= 12;
  const h12  = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${isPM ? "PM" : "AM"}`;
}

// ─── Native Time Picker ───────────────────────────────────────────────────────

function NativeTimePicker({
  value, onChange, accent = "#3b82f6", colors,
}: {
  value: string; onChange: (t: string) => void; accent?: string; colors: any;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const parseTimeToDate = (t: string) => {
    const [h, m] = (t || "08:00").split(":").map(Number);
    const d = new Date(); d.setHours(h || 8, m || 0, 0, 0); return d;
  };
  const handleChange = (_: any, sel?: Date) => {
    setShowPicker(false);
    if (sel) onChange(`${pad(sel.getHours())}:${pad(sel.getMinutes())}`);
  };
  return (
    <>
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={[tpStyles.pill, {
          borderColor:     value ? accent : colors.inputBorder,
          backgroundColor: value ? accent + "18" : colors.inputBg,
        }]}
        activeOpacity={0.75}
      >
        <Text style={[tpStyles.pillTxt, { color: value ? accent : colors.inputPlaceholder }]}>
          {value ? formatDisplayTime(value) : "Tap to set"}
        </Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={parseTimeToDate(value)}
          mode="time" is24Hour={false} display="default"
          onChange={handleChange}
        />
      )}
    </>
  );
}

const tpStyles = StyleSheet.create({
  pill:    { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 30, borderWidth: 1.5 },
  pillTxt: { fontSize: 15, fontWeight: "600", letterSpacing: 0.3 },
});

// ─── TimeField ────────────────────────────────────────────────────────────────

const TimeField = memo(function TimeField({
  label, icon, value, onChange, placeholder, colors, accent,
}: {
  label: string; icon: string; value: string; onChange: (v: string) => void;
  placeholder: string; colors: any; accent: string;
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.fieldLabel, { color: colors.labelText }]}>{label}</Text>
      <View style={[styles.inputWrapper, {
        backgroundColor: colors.inputBg,
        borderColor: value ? accent + "60" : colors.inputBorder,
      }]}>
        <Text style={styles.inputIcon}>{icon}</Text>
        <Text style={[styles.inputPlaceholder, { color: colors.inputPlaceholder, flex: 1 }]}>
          {placeholder}
        </Text>
        <NativeTimePicker value={value} onChange={onChange} accent={accent} colors={colors} />
        {!!value && <Text style={[styles.checkIcon, { color: colors.checkIconColor }]}>✓</Text>}
      </View>
    </View>
  );
});

// ─── Premium Dropdown ─────────────────────────────────────────────────────────

function DropdownSelect({
  options, selected, onSelect, colors, accent,
}: {
  options: { label: string; emoji?: string }[];
  selected: string[];
  onSelect: (val: string) => void;
  colors: any;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const displayLabel =
    selected.length === 0
      ? "Tap to choose your favourites…"
      : selected.length === 1
        ? `${options.find(o => o.label === selected[0])?.emoji ?? ""} ${selected[0]}`
        : `${selected.length} selected`;

  return (
    <>
      {/* Trigger */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        style={[drop.trigger, {
          backgroundColor: colors.inputBg,
          borderColor: selected.length > 0 ? accent + "80" : colors.inputBorder,
        }]}
      >
        <Text style={[drop.triggerTxt, {
          color: selected.length > 0 ? colors.inputText : colors.inputPlaceholder,
        }]}>
          {displayLabel}
        </Text>
        <Text style={[drop.arrow, { color: colors.inputPlaceholder }]}>▾</Text>
      </TouchableOpacity>

      {/* Selected pills */}
      {selected.length > 0 && (
        <View style={drop.pillRow}>
          {selected.map(s => {
            const opt = options.find(o => o.label === s);
            return (
              <TouchableOpacity
                key={s}
                style={[drop.pill, { backgroundColor: accent + "15", borderColor: accent + "40" }]}
                onPress={() => onSelect(s)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 13 }}>{opt?.emoji}</Text>
                <Text style={[drop.pillTxt, { color: accent }]}>{s}</Text>
                <Text style={[drop.pillX, { color: accent }]}>×</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Bottom Sheet Modal */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={drop.backdrop} activeOpacity={1} onPress={() => setOpen(false)} />
        <View style={[drop.sheet, { backgroundColor: colors.sectionCardBg }]}>
          <View style={[drop.handle, { backgroundColor: colors.inputBorder }]} />
          <Text style={[drop.sheetTitle, { color: colors.titleText }]}>Your Favourite Foods</Text>
          <Text style={[drop.sheetSub, { color: colors.inputPlaceholder }]}>
            Select all that you love ❤️
          </Text>
          <FlatList
            data={options}
            keyExtractor={item => item.label}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              const isSelected = selected.includes(item.label);
              return (
                <TouchableOpacity
                  style={[drop.optRow, {
                    backgroundColor: isSelected ? accent + "12" : colors.activityCardBg,
                    borderColor: isSelected ? accent + "50" : colors.inputBorder,
                  }]}
                  onPress={() => onSelect(item.label)}
                  activeOpacity={0.75}
                >
                  <Text style={drop.optEmoji}>{item.emoji}</Text>
                  <Text style={[drop.optLabel, { color: colors.inputText }]}>{item.label}</Text>
                  <View style={[drop.checkBox, {
                    backgroundColor: isSelected ? accent : "transparent",
                    borderColor: isSelected ? accent : colors.inputBorder,
                  }]}>
                    {isSelected && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity
            style={[drop.doneBtn, { backgroundColor: accent }]}
            onPress={() => setOpen(false)}
          >
            <Text style={drop.doneTxt}>Done  ✓</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const drop = StyleSheet.create({
  trigger:    { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 10 },
  triggerTxt: { fontSize: 14, fontWeight: "500", flex: 1 },
  arrow:      { fontSize: 14, marginLeft: 6 },
  pillRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  pill:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pillTxt:    { fontSize: 12, fontWeight: "600" },
  pillX:      { fontSize: 15, fontWeight: "700", marginLeft: 2 },
  backdrop:   { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet:      { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 14, maxHeight: "78%" },
  handle:     { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  sheetTitle: { fontSize: 18, fontWeight: "800", marginBottom: 4 },
  sheetSub:   { fontSize: 13, marginBottom: 16 },
  optRow:     { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8, gap: 12 },
  optEmoji:   { fontSize: 22 },
  optLabel:   { flex: 1, fontSize: 15, fontWeight: "500" },
  checkBox:   { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  doneBtn:    { borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  doneTxt:    { color: "#fff", fontSize: 16, fontWeight: "700" },
});

// ─── Food Quiz Card ───────────────────────────────────────────────────────────

function FoodQuizCard({
  q, answers, onAnswer, onMultiToggle, colors, accent,
}: {
  q: typeof FOOD_QUIZ[0];
  answers: Record<string, any>;
  onAnswer: (id: string, val: any) => void;
  onMultiToggle: (id: string, val: string) => void;
  colors: any;
  accent: string;
}) {
  const current = answers[q.id];

  const Chip = ({ opt, active }: { opt: { label: string; emoji?: string }; active: boolean }) => (
    <TouchableOpacity
      style={[qCard.chip, {
        backgroundColor: active ? accent + "18" : colors.chipBg,
        borderColor:     active ? accent          : colors.chipBorder,
        borderWidth:     active ? 1.8             : 1,
      }]}
      onPress={() => {
        if (q.multi) onMultiToggle(q.id, opt.label);
        else onAnswer(q.id, current === opt.label ? "" : opt.label);
      }}
      activeOpacity={0.75}
    >
      {opt.emoji && <Text style={{ fontSize: 14 }}>{opt.emoji}</Text>}
      <Text style={[qCard.chipTxt, { color: active ? accent : colors.chipText }]}>{opt.label}</Text>
      {active && <Text style={[qCard.chipCheck, { color: accent }]}>✓</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={[qCard.card, { backgroundColor: colors.sectionCardBg, borderColor: colors.sectionCardBorder }]}>
      {/* Header */}
      <View style={qCard.header}>
        <View style={[qCard.emojiWrap, { backgroundColor: accent + "15" }]}>
          <Text style={{ fontSize: 22 }}>{q.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[qCard.qTxt, { color: colors.titleText }]}>{q.question}</Text>
          <Text style={[qCard.qSub, { color: colors.inputPlaceholder }]}>{q.subtitle}</Text>
        </View>
      </View>

      {/* Chips */}
      {(q.type === "chips" || q.type === "single") && q.options && (
        <View style={qCard.chipRow}>
          {q.options.map(opt => (
            <Chip
              key={opt.label}
              opt={opt}
              active={
                q.multi
                  ? Array.isArray(current) && current.includes(opt.label)
                  : current === opt.label
              }
            />
          ))}
        </View>
      )}

      {/* Dropdown */}
      {q.type === "dropdown" && q.options && (
        <DropdownSelect
          options={q.options}
          selected={Array.isArray(current) ? current : []}
          onSelect={val => onMultiToggle(q.id, val)}
          colors={colors}
          accent={accent}
        />
      )}

      {/* Text */}
      {q.type === "text" && (
        <TextInput
          style={[qCard.textArea, {
            backgroundColor: colors.textInputBg,
            borderColor:     colors.textInputBorder,
            color:           colors.inputText,
          }]}
          placeholder={q.placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          value={typeof current === "string" ? current : ""}
          onChangeText={v => onAnswer(q.id, v)}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      )}
    </View>
  );
}

const qCard = StyleSheet.create({
  card:      { borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 12 },
  header:    { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  emojiWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  qTxt:      { fontSize: 15, fontWeight: "700", lineHeight: 20, marginBottom: 3 },
  qSub:      { fontSize: 12, lineHeight: 17 },
  chipRow:   { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 22 },
  chipTxt:   { fontSize: 13, fontWeight: "600" },
  chipCheck: { fontSize: 12, fontWeight: "800" },
  textArea:  { borderWidth: 1.5, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 80, lineHeight: 20 },
});

// ─── Colour maps ──────────────────────────────────────────────────────────────

const LIGHT = {
  background: "#f8fafc", card: "#ffffff", text: "#020617", subText: "#475569",
  border: "#e2e8f0", inputBg: "#ffffff", inputBorder: "#cbd5e1",
  inputText: "#0f172a", inputPlaceholder: "#94a3b8",
  labelText: "#334155", iconBadgeBg: "#e2e8f0", titleText: "#0f172a",
  subtitleText: "#475569", progressTrackBg: "#cbd5e1", progressFillBg: "#2563eb",
  progressText: "#64748b", nextBtnBg: "#2563eb", nextBtnText: "#ffffff",
  chipBg: "#ffffff", chipBorder: "#cbd5e1", chipText: "#334155",
  chipActiveBg: "#2563eb", chipActiveBorder: "#2563eb", chipActiveText: "#ffffff",
  sectionCardBg: "#ffffff", sectionCardBorder: "#e2e8f0", sectionTitle: "#334155",
  activityCardBg: "#f8fafc", activityCardBorder: "#e2e8f0",
  activityCardActiveBorder: "#2563eb", activityLabel: "#020617", activityDesc: "#64748b",
  backText: "#2563eb", checkIconColor: "#22c55e", safeAreaBg: "#f8fafc",
  waterDrop: "#3b82f6", accent: "#2563eb",
  textInputBg: "#f8fafc", textInputBorder: "#e2e8f0",
};

const DARK = {
  background: "#040a14", card: "#0d1f38", text: "#f0f8ff", subText: "#93c5fd",
  border: "#1e3a5f", inputBg: "#0d1f38", inputBorder: "#1e3a5f",
  inputText: "#f0f8ff", inputPlaceholder: "#4a7fa8",
  labelText: "#93c5fd", iconBadgeBg: "#0d1f38", titleText: "#f0f8ff",
  subtitleText: "#60a5fa", progressTrackBg: "#1e3a5f", progressFillBg: "#3b82f6",
  progressText: "#4a7fa8", nextBtnBg: "#2563eb", nextBtnText: "#ffffff",
  chipBg: "#0d1f38", chipBorder: "#1e3a5f", chipText: "#4a7fa8",
  chipActiveBg: "#1e3a5f", chipActiveBorder: "#3b82f6", chipActiveText: "#f0f8ff",
  sectionCardBg: "#070f1c", sectionCardBorder: "#1e3a5f", sectionTitle: "#93c5fd",
  activityCardBg: "#0d1f38", activityCardBorder: "#1e3a5f",
  activityCardActiveBorder: "#3b82f6", activityLabel: "#f0f8ff", activityDesc: "#2d5a8e",
  backText: "#60a5fa", checkIconColor: "#3b82f6", safeAreaBg: "#040a14",
  waterDrop: "#3b82f6", accent: "#3b82f6",
  textInputBg: "#0d1f38", textInputBorder: "#1e3a5f",
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Habits() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const c = theme === "light" ? LIGHT : DARK;

  // Schedule
  const [wakeUp,    setWakeUp]    = useState("");
  const [breakfast, setBreakfast] = useState("");
  const [lunch,     setLunch]     = useState("");
  const [dinner,    setDinner]    = useState("");
  const [sleep,     setSleep]     = useState("");

  // Water & Activity
  const [water,    setWater]    = useState("2L");
  const [activity, setActivity] = useState("");

  // All quiz answers - remove revealed logic
  const [answers, setAnswers] = useState<Record<string, any>>({});

  const scrollRef = useRef<ScrollView>(null);

  const setAnswer = (id: string, val: any) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
  };

  const toggleMulti = (id: string, val: string) => {
    const prev: string[] = Array.isArray(answers[id]) ? answers[id] : [];
    const next = prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val];
    setAnswers(a => ({ ...a, [id]: next }));
  };

  const goNext = async () => {
    const user = auth.currentUser;
    if (!user) { alert("User not logged in"); return; }
    try {
      const habitsPayload = {
        wakeUp, breakfast, lunch, dinner, sleep, water, activity,
        foodHabits: answers,
      };
      await updateDoc(doc(db, "users", user.uid), {
        habits: habitsPayload,
        updatedAt: new Date().toISOString(),
      });
      // Cache locally so review.tsx can build the default routine without
      // an extra Firestore round-trip
      await AsyncStorage.setItem(
        `@onboarding_habits_${user.uid}`,
        JSON.stringify(habitsPayload)
      );
      router.push({
        pathname: "/onboarding/history",
        params: { ...params, wakeUp, breakfast, lunch, dinner, sleep, water, activity },
      });
    } catch (e: any) { alert(e.message); }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.safeAreaBg }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { backgroundColor: c.background }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces
      >
        {/* BACK */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backArrow, { color: c.backText }]}>←</Text>
          <Text style={[styles.backTxt,   { color: c.backText }]}>Back</Text>
        </TouchableOpacity>

        {/* PROGRESS */}
        <View style={styles.progressWrap}>
          <View style={styles.progressRow}>
            <Text style={[styles.stepTxt, { color: c.progressText }]}>Step 3 of 4</Text>
            <Text style={[styles.stepTxt, { color: c.progressText }]}>Habits</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: c.progressTrackBg }]}>
            <View style={[styles.progressFill, { backgroundColor: c.progressFillBg }]} />
          </View>
        </View>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: c.iconBadgeBg }]}>
            <Text style={styles.badgeEmoji}>🌿</Text>
          </View>
          <Text style={[styles.title,    { color: c.titleText }]}>Daily Habits</Text>
          <Text style={[styles.subtitle, { color: c.subtitleText }]}>
            Your routine helps us build a personalised health schedule
          </Text>
        </View>

        {/* ── DAILY SCHEDULE ──────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Daily Schedule</Text>
          <Text style={[styles.cardHint,  { color: c.inputPlaceholder }]}>Tap any time to set</Text>
          <TimeField label="Wake Up"   icon="🌅" value={wakeUp}    onChange={setWakeUp}    placeholder="e.g. 6:30 AM"  colors={c} accent={c.accent} />
          <TimeField label="Breakfast" icon="🍳" value={breakfast} onChange={setBreakfast} placeholder="e.g. 8:00 AM"  colors={c} accent={c.accent} />
          <TimeField label="Lunch"     icon="🥗" value={lunch}     onChange={setLunch}     placeholder="e.g. 1:00 PM"  colors={c} accent={c.accent} />
          <TimeField label="Dinner"    icon="🍽️" value={dinner}    onChange={setDinner}    placeholder="e.g. 8:30 PM"  colors={c} accent={c.accent} />
          <TimeField label="Sleep"     icon="🌙" value={sleep}     onChange={setSleep}     placeholder="e.g. 11:00 PM" colors={c} accent={c.accent} />
        </View>

        {/* ── WATER ───────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Daily Water Intake</Text>
          <View style={styles.chipRow}>
            {WATER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, {
                  backgroundColor: water === opt ? c.chipActiveBg    : c.chipBg,
                  borderColor:     water === opt ? c.chipActiveBorder : c.chipBorder,
                }]}
                onPress={() => setWater(opt)}
              >
                <Text style={[styles.chipTxt, { color: water === opt ? c.chipActiveText : c.chipText }]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.waterRow}>
            {Array.from({ length: parseInt(water) || 2 }).map((_, i) => (
              <Text key={i} style={[styles.drop, { color: c.waterDrop }]}>💧</Text>
            ))}
          </View>
        </View>

        {/* ── ACTIVITY ────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Activity Level</Text>
          {ACTIVITY_LEVELS.map(lvl => (
            <TouchableOpacity
              key={lvl.label}
              style={[styles.actCard, {
                backgroundColor: c.activityCardBg,
                borderColor:     activity === lvl.label ? c.activityCardActiveBorder : c.activityCardBorder,
                borderWidth:     activity === lvl.label ? 1.8 : 1,
              }]}
              onPress={() => setActivity(lvl.label)}
            >
              <Text style={styles.actIcon}>{lvl.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actLabel, { color: c.activityLabel }]}>{lvl.label}</Text>
                <Text style={[styles.actDesc,  { color: c.activityDesc  }]}>{lvl.desc}</Text>
              </View>
              {activity === lvl.label && (
                <View style={[styles.actCheck, { backgroundColor: c.accent }]}>
                  <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ════════════════════════════════════════════════════════════════
            FOOD HABITS QUIZ — all questions revealed at once
        ════════════════════════════════════════════════════════════════ */}

        {/* Divider */}
        <View style={styles.divRow}>
          <View style={[styles.divLine, { backgroundColor: c.border }]} />
          <View style={[styles.divBadge, { backgroundColor: c.accent + "15", borderColor: c.accent + "35" }]}>
            <Text style={{ fontSize: 14 }}>🍴</Text>
            <Text style={[styles.divLabel, { color: c.accent }]}>Food Habits</Text>
            <View style={[styles.optPill, { backgroundColor: c.accent + "20" }]}>
              <Text style={[styles.optPillTxt, { color: c.accent }]}>Optional</Text>
            </View>
          </View>
          <View style={[styles.divLine, { backgroundColor: c.border }]} />
        </View>

        <Text style={[styles.quizHint, { color: c.inputPlaceholder }]}>
          Share your eating habits — all questions are optional.
        </Text>

        {/* All food habits questions revealed at once */}
        {FOOD_QUIZ.map((q) => (
          <FoodQuizCard
            key={q.id}
            q={q}
            answers={answers}
            onAnswer={setAnswer}
            onMultiToggle={toggleMulti}
            colors={c}
            accent={c.accent}
          />
        ))}

        {/* CONTINUE */}
        <TouchableOpacity
          style={[styles.nextBtn, { backgroundColor: c.nextBtnBg }]}
          onPress={goNext}
        >
          <Text style={[styles.nextTxt, { color: c.nextBtnText }]}>Continue</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  flex:         { flex: 1 },
  scroll:       { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 100 },

  backBtn:      { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backArrow:    { fontSize: 26 },
  backTxt:      { fontSize: 16, marginLeft: 4 },

  progressWrap: { marginBottom: 20 },
  progressRow:  { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  stepTxt:      { fontSize: 13, fontWeight: "600" },
  progressTrack:{ height: 6, borderRadius: 6, overflow: "hidden" },
  progressFill: { width: "75%", height: "100%" },

  header:       { alignItems: "center", marginBottom: 30 },
  badge:        { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  badgeEmoji:   { fontSize: 26 },
  title:        { fontSize: 28, fontWeight: "800" },
  subtitle:     { fontSize: 13, textAlign: "center" },

  card:         { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 16 },
  cardTitle:    { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  cardHint:     { fontSize: 11, marginBottom: 12 },

  fieldWrapper: { marginBottom: 10 },
  fieldLabel:   { fontSize: 11, marginBottom: 6, fontWeight: "600" },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  inputIcon:    { fontSize: 16 },
  inputPlaceholder: { fontSize: 14 },
  checkIcon:    { fontWeight: "700", marginLeft: 4, fontSize: 14 },

  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:         { paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1.5, borderRadius: 20 },
  chipTxt:      { fontSize: 13, fontWeight: "600" },

  waterRow:     { flexDirection: "row", marginTop: 10, flexWrap: "wrap" },
  drop:         { fontSize: 16, marginRight: 2 },

  actCard:      { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 14, marginBottom: 8 },
  actIcon:      { fontSize: 22 },
  actLabel:     { fontWeight: "700", fontSize: 14 },
  actDesc:      { fontSize: 11 },
  actCheck:     { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },

  divRow:       { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 14 },
  divLine:      { flex: 1, height: 1 },
  divBadge:     { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1 },
  divLabel:     { fontSize: 13, fontWeight: "700" },
  optPill:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  optPillTxt:   { fontSize: 10, fontWeight: "700" },

  quizHint:     { fontSize: 12, textAlign: "center", marginBottom: 16, lineHeight: 18, paddingHorizontal: 10 },

  nextBtn:      { height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 6 },
  nextTxt:      { fontSize: 16, fontWeight: "700" },
});