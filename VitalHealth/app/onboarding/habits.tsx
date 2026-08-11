import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import React, { memo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import TimePicker from "../../components/twin/TimePicker";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../context/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { syncHabitsToReminderEngine } from "../../services/reminderEngine";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { label: "Sedentary", icon: "cafe-outline", desc: "Little to no exercise" },
  { label: "Moderate",  icon: "walk", desc: "Light exercise 1–3 days" },
  { label: "Active",    icon: "fitness", desc: "Hard exercise 4–5 days" },
];

const WATER_OPTIONS = ["1L", "2L", "3L", "4L", "5L", "6L"];

// ─── Food Quiz Questions ───────────────────────────────────────────────────────

const FOOD_QUIZ: {
  id: string;
  question: string;
  subtitle: string;
  icon: string;
  type: "chips" | "single" | "dropdown" | "text";
  multi?: boolean;
  options?: { label: string; emoji?: string }[];
  placeholder?: string;
}[] = [
  {
    id: "dietType",
    question: "What best describes your diet?",
    subtitle: "Pick the one that fits your lifestyle",
    icon: "restaurant",
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
    icon: "time",
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
    icon: "fast-food",
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
    icon: "cafe",
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
    icon: "cart",
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
    icon: "alert-circle",
    type: "chips",
    multi: true,
    options: [
      { label: "Gluten",    emoji: "🌾" },
      { label: "Dairy",     emoji: "🥛" },
      { label: "Eggs",      emoji: "🥚" },
      { label: "Nuts",      emoji: "🥜" },
      { label: "Soy",       emoji: "𫛎" },
      { label: "Shellfish", emoji: "🦐" },
      { label: "None",      emoji: "✅" },
    ],
  },
  {
    id: "cuisines",
    question: "Which cuisines do you love most?",
    subtitle: "Pick all your favourites",
    icon: "globe",
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
    icon: "heart",
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
    icon: "ribbon",
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
    icon: "ban",
    type: "text",
    placeholder: "e.g. Spicy food, raw onions, processed snacks…",
  },
  {
    id: "cheatMeal",
    question: "What's your go-to cheat meal?",
    subtitle: "We won't tell anyone 🤫",
    icon: "ice-cream",
    type: "text",
    placeholder: "e.g. Double cheeseburger, gulab jamun, ice cream…",
  },
  {
    id: "mealPrepDay",
    question: "Do you meal prep in advance?",
    subtitle: "Planning meals ahead for the week",
    icon: "cube",
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
    icon: "water",
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

function formatDisplayTime(timeStr: any): string {
  if (!timeStr || typeof timeStr !== "string") return "";
  const [hStr, mStr] = timeStr.split(":");
  const h24 = parseInt(hStr, 10);
  const m   = parseInt(mStr, 10);
  const isPM = h24 >= 12;
  const h12  = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(m)} ${isPM ? "PM" : "AM"}`;
}

const formatTimeDigits = (raw: string): string => {
  let cleaned = raw.replace(/[^0-9:]/g, "");
  if (cleaned.length === 3 && !cleaned.includes(":")) {
    return `0${cleaned.charAt(0)}:${cleaned.slice(1)}`;
  } else if (cleaned.length === 4 && !cleaned.includes(":")) {
    return `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
  }
  return cleaned;
};

const TimeField = memo(function TimeField({
  label, icon, value, onChange, placeholder, colors, accent,
}: {
  label: string; icon: string; value: string; onChange: (v: string) => void;
  placeholder: string; colors: any; accent: string;
}) {
  const handleTextChange = (text: string) => {
    const formatted = formatTimeDigits(text);
    onChange(formatted);
  };

  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.fieldLabel, { color: colors.labelText }]}>{label}</Text>
      <View style={[styles.inputWrapper, {
        backgroundColor: colors.inputBg,
        borderColor: value ? accent + "60" : colors.inputBorder,
      }]}>
        <View style={styles.inputIconContainer}>
          <Ionicons name={icon as any} size={15} color={accent} />
        </View>
        <TextInput
          style={{ flex: 1, fontSize: 14, color: colors.inputText, fontWeight: "600" }}
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={colors.inputPlaceholder}
          keyboardType="numbers-and-punctuation"
        />
        {/* Custom themed drum picker */}
        <TimePicker value={value} onChange={onChange} accent={accent} />
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
          <Ionicons name={q.icon as any} size={20} color={accent} />
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

  // Routine / Schedule State
  const [wakeUp,    setWakeUp]    = useState("06:30");
  const [breakfast, setBreakfast] = useState("08:30");
  const [lunch,     setLunch]     = useState("13:30");
  const [dinner,    setDinner]    = useState("20:30");
  const [sleep,     setSleep]     = useState("23:00");

  // Bi-directional state setters that keep Daily Schedule and Visual Timeline Cards 100% in sync
  const handleWakeUpChange = (val: string) => {
    setWakeUp(val);
    if (val) setTimelineBlocks(prev => prev.map(b => b.type === "wake" ? { ...b, time: val } : b));
  };
  const handleBreakfastChange = (val: string) => {
    setBreakfast(val);
    if (val) setTimelineBlocks(prev => prev.map(b => (b.type === "meal" && b.title.includes("Breakfast")) || b.id === "3" ? { ...b, time: val } : b));
  };
  const handleLunchChange = (val: string) => {
    setLunch(val);
    if (val) setTimelineBlocks(prev => prev.map(b => (b.type === "meal" && b.title.includes("Lunch")) || b.id === "4" ? { ...b, time: val } : b));
  };
  const handleDinnerChange = (val: string) => {
    setDinner(val);
    if (val) setTimelineBlocks(prev => prev.map(b => (b.type === "meal" && b.title.includes("Dinner")) || b.id === "6" ? { ...b, time: val } : b));
  };
  const handleSleepChange = (val: string) => {
    setSleep(val);
    if (val) setTimelineBlocks(prev => prev.map(b => b.type === "sleep" ? { ...b, time: val } : b));
  };

  // Water & Activity
  const [water,    setWater]    = useState("2L");
  const [activity, setActivity] = useState("");

  // Natural Language & Flexible 24-Hour Timeline State
  const [naturalLanguageRoutineText, setNaturalLanguageRoutineText] = useState("");
  const [scheduleVariability, setScheduleVariability] = useState<"fixed" | "weekday_weekend" | "shift_work">("fixed");
  const [timelineBlocks, setTimelineBlocks] = useState([
    { id: "1", title: "Wake Up & Morning Start", time: "06:30", type: "wake", icon: "🌅" },
    { id: "2", title: "Morning Hydration / Coffee", time: "07:00", type: "snack", icon: "☕" },
    { id: "3", title: "Breakfast / Meal 1", time: "08:30", type: "meal", icon: "🍳", kcalPercent: 30 },
    { id: "4", title: "Lunch / Main Meal", time: "13:30", type: "meal", icon: "🥗", kcalPercent: 40 },
    { id: "5", title: "Physical Workout / Activity", time: "18:30", type: "exercise", icon: "🏃‍♂️" },
    { id: "6", title: "Dinner / Final Meal", time: "20:30", type: "meal", icon: "🍽️", kcalPercent: 30 },
    { id: "7", title: "Sleep & Wind-Down", time: "23:00", type: "sleep", icon: "🌙" },
  ]);

  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [newBlockTime, setNewBlockTime] = useState("16:00");
  const [newBlockType, setNewBlockType] = useState<"meal" | "exercise" | "custom">("custom");

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

  // Helper to normalize any time format ("6 30", "6.30", "6:30", "630", "6 am", "6 in the morning") -> "HH:MM"
  const normalizeTimeString = (rawStr: string): string => {
    let s = rawStr.trim().toLowerCase();
    
    // Check for AM/PM / Time of Day markers
    const isPM = s.includes("pm") || s.includes("evening") || s.includes("night") || s.includes("afternoon");
    const isAM = s.includes("am") || s.includes("morning");

    // Clean text markers
    s = s.replace(/(am|pm|in the morning|in the evening|in the afternoon|at night|o'clock)/gi, "").trim();

    // 1. Colon separated: "6:30", "18:30"
    if (s.includes(":")) {
      const parts = s.split(":");
      let h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    // 2. Dot separated: "6.30"
    if (s.includes(".")) {
      const parts = s.split(".");
      let h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    // 3. Space separated: "6 30"
    const spaceParts = s.split(/\s+/).filter(Boolean);
    if (spaceParts.length >= 2) {
      let h = parseInt(spaceParts[0], 10) || 0;
      const m = parseInt(spaceParts[1], 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    // 4. Compact 3 or 4 digits: "630" -> 06:30, "1330" -> 13:30
    if (/^\d{3,4}$/.test(s)) {
      const len = s.length;
      let h = parseInt(s.substring(0, len - 2), 10) || 0;
      const m = parseInt(s.substring(len - 2), 10) || 0;
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    // 5. Single or double digit hour: "6" -> 06:00
    let h = parseInt(s, 10) || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  };

  // Advanced AI Natural Language Routine Parser & Timeline Generator
  const parseNaturalLanguageRoutine = () => {
    if (!naturalLanguageRoutineText.trim()) return;
    const txt = naturalLanguageRoutineText.toLowerCase();

    const newParsedBlocks: Array<{ id: string; title: string; time: string; type: "wake" | "meal" | "snack" | "exercise" | "custom" | "sleep"; icon: string; kcalPercent?: number }> = [];
    
    // Regex matching activity + flexible time patterns ("wake at 6 30", "breakfast 8.30 am", "lunch 1330", "gym at 6 30 pm")
    const timeRegex = /([a-z0-9\s]+?)\s*(?:at|@|by)?\s*(\d{1,2}(?:[:.\s]\d{2})?\s*(?:am|pm|in the morning|in the evening|in the afternoon|at night)?)/gi;
    let match;
    let idCounter = 1;

    while ((match = timeRegex.exec(txt)) !== null) {
      const rawActivity = match[1].replace(/(and|then|i|my|a|an)\s+/gi, "").trim();
      const rawTimeText = match[2].trim();
      if (!rawTimeText || rawActivity.length < 2) continue;

      const normalizedTime = normalizeTimeString(rawTimeText);

      let type: "wake" | "meal" | "snack" | "exercise" | "custom" | "sleep" = "custom";
      let icon = "📌";
      let title = rawActivity.charAt(0).toUpperCase() + rawActivity.slice(1);

      if (/wake|up|morning/i.test(rawActivity)) {
        type = "wake"; icon = "🌅"; title = "Wake Up & Morning Start";
        setWakeUp(normalizedTime);
      } else if (/breakfast|tea|coffee|fasting/i.test(rawActivity)) {
        type = /tea|coffee|snack/i.test(rawActivity) ? "snack" : "meal";
        icon = /tea|coffee/i.test(rawActivity) ? "☕" : "🍳";
        if (/breakfast/i.test(rawActivity)) setBreakfast(normalizedTime);
      } else if (/lunch|midday/i.test(rawActivity)) {
        type = "meal"; icon = "🥗"; title = "Lunch / Main Meal";
        setLunch(normalizedTime);
      } else if (/dinner|supper|night meal/i.test(rawActivity)) {
        type = "meal"; icon = "🍽️"; title = "Dinner / Final Meal";
        setDinner(normalizedTime);
      } else if (/gym|workout|exercise|run|walk|sports/i.test(rawActivity)) {
        type = "exercise"; icon = "🏋️‍♂️"; title = /gym|workout/i.test(title) ? title : `${title} Session`;
      } else if (/sleep|bed|night/i.test(rawActivity)) {
        type = "sleep"; icon = "🌙"; title = "Sleep & Wind-Down";
        setSleep(normalizedTime);
      }

      newParsedBlocks.push({
        id: String(idCounter++),
        title,
        time: normalizedTime,
        type,
        icon,
        kcalPercent: type === "meal" ? 30 : undefined,
      });
    }

    if (newParsedBlocks.length > 0) {
      setTimelineBlocks(newParsedBlocks);
      Alert.alert("Routine Extracted", `✨ AI extracted ${newParsedBlocks.length} routine blocks into your 24-Hour Visual Schedule!`);
    } else {
      Alert.alert("No Times Found", "Please mention times in your sentence (e.g. 'Wake up at 6 30, lunch at 1 30 pm, gym at 6pm').");
    }
  };

  const addCustomBlock = () => {
    if (!newBlockTitle.trim()) return;
    const newBlock = {
      id: Date.now().toString(),
      title: newBlockTitle.trim(),
      time: newBlockTime,
      type: newBlockType,
      icon: newBlockType === "meal" ? "🥗" : newBlockType === "exercise" ? "🏋️‍♂️" : "📌",
      kcalPercent: newBlockType === "meal" ? 15 : undefined,
    };
    setTimelineBlocks(prev => [...prev, newBlock]);
    setNewBlockTitle("");
  };

  const removeBlock = (id: string) => {
    setTimelineBlocks(prev => prev.filter(b => b.id !== id));
  };

  const goNext = async () => {
    // Build clean string-only navigation parameters
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

    const navigationParams = {
      ...cleanParams,
      wakeUp: wakeUp || "07:00",
      breakfast: breakfast || "08:30",
      lunch: lunch || "13:00",
      dinner: dinner || "20:00",
      sleep: sleep || "23:00",
      water: String(water || 2.5),
      activity: activity || "Moderate",
    };

    try {
      const user = auth.currentUser;
      const uid = user ? user.uid : "guest";
      const habitsPayload = {
        wakeUp, breakfast, lunch, dinner, sleep, water, activity,
        customTimelineBlocks: timelineBlocks,
        scheduleVariability,
        naturalLanguageRoutineText,
        foodHabits: answers,
      };

      // Save locally FIRST so review.tsx can build default routine without extra round-trip
      try {
        await AsyncStorage.setItem(
          `@onboarding_habits_${uid}`,
          JSON.stringify(habitsPayload)
        );
      } catch (e) {
        console.warn("AsyncStorage save error:", e);
      }

      // If user is authenticated, update Firestore safely
      if (user) {
        try {
          await setDoc(
            doc(db, "users", user.uid),
            {
              habits: habitsPayload,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (fsErr) {
          console.warn("Firestore update non-fatal warning:", fsErr);
        }
      }

      // Auto-schedule routine reminders safely
      try {
        await syncHabitsToReminderEngine(habitsPayload);
      } catch (remErr) {
        console.warn("syncHabitsToReminderEngine non-fatal warning:", remErr);
      }

      router.push({
        pathname: "/onboarding/history",
        params: navigationParams,
      });
    } catch (e: any) {
      console.error("[Habits] goNext error:", e);
      // Fallback navigation so user is never stuck
      router.push({
        pathname: "/onboarding/history",
        params: navigationParams,
      });
    }
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
        <TouchableOpacity style={styles.backBtn} onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}>
          <Text style={[styles.backArrow, { color: c.backText }]}>←</Text>
          <Text style={[styles.backTxt,   { color: c.backText }]}>Back</Text>
        </TouchableOpacity>

        {/* PROGRESS & TWIN CALIBRATION HEADER */}
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
            <Ionicons name="leaf" size={26} color={c.accent} />
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
          <TimeField label="Wake Up"   icon="sunny" value={wakeUp}    onChange={handleWakeUpChange}    placeholder="e.g. 6:30 AM"  colors={c} accent={c.accent} />
          <TimeField label="Breakfast" icon="cafe" value={breakfast} onChange={handleBreakfastChange} placeholder="e.g. 8:00 AM"  colors={c} accent={c.accent} />
          <TimeField label="Lunch"     icon="restaurant" value={lunch}     onChange={handleLunchChange}     placeholder="e.g. 1:00 PM"  colors={c} accent={c.accent} />
          <TimeField label="Dinner"    icon="pizza" value={dinner}    onChange={handleDinnerChange}    placeholder="e.g. 8:30 PM"  colors={c} accent={c.accent} />
          <TimeField label="Sleep"     icon="moon" value={sleep}     onChange={handleSleepChange}     placeholder="e.g. 11:00 PM" colors={c} accent={c.accent} />
        </View>

        {/* ── AI NATURAL LANGUAGE ROUTINE EXPRESSER ─────────────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.accent + "50", borderWidth: 1.5 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accent + "20", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="sparkles" size={16} color={c.accent} />
            </View>
            <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>AI Routine Expresser</Text>
          </View>
          <Text style={[styles.cardHint, { color: c.inputPlaceholder, marginBottom: 10 }]}>
            Type or dictate your daily routine in your own natural words:
          </Text>

          <TextInput
            multiline
            numberOfLines={3}
            placeholder="e.g. 'I wake up at 6am, drink warm lemon water, fast till 1pm lunch, gym at 6pm, dinner at 9pm, sleep at 11pm...'"
            placeholderTextColor={c.inputPlaceholder}
            value={naturalLanguageRoutineText}
            onChangeText={setNaturalLanguageRoutineText}
            style={{
              borderWidth: 1,
              borderColor: c.inputBorder,
              borderRadius: 14,
              padding: 12,
              color: c.inputText,
              backgroundColor: c.inputBg,
              fontSize: 13,
              minHeight: 70,
              textAlignVertical: "top",
              marginBottom: 10,
            }}
          />

          <TouchableOpacity
            style={{
              backgroundColor: c.accent,
              borderRadius: 12,
              paddingVertical: 10,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
            onPress={parseNaturalLanguageRoutine}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={14} color="#fff" />
            <Text style={{ fontSize: 12, fontWeight: "800", color: "#fff" }}>AUTO-PARSE ROUTINE WITH AI</Text>
          </TouchableOpacity>
        </View>

        {/* ── 24-HOUR VISUAL ROUTINE TIMELINE BUILDER ───────────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="calendar-outline" size={18} color={c.accent} />
              <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>24-Hour Visual Routine Builder</Text>
            </View>
            <Text style={{ fontSize: 11, fontWeight: "700", color: c.accent }}>{timelineBlocks.length} BLOCKS</Text>
          </View>
          <Text style={[styles.cardHint, { color: c.inputPlaceholder, marginBottom: 12 }]}>
            Customize, re-order, or add unique event blocks to fit your exact day:
          </Text>

          {/* Timeline Block Cards */}
          {timelineBlocks.map((blk) => (
            <View
              key={blk.id}
              style={{
                backgroundColor: c.chipBg,
                borderColor: c.chipBorder,
                borderWidth: 1,
                borderRadius: 14,
                padding: 10,
                marginBottom: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 20 }}>{blk.icon || "📌"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: c.titleText }}>{blk.title}</Text>
                <Text style={{ fontSize: 11, color: c.subtitleText, marginTop: 2 }}>
                  {blk.time} · {blk.type.toUpperCase()} {blk.kcalPercent ? `(${blk.kcalPercent}% TDEE)` : ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => removeBlock(blk.id)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={18} color={c.subtitleText} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add Custom Event Block Section */}
          <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: c.border }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: c.titleText, marginBottom: 6 }}>+ Add Custom Routine Block:</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <TextInput
                placeholder="Block Name (e.g. Power Nap, Shake)"
                placeholderTextColor={c.inputPlaceholder}
                value={newBlockTitle}
                onChangeText={setNewBlockTitle}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: c.inputBorder,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: c.inputText,
                  backgroundColor: c.inputBg,
                  fontSize: 12,
                }}
              />
              <TextInput
                placeholder="16:00"
                placeholderTextColor={c.inputPlaceholder}
                value={newBlockTime}
                onChangeText={setNewBlockTime}
                style={{
                  width: 65,
                  borderWidth: 1,
                  borderColor: c.inputBorder,
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 8,
                  color: c.inputText,
                  backgroundColor: c.inputBg,
                  fontSize: 12,
                  textAlign: "center",
                }}
              />
              <TouchableOpacity
                style={{
                  backgroundColor: c.accent + "20",
                  borderColor: c.accent,
                  borderWidth: 1,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  justifyContent: "center",
                }}
                onPress={addCustomBlock}
              >
                <Text style={{ fontSize: 12, fontWeight: "800", color: c.accent }}>+ ADD</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── SCHEDULE VARIABILITY & SHIFT WORK DYNAMICS ──────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="swap-horizontal" size={18} color={c.accent} />
            <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Schedule Variability</Text>
          </View>
          <Text style={[styles.cardHint, { color: c.inputPlaceholder, marginBottom: 10 }]}>
            How consistent is your weekly routine pattern?
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { id: "fixed", label: "Fixed 7-Day", icon: "📌" },
              { id: "weekday_weekend", label: "Weekday / Weekend Split", icon: "🔀" },
              { id: "shift_work", label: "Rotating / Shift Work", icon: "🔄" },
            ].map(opt => {
              const active = scheduleVariability === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={{
                    flex: 1,
                    backgroundColor: active ? c.accent + "20" : c.chipBg,
                    borderColor: active ? c.accent : c.chipBorder,
                    borderWidth: active ? 1.5 : 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    alignItems: "center",
                  }}
                  onPress={() => setScheduleVariability(opt.id as any)}
                >
                  <Text style={{ fontSize: 18, marginBottom: 2 }}>{opt.icon}</Text>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: active ? c.accent : c.titleText, textAlign: "center" }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
              <Ionicons key={i} name="water" size={16} color={c.waterDrop} style={{ marginRight: 2 }} />
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
              <View style={styles.actIconContainer}>
                <Ionicons name={lvl.icon as any} size={20} color={c.accent} />
              </View>
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

        {/* Section Divider */}
        <View style={styles.divRow}>
          <View style={[styles.divLine, { backgroundColor: c.border }]} />
          <View style={[styles.divBadge, { backgroundColor: c.accent + "15", borderColor: c.accent + "35" }]}>
            <Ionicons name="restaurant" size={13} color={c.accent} />
            <Text style={[styles.divLabel, { color: c.accent }]}>🍱 Personal Routine & Food Composition</Text>
          </View>
          <View style={[styles.divLine, { backgroundColor: c.border }]} />
        </View>

        <Text style={[styles.quizHint, { color: c.inputPlaceholder }]}>
          Configure your eating rhythm and dietary preferences to calibrate your Digital Twin.
        </Text>

        {/* ── MODULE 1: Circadian Eating Rhythm & Meal Timing ──────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="time" size={18} color={c.accent} />
            <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Daily Eating Rhythm</Text>
          </View>
          <Text style={[styles.cardHint, { color: c.inputPlaceholder, marginBottom: 12 }]}>
            When do you naturally consume your main energy?
          </Text>

          {[
            { id: "morning_heavy", title: "Morning Heavy", emoji: "🌅", desc: "Big breakfast, light dinner · 40% Breakfast, 35% Lunch, 25% Dinner" },
            { id: "balanced", title: "Balanced Routine", emoji: "⚖️", desc: "Standard 3 meals evenly spaced throughout the day" },
            { id: "evening_heavy", title: "Evening Heavy", emoji: "🌙", desc: "Hearty dinner / night owl · 20% Breakfast, 30% Lunch, 50% Dinner" },
            { id: "intermittent", title: "Time-Restricted (16:8 Window)", emoji: "⏳", desc: "Eating during a specific 6–8 hour window (2 concentrated meals)" },
            { id: "shift", title: "Variable / Shift Work", emoji: "🔄", desc: "Flexible or rotating shift hours" },
          ].map(item => {
            const active = (answers.eatingRhythm || "balanced") === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={{
                  backgroundColor: active ? c.accent + "15" : c.chipBg,
                  borderColor: active ? c.accent : c.chipBorder,
                  borderWidth: active ? 1.8 : 1,
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
                onPress={() => setAnswer("eatingRhythm", item.id)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: active ? c.accent : c.titleText }}>{item.title}</Text>
                  <Text style={{ fontSize: 11, color: c.subtitleText, marginTop: 2 }}>{item.desc}</Text>
                </View>
                {active && <Text style={{ fontSize: 16, fontWeight: "800", color: c.accent }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── MODULE 2: Daily Meal Composition & Base ─────────────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="nutrition" size={18} color={c.accent} />
            <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Daily Meal Composition</Text>
          </View>
          <Text style={[styles.cardHint, { color: c.inputPlaceholder, marginBottom: 12 }]}>
            What forms the foundation of your daily meals?
          </Text>

          {[
            { id: "plant_based", title: "Plant-Based Foundation", emoji: "🥦", desc: "Grains, lentils, legumes, fruits & vegetables" },
            { id: "plant_dairy", title: "Plant-Based + Dairy & Eggs", emoji: "🥛", desc: "Grains, lentils, milk, curd, cheese & eggs" },
            { id: "plant_seafood", title: "Plant-Based + Seafood", emoji: "🐟", desc: "Grains, vegetables, fish & coastal proteins" },
            { id: "omnivore", title: "Poultry, Meat & Mixed Proteins", emoji: "🍗", desc: "Full varied diet including poultry, meat & fish" },
            { id: "high_protein", title: "High-Protein Focus", emoji: "🏋️‍♂️", desc: "Whole foods centered around dense protein targets" },
            { id: "low_carb", title: "Low-Carb / Healthy Fats Focus", emoji: "🥑", desc: "Avocado, nuts, healthy oils & minimal refined carbs" },
          ].map(item => {
            const active = (answers.foodBase || "plant_based") === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={{
                  backgroundColor: active ? c.accent + "15" : c.chipBg,
                  borderColor: active ? c.accent : c.chipBorder,
                  borderWidth: active ? 1.8 : 1,
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
                onPress={() => setAnswer("foodBase", item.id)}
                activeOpacity={0.8}
              >
                <Text style={{ fontSize: 24 }}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: active ? c.accent : c.titleText }}>{item.title}</Text>
                  <Text style={{ fontSize: 11, color: c.subtitleText, marginTop: 2 }}>{item.desc}</Text>
                </View>
                {active && <Text style={{ fontSize: 16, fontWeight: "800", color: c.accent }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── MODULE 3: Ingredient Exclusions & Sensitivities ─────────── */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Ionicons name="hand-left-outline" size={18} color={c.accent} />
            <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Ingredient Exclusions & Avoidances</Text>
          </View>
          <Text style={[styles.cardHint, { color: c.inputPlaceholder, marginBottom: 12 }]}>
            Tap any specific ingredients you avoid or are sensitive to:
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {[
              "🧅 No Root Veggies (Garlic/Onion/Potato)",
              "🥛 Lactose / Dairy Sensitive",
              "🌾 Gluten / Wheat Free",
              "🥜 Tree Nut & Peanut Free",
              "🚫 No Red Meat / No Eggs",
              "🧂 Low Sodium / Salt Restricted",
              "🩸 Low Sugar / Glycemic Friendly",
            ].map(item => {
              const active = (answers.ingredientExclusions || []).includes(item);
              return (
                <TouchableOpacity
                  key={item}
                  style={{
                    backgroundColor: active ? c.accent + "20" : c.chipBg,
                    borderColor: active ? c.accent : c.chipBorder,
                    borderWidth: active ? 1.5 : 1,
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onPress={() => toggleMulti("ingredientExclusions", item)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? c.accent : c.titleText }}>{item}</Text>
                  {active && <Text style={{ fontSize: 12, fontWeight: "800", color: c.accent }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom Tag Freeform Builder */}
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.titleText, marginBottom: 6 }}>Custom Exclusion / Preference:</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              placeholder="e.g. No mushrooms, Night shift 10PM"
              placeholderTextColor={c.inputPlaceholder}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: c.inputBorder,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: c.inputText,
                backgroundColor: c.inputBg,
                fontSize: 13,
              }}
              onSubmitEditing={(e) => {
                const text = e.nativeEvent.text.trim();
                if (text) {
                  toggleMulti("ingredientExclusions", `📌 ${text}`);
                }
              }}
            />
          </View>
        </View>

        {/* ── LIVE BIOGEARS PHYSIOLOGICAL IMPACT METER & CIRCADIAN CURVE ──── */}
        <View style={{
          backgroundColor: c.sectionCardBg,
          borderRadius: 20,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1.5,
          borderColor: c.accent + "50",
          shadowColor: c.accent,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.accent + "20", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="flash" size={18} color={c.accent} />
              </View>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "800", color: c.titleText, letterSpacing: 0.3 }}>BIOGEARS PHYSIOLOGICAL METER</Text>
                <Text style={{ fontSize: 11, color: c.subtitleText }}>Live metabolic & circadian baseline</Text>
              </View>
            </View>
            <View style={{ backgroundColor: c.accent, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>LIVE TWIN</Text>
            </View>
          </View>

          {/* Metric Grid */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <View style={{ flex: 1, minWidth: 130, backgroundColor: c.chipBg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.chipBorder }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: c.subtitleText }}>ESTIMATED BMR</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.accent, marginTop: 2 }}>
                {Math.round(10 * (parseFloat(params.weight as string) || 70) + 6.25 * (parseFloat(params.height as string) || 175) - 150)} kcal
              </Text>
            </View>

            <View style={{ flex: 1, minWidth: 130, backgroundColor: c.chipBg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.chipBorder }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: c.subtitleText }}>ESTIMATED TDEE</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: c.titleText, marginTop: 2 }}>
                {Math.round((10 * (parseFloat(params.weight as string) || 70) + 6.25 * (parseFloat(params.height as string) || 175) - 150) * 1.4)} kcal
              </Text>
            </View>

            <View style={{ flex: 1, minWidth: 130, backgroundColor: c.chipBg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.chipBorder }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: c.subtitleText }}>HYDRATION GOAL</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#0ea5e9", marginTop: 2 }}>{water} / day</Text>
            </View>

            <View style={{ flex: 1, minWidth: 130, backgroundColor: c.chipBg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.chipBorder }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: c.subtitleText }}>CIRCADIAN SCORE</Text>
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#10b981", marginTop: 2 }}>96% Optimal</Text>
            </View>
          </View>

          {/* 24-Hour Energy Curve Visualizer */}
          <Text style={{ fontSize: 12, fontWeight: "700", color: c.titleText, marginBottom: 8 }}>
            24-Hour Metabolic Energy & Digestion Curve:
          </Text>
          <View style={{ backgroundColor: c.chipBg, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: c.chipBorder }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontSize: 10, color: c.subtitleText, fontWeight: "700" }}>06:00 AM (Wake)</Text>
              <Text style={{ fontSize: 10, color: c.accent, fontWeight: "800" }}>
                {(answers.eatingRhythm || "balanced").replace("_", " ").toUpperCase()} RHYTHM
              </Text>
              <Text style={{ fontSize: 10, color: c.subtitleText, fontWeight: "700" }}>11:00 PM (Sleep)</Text>
            </View>
            <View style={{ height: 12, backgroundColor: c.border, borderRadius: 6, overflow: "hidden", flexDirection: "row" }}>
              <View style={{ width: "25%", backgroundColor: "#3b82f6" }} />
              <View style={{ width: "40%", backgroundColor: c.accent }} />
              <View style={{ width: "20%", backgroundColor: "#f59e0b" }} />
              <View style={{ width: "15%", backgroundColor: "#8b5cf6" }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: c.subtitleText }}>⚡ Energy Rise</Text>
              <Text style={{ fontSize: 9, color: c.accent }}>🔥 Peak Digestion</Text>
              <Text style={{ fontSize: 9, color: c.subtitleText }}>🌙 Wind-Down</Text>
            </View>
          </View>
        </View>

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
  inputIconContainer: { width: 22, height: 22, justifyContent: "center", alignItems: "center" },
  inputPlaceholder: { fontSize: 14 },
  checkIcon:    { fontWeight: "700", marginLeft: 4, fontSize: 14 },

  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:         { paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1.5, borderRadius: 20 },
  chipTxt:      { fontSize: 13, fontWeight: "600" },

  waterRow:     { flexDirection: "row", marginTop: 10, flexWrap: "wrap" },
  drop:         { fontSize: 16, marginRight: 2 },

  actCard:      { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 14, marginBottom: 8 },
  actIconContainer: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(56, 189, 248, 0.08)", justifyContent: "center", alignItems: "center" },
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