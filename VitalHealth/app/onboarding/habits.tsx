import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../services/firebase";
import { useTheme } from "../../context/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_LEVELS = [
  { label: "Sedentary", icon: "🪑", desc: "Little to no exercise" },
  { label: "Moderate",  icon: "🚶", desc: "Light exercise 1–3 days" },
  { label: "Active",    icon: "🏃", desc: "Hard exercise 4–5 days" },
];

const WATER_OPTIONS = ["1L", "2L", "3L", "4L", "5L", "6L"];

const pad = (n: number) => String(n).padStart(2, "0");

// Pre-built arrays — never recreated on render
const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const AMPMS   = ["AM", "PM"];

const ITEM_H  = 54;
const VISIBLE = 5;

function currentTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseTime(v: string) {
  const [hStr, mStr] = (v || currentTime()).split(":");
  const h24  = parseInt(hStr, 10) || 0;
  const m    = parseInt(mStr, 10) || 0;
  const isPM = h24 >= 12;
  const h12  = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hIdx: h12 - 1, mIdx: m, apIdx: isPM ? 1 : 0 };
}

// ─── WheelColumn ─────────────────────────────────────────────────────────────
// Uses refs for selection tracking — zero re-renders during scroll.
// Only re-renders once after snap to update the highlighted item.

const WheelColumn = memo(function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  accent,
  width = 80,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  accent: string;
  width?: number;
}) {
  const scrollRef   = useRef<ScrollView>(null);
  const currentIdx  = useRef(selectedIndex);
  const [dispIdx, setDispIdx] = useState(selectedIndex);

  // Scroll to position when picker opens (selectedIndex prop changes)
  useEffect(() => {
    currentIdx.current = selectedIndex;
    setDispIdx(selectedIndex);
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedIndex]);

  const snap = useCallback((y: number) => {
    const idx = Math.max(0, Math.min(Math.round(y / ITEM_H), items.length - 1));
    if (idx === currentIdx.current) return;
    currentIdx.current = idx;
    setDispIdx(idx);       // single re-render after gesture ends
    onSelect(idx);
    scrollRef.current?.scrollTo({ y: idx * ITEM_H, animated: true });
  }, [items.length, onSelect]);

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: "hidden" }}>
      {/* Selection bar — pure View, no state */}
      <View
        pointerEvents="none"
        style={[
          pkStyles.selBar,
          { top: ITEM_H * 2, height: ITEM_H, borderColor: accent },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        // No onScroll at all — eliminates the 60fps JS-thread flood
        onMomentumScrollEnd={e => snap(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={e   => snap(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        scrollEventThrottle={0}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={pkStyles.wheelItem}
            onPress={() => {
              currentIdx.current = i;
              setDispIdx(i);
              onSelect(i);
              scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                pkStyles.wheelTxt,
                dispIdx === i && { color: accent, fontSize: 26, fontWeight: "700" },
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

// ─── TimePicker ───────────────────────────────────────────────────────────────

const TimePicker = memo(function TimePicker({
  visible,
  value,
  accent = "#3b82f6",
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  value: string;
  accent?: string;
  onConfirm: (t: string) => void;
  onCancel: () => void;
}) {
  const [hIdx,  setHIdx]  = useState(0);
  const [mIdx,  setMIdx]  = useState(0);
  const [apIdx, setApIdx] = useState(0);

  // Parse once when modal opens
  useEffect(() => {
    if (visible) {
      const p = parseTime(value);
      setHIdx(p.hIdx);
      setMIdx(p.mIdx);
      setApIdx(p.apIdx);
    }
  }, [visible]);

  const confirm = useCallback(() => {
    const h12 = hIdx + 1;
    let h24   = h12 % 12;
    if (apIdx === 1) h24 += 12;
    onConfirm(`${pad(h24)}:${pad(mIdx)}`);
  }, [hIdx, mIdx, apIdx, onConfirm]);

  // Stable callbacks — only change when setter changes (never)
  const onHour   = useCallback((i: number) => setHIdx(i),  []);
  const onMinute = useCallback((i: number) => setMIdx(i),  []);
  const onAmPm   = useCallback((i: number) => setApIdx(i), []);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={pkStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onCancel} />
        <View style={pkStyles.sheet}>

          <View style={pkStyles.sheetHeader}>
            <Text style={pkStyles.sheetTitle}>Set Time</Text>
          </View>

          {/* Live preview — reads directly from state, no calculation */}
          <Text style={[pkStyles.preview, { color: accent }]}>
            {HOURS[hIdx]}:{MINUTES[mIdx]} {AMPMS[apIdx]}
          </Text>

          <View style={pkStyles.wheelsRow}>
            <WheelColumn items={HOURS}   selectedIndex={hIdx}  onSelect={onHour}   accent={accent} width={72} />
            <Text style={[pkStyles.colon, { color: accent }]}>:</Text>
            <WheelColumn items={MINUTES} selectedIndex={mIdx}  onSelect={onMinute} accent={accent} width={80} />
            <View style={pkStyles.divider} />
            <WheelColumn items={AMPMS}   selectedIndex={apIdx} onSelect={onAmPm}   accent={accent} width={64} />
          </View>

          <View style={pkStyles.actions}>
            <TouchableOpacity onPress={onCancel} style={pkStyles.cancelBtn}>
              <Text style={pkStyles.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} style={[pkStyles.okBtn, { backgroundColor: accent }]}>
              <Text style={pkStyles.okTxt}>Confirm</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
});

// ─── TimeField ────────────────────────────────────────────────────────────────

const TimeField = memo(function TimeField({
  label, icon, value, onChange, placeholder, colors, accent,
}: {
  label: string;
  icon: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  colors: any;
  accent: string;
}) {
  const [open, setOpen] = useState(false);

  const display = value ? (() => {
    const [hStr, mStr] = value.split(":");
    const h24  = parseInt(hStr, 10);
    const m    = parseInt(mStr, 10);
    const isPM = h24 >= 12;
    const h12  = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${pad(m)} ${isPM ? "PM" : "AM"}`;
  })() : "";

  const handleConfirm = useCallback((t: string) => {
    onChange(t);
    setOpen(false);
  }, [onChange]);

  const handleOpen   = useCallback(() => setOpen(true),  []);
  const handleCancel = useCallback(() => setOpen(false), []);

  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.fieldLabel, { color: colors.labelText }]}>{label}</Text>

      <TouchableOpacity
        style={[styles.inputWrapper, {
          backgroundColor: colors.inputBg,
          borderColor: open ? colors.inputFocusedBorder : colors.inputBorder,
        }]}
        onPress={handleOpen}
        activeOpacity={0.8}
      >
        <Text style={styles.inputIcon}>{icon}</Text>
        <Text style={[styles.input, { color: value ? colors.inputText : colors.inputPlaceholder }]}>
          {display || placeholder}
        </Text>
        <Text style={{ fontSize: 16, marginLeft: 4 }}>🕐</Text>
        {!!value && <Text style={[styles.checkIcon, { color: colors.checkIconColor }]}>✓</Text>}
      </TouchableOpacity>

      <TimePicker
        visible={open}
        value={value || currentTime()}
        accent={accent}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </View>
  );
});

// ─── Colour maps (defined at module level — never recreated) ──────────────────

const LIGHT = {
  background: "#f8fafc", card: "#ffffff", text: "#020617", subText: "#475569",
  border: "#e2e8f0", inputBg: "#ffffff", inputBorder: "#cbd5e1",
  inputFocusedBorder: "#3b82f6", inputText: "#0f172a", inputPlaceholder: "#94a3b8",
  labelText: "#334155", iconBadgeBg: "#e2e8f0", titleText: "#0f172a",
  subtitleText: "#475569", progressTrackBg: "#cbd5e1", progressFillBg: "#2563eb",
  progressText: "#64748b", nextBtnBg: "#2563eb", nextBtnText: "#ffffff",
  chipBg: "#ffffff", chipBorder: "#cbd5e1", chipText: "#334155",
  chipActiveBg: "#2563eb", chipActiveBorder: "#2563eb", chipActiveText: "#ffffff",
  sectionCardBg: "#ffffff", sectionCardBorder: "#e2e8f0", sectionTitle: "#334155",
  activityCardBg: "#ffffff", activityCardBorder: "#e2e8f0",
  activityCardActiveBorder: "#2563eb", activityLabel: "#020617", activityDesc: "#64748b",
  backText: "#2563eb", checkIconColor: "#22c55e", safeAreaBg: "#f8fafc",
  waterDrop: "#3b82f6", accent: "#2563eb",
};

const DARK = {
  background: "#040a14", card: "#0d1f38", text: "#f0f8ff", subText: "#93c5fd",
  border: "#1e3a5f", inputBg: "#0d1f38", inputBorder: "#1e3a5f",
  inputFocusedBorder: "#3b82f6", inputText: "#f0f8ff", inputPlaceholder: "#4a7fa8",
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
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Habits() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const c = theme === "light" ? LIGHT : DARK;

  const [wakeUp,    setWakeUp]    = useState("");
  const [breakfast, setBreakfast] = useState("");
  const [lunch,     setLunch]     = useState("");
  const [dinner,    setDinner]    = useState("");
  const [sleep,     setSleep]     = useState("");
  const [water,     setWater]     = useState("2L");
  const [activity,  setActivity]  = useState("");

  const goNext = async () => {
    const user = auth.currentUser;
    if (!user) { alert("User not logged in"); return; }
    try {
      await updateDoc(doc(db, "users", user.uid), {
        habits: { wakeUp, breakfast, lunch, dinner, sleep, water, activity },
        updatedAt: new Date().toISOString(),
      });
      router.push({
        pathname: "/onboarding/history",
        params: { ...params, wakeUp, breakfast, lunch, dinner, sleep, water, activity },
      });
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    // Simplest possible layout: SafeAreaView → ScrollView. Nothing else.
    // No KeyboardAvoidingView (no TextInputs on screen).
    // No Animated orbs (removed entirely — they were the #1 scroll lag cause).
    <SafeAreaView style={[styles.safe, { backgroundColor: c.safeAreaBg }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { backgroundColor: c.background }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        overScrollMode="always"
        bounces
      >

        {/* BACK */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={[styles.backArrow, { color: c.backText }]}>‹</Text>
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

        {/* DAILY SCHEDULE */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Daily Schedule</Text>
          <Text style={[styles.cardHint,  { color: c.inputPlaceholder }]}>Tap any field to set time</Text>

          <TimeField label="Wake Up"   icon="🌅" value={wakeUp}    onChange={setWakeUp}    placeholder="6:30 AM"  colors={c} accent={c.accent} />
          <TimeField label="Breakfast" icon="🍳" value={breakfast} onChange={setBreakfast} placeholder="8:00 AM"  colors={c} accent={c.accent} />
          <TimeField label="Lunch"     icon="🥗" value={lunch}     onChange={setLunch}     placeholder="1:00 PM"  colors={c} accent={c.accent} />
          <TimeField label="Dinner"    icon="🍽️" value={dinner}    onChange={setDinner}    placeholder="8:30 PM"  colors={c} accent={c.accent} />
          <TimeField label="Sleep"     icon="🌙" value={sleep}     onChange={setSleep}     placeholder="11:00 PM" colors={c} accent={c.accent} />
        </View>

        {/* WATER */}
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

        {/* ACTIVITY */}
        <View style={[styles.card, { backgroundColor: c.sectionCardBg, borderColor: c.sectionCardBorder }]}>
          <Text style={[styles.cardTitle, { color: c.sectionTitle }]}>Activity Level</Text>
          {ACTIVITY_LEVELS.map(lvl => (
            <TouchableOpacity
              key={lvl.label}
              style={[styles.actCard, {
                backgroundColor: c.activityCardBg,
                borderColor:     activity === lvl.label ? c.activityCardActiveBorder : c.activityCardBorder,
                borderWidth:     activity === lvl.label ? 1.5 : 1,
              }]}
              onPress={() => setActivity(lvl.label)}
            >
              <Text style={styles.actIcon}>{lvl.icon}</Text>
              <View>
                <Text style={[styles.actLabel, { color: c.activityLabel }]}>{lvl.label}</Text>
                <Text style={[styles.actDesc,  { color: c.activityDesc  }]}>{lvl.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* CONTINUE */}
        <TouchableOpacity style={[styles.nextBtn, { backgroundColor: c.nextBtnBg }]} onPress={goNext}>
          <Text style={[styles.nextTxt, { color: c.nextBtnText }]}>Continue</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Picker styles ────────────────────────────────────────────────────────────

const pkStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet:       { backgroundColor: "#0f172a", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Platform.OS === "ios" ? 48 : 32 },
  sheetHeader: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#1e293b", alignItems: "center" },
  sheetTitle:  { color: "#f1f5f9", fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  preview:     { textAlign: "center", fontSize: 44, fontWeight: "200", letterSpacing: -1, marginVertical: 12 },
  wheelsRow:   { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 12, marginBottom: 8 },
  colon:       { fontSize: 30, fontWeight: "300", marginHorizontal: 4, marginBottom: 4 },
  divider:     { width: 1, height: ITEM_H * VISIBLE, backgroundColor: "#1e293b", marginHorizontal: 8 },
  selBar:      { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderBottomWidth: 1, zIndex: 10 },
  wheelItem:   { height: ITEM_H, alignItems: "center", justifyContent: "center" },
  wheelTxt:    { color: "#475569", fontSize: 20, fontWeight: "400" },
  actions:     { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 4 },
  cancelBtn:   { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: "#1e293b", alignItems: "center" },
  cancelTxt:   { color: "#64748b", fontWeight: "600", fontSize: 15 },
  okBtn:       { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  okTxt:       { color: "#fff", fontWeight: "700", fontSize: 15 },
});

// ─── Main styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  flex:         { flex: 1 },
  // No flexGrow — kills scrolling by making content fill screen exactly
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
  card:         { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle:    { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  cardHint:     { fontSize: 11, marginBottom: 12 },
  fieldWrapper: { marginBottom: 10 },
  fieldLabel:   { fontSize: 11, marginBottom: 6 },
  inputWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, height: 46 },
  inputIcon:    { marginRight: 6, fontSize: 16 },
  input:        { flex: 1, fontSize: 14 },
  checkIcon:    { fontWeight: "700", marginLeft: 4 },
  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip:         { paddingHorizontal: 20, paddingVertical: 7, borderWidth: 1.5, borderRadius: 13 },
  chipTxt:      { fontSize: 14 },
  waterRow:     { flexDirection: "row", marginTop: 10 },
  drop:         { fontSize: 16, marginRight: 2 },
  actCard:      { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, marginBottom: 8 },
  actIcon:      { fontSize: 22 },
  actLabel:     { fontWeight: "700" },
  actDesc:      { fontSize: 11 },
  nextBtn:      { height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 10 },
  nextTxt:      { fontSize: 16, fontWeight: "700" },
});