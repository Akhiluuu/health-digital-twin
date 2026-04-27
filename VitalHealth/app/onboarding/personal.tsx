import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
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
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";
import { useTheme } from "../../context/ThemeContext";
import { auth, db } from "../../services/firebase";

// ─── Icons ──────────────────────────────────────────────────────────────────

function UserIcon({ color = "#64748b", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

function BadgeIcon({ color = "#64748b", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="16" rx="3" stroke={color} strokeWidth="2" />
      <Circle cx="9" cy="10" r="2" stroke={color} strokeWidth="1.5" />
      <Path d="M13 10h4M13 14h4M5 14h6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

function PhoneIcon({ color = "#64748b", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
        stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function CalendarIcon({ color = "#64748b", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="4" width="18" height="18" rx="3" stroke={color} strokeWidth="2" />
      <Line x1="3" y1="9" x2="21" y2="9" stroke={color} strokeWidth="2" />
      <Line x1="8" y1="2" x2="8" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="16" y1="2" x2="16" y2="6" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Path d="M7 13h2v2H7zM11 13h2v2h-2zM15 13h2v2h-2zM7 17h2v2H7zM11 17h2v2h-2z" fill={color} />
    </Svg>
  );
}

function ChevronLeftIcon({ color = "#64748b", size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronRightIcon({ color = "#64748b", size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Calendar Picker Modal ───────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function CalendarPicker({
  visible,
  value,
  onConfirm,
  onCancel,
  colors,
}: {
  visible: boolean;
  value: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
  colors: any;
}) {
  const today = new Date();

  const parseInitial = () => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return { year: y, month: m - 1, day: d };
    }
    return { year: today.getFullYear() - 20, month: today.getMonth(), day: today.getDate() };
  };

  const init = parseInitial();
  const [viewYear,  setViewYear]  = useState(init.year);
  const [viewMonth, setViewMonth] = useState(init.month);
  const [selDay,    setSelDay]    = useState(init.day);
  const [mode,      setMode]      = useState<"calendar" | "month" | "year">("calendar");

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      const i = parseInitial();
      setViewYear(i.year);
      setViewMonth(i.month);
      setSelDay(i.day);
      setMode("calendar");
    }
  }, [visible]);

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstDay    = (y: number, m: number) => new Date(y, m, 1).getDay();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
    // ✅ reset day selection when navigating away
    setSelDay(1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
    // ✅ reset day selection when navigating away
    setSelDay(1);
  };

  const selectDay = (d: number) => setSelDay(d);

  // ✅ FIX: confirm always uses current viewYear + viewMonth + selDay
  const confirm = () => {
    // clamp selDay in case month has fewer days (e.g. Jan 31 → Feb → only 28 days)
    const maxDay = daysInMonth(viewYear, viewMonth);
    const safeDay = Math.min(selDay, maxDay);
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(safeDay).padStart(2, "0");
    onConfirm(`${viewYear}-${mm}-${dd}`);
  };

  const yearRange = Array.from({ length: 100 }, (_, i) => today.getFullYear() - i);

  const totalCells = firstDay(viewYear, viewMonth) + daysInMonth(viewYear, viewMonth);
  const rows = Math.ceil(totalCells / 7);

  // ✅ selected = selDay in the currently viewed month/year
  const isSelected = (d: number) => d === selDay;

  const isToday = (d: number) =>
    d === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={calStyles.overlay}>
        <View style={[calStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>

          {/* Header */}
          <View style={calStyles.header}>
            <Text style={[calStyles.headerTitle, { color: colors.text }]}>Select Date</Text>
          </View>

          {mode === "calendar" && (
            <>
              {/* Month / Year nav */}
              <View style={calStyles.navRow}>
                <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn}>
                  <ChevronLeftIcon color={colors.subText} size={22} />
                </TouchableOpacity>

                <View style={calStyles.navCenter}>
                  <TouchableOpacity
                    onPress={() => setMode("month")}
                    style={[calStyles.navChip, { backgroundColor: colors.inputBg }]}
                  >
                    <Text style={[calStyles.navChipText, { color: colors.accent }]}>
                      {MONTHS[viewMonth]}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMode("year")}
                    style={[calStyles.navChip, { backgroundColor: colors.inputBg }]}
                  >
                    <Text style={[calStyles.navChipText, { color: colors.accent }]}>
                      {viewYear}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn}>
                  <ChevronRightIcon color={colors.subText} size={22} />
                </TouchableOpacity>
              </View>

              {/* Day labels */}
              <View style={calStyles.dayLabels}>
                {DAYS.map(d => (
                  <Text key={d} style={[calStyles.dayLabel, { color: colors.subText }]}>{d}</Text>
                ))}
              </View>

              {/* Grid */}
              <View style={calStyles.grid}>
                {Array.from({ length: rows * 7 }).map((_, i) => {
                  const day = i - firstDay(viewYear, viewMonth) + 1;
                  const valid = day >= 1 && day <= daysInMonth(viewYear, viewMonth);
                  const selected = valid && isSelected(day);
                  const todayCell = valid && isToday(day);

                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        calStyles.cell,
                        selected  && { backgroundColor: colors.accent, borderRadius: 10 },
                        !selected && todayCell && { borderWidth: 1.5, borderColor: colors.accent, borderRadius: 10 },
                      ]}
                      onPress={() => valid && selectDay(day)}
                      activeOpacity={valid ? 0.7 : 1}
                    >
                      <Text style={[
                        calStyles.cellText,
                        { color: selected ? "#fff" : valid ? colors.text : "transparent" },
                        todayCell && !selected && { color: colors.accent, fontWeight: "700" },
                      ]}>
                        {valid ? day : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selected display */}
              <View style={[calStyles.selectedBar, { backgroundColor: colors.inputBg }]}>
                <CalendarIcon color={colors.accent} size={15} />
                <Text style={[calStyles.selectedText, { color: colors.text }]}>
                  {`  ${MONTHS[viewMonth].slice(0, 3)} ${String(selDay).padStart(2, "0")}, ${viewYear}`}
                </Text>
              </View>
            </>
          )}

          {/* Month picker */}
          {mode === "month" && (
            <View style={calStyles.gridPicker}>
              {MONTHS.map((m, i) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    calStyles.pickerChip,
                    { backgroundColor: i === viewMonth ? colors.accent : colors.inputBg },
                  ]}
                  onPress={() => {
                    setViewMonth(i);
                    setSelDay(1); // ✅ reset day when switching month
                    setMode("calendar");
                  }}
                >
                  <Text style={{
                    color: i === viewMonth ? "#fff" : colors.text,
                    fontWeight: "600", fontSize: 13,
                  }}>
                    {m.slice(0, 3)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Year picker */}
          {mode === "year" && (
            <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
              <View style={calStyles.gridPicker}>
                {yearRange.map(y => (
                  <TouchableOpacity
                    key={y}
                    style={[
                      calStyles.pickerChip,
                      { backgroundColor: y === viewYear ? colors.accent : colors.inputBg },
                    ]}
                    onPress={() => {
                      setViewYear(y);
                      setSelDay(1); // ✅ reset day when switching year
                      setMode("calendar");
                    }}
                  >
                    <Text style={{
                      color: y === viewYear ? "#fff" : colors.text,
                      fontWeight: "600", fontSize: 13,
                    }}>
                      {y}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Actions */}
          <View style={calStyles.actions}>
            <TouchableOpacity
              style={[calStyles.actionBtn, { borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[calStyles.actionTxt, { color: colors.subText }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[calStyles.actionBtn, { backgroundColor: colors.accent }]}
              onPress={confirm}
            >
              <Text style={[calStyles.actionTxt, { color: "#fff" }]}>Confirm</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function Personal() {
  const router = useRouter();
  const { theme } = useTheme();

  const colors =
    theme === "light"
      ? {
          bg:             "#f8fafc",
          card:           "#ffffff",
          border:         "#e2e8f0",
          text:           "#020617",
          subText:        "#64748b",
          accent:         "#2563eb",
          accentLight:    "#dbeafe",
          inputBg:        "#f1f5f9",
          inputBorder:    "#e2e8f0",
          focusBorder:    "#2563eb",
          placeholder:    "#94a3b8",
          progressBg:     "#e2e8f0",
          genderBg:       "#f1f5f9",
          genderSelected: "#2563eb",
          orb1:           "#3b82f6",
          orb2:           "#8b5cf6",
          orb3:           "#06b6d4",
        }
      : {
          bg:             "#0f172a",
          card:           "#1e293b",
          border:         "#334155",
          text:           "#f1f5f9",
          subText:        "#94a3b8",
          accent:         "#3b82f6",
          accentLight:    "#1e3a8a",
          inputBg:        "#1e293b",
          inputBorder:    "#334155",
          focusBorder:    "#3b82f6",
          placeholder:    "#4a7fa8",
          progressBg:     "#334155",
          genderBg:       "#1e293b",
          genderSelected: "#3b82f6",
          orb1:           "#3b82f6",
          orb2:           "#8b5cf6",
          orb3:           "#06b6d4",
        };

  const { signupName, signupEmail } = useLocalSearchParams<{
    signupName: string;
    signupEmail: string;
  }>();

  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [phone,       setPhone]       = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender,      setGender]      = useState("");
  const [showCal,     setShowCal]     = useState(false);

  const [firstFocused, setFirstFocused] = useState(false);
  const [lastFocused,  setLastFocused]  = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const orb1Y = useRef(new Animated.Value(0)).current;
  const orb2Y = useRef(new Animated.Value(0)).current;
  const orb3Y = useRef(new Animated.Value(0)).current;

  const scrollRef    = useRef<ScrollView>(null);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef  = useRef<TextInput>(null);
  const phoneRef     = useRef<TextInput>(null);

  // ✅ Fabric-safe scroll
  const scrollToField = (ref: React.RefObject<TextInput>) => {
    ref.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
      scrollRef.current?.scrollTo({ y: pageY - 140, animated: true });
    });
  };

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

  const handleNext = async () => {
    const user = auth.currentUser;
    if (!user) { alert("User not logged in"); return; }

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !dateOfBirth.trim() || !gender.trim()) {
      alert("Please fill all fields");
      return;
    }

    const dobRegex = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
    if (!dobRegex.test(dateOfBirth)) {
      alert("Please select a valid date of birth");
      return;
    }

    try {
      await updateDoc(doc(db, "users", user.uid), {
        firstName, lastName, phone, dateOfBirth, gender,
        updatedAt: new Date().toISOString(),
      });
      router.push({
        pathname: "/onboarding/medical",
        params: { signupName, signupEmail, firstName, lastName, phone, dateOfBirth, gender },
      });
    } catch (error: any) {
      alert(error.message);
    }
  };

  // Format display: "25 Jan 2000"
  const dobDisplay = () => {
    if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return "";
    const [y, m, d] = dateOfBirth.split("-").map(Number);
    return `${String(d).padStart(2,"0")} ${MONTHS[m-1].slice(0,3)} ${y}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>

      {/* Orbs */}
      <Animated.View pointerEvents="none" style={[styles.orb, styles.orb1, { backgroundColor: colors.orb1, transform: [{ translateY: orb1Y }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.orb2, { backgroundColor: colors.orb2, transform: [{ translateY: orb2Y }] }]} />
      <Animated.View pointerEvents="none" style={[styles.orb, styles.orb3, { backgroundColor: colors.orb3, transform: [{ translateY: orb3Y }] }]} />

      {/* Calendar Modal */}
      <CalendarPicker
        visible={showCal}
        value={dateOfBirth}
        onConfirm={(date) => { setDateOfBirth(date); setShowCal(false); }}
        onCancel={() => setShowCal(false)}
        colors={colors}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.inner}
        >

          {/* Progress */}
          <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: colors.progressBg }]}>
              <View style={[styles.progressFill, { width: "33%", backgroundColor: colors.accent }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.subText }]}>Step 1 of 3</Text>
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={styles.iconEmoji}>👤</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Personal Info</Text>
            <Text style={[styles.subtitle, { color: colors.subText }]}>
              Enter your personal details to get started
            </Text>
            <Text style={[styles.privacyNote, { color: colors.subText }]}>
              Including DOB for age-specific health insights
            </Text>
          </View>

          {/* First Name */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>First Name</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: firstFocused ? colors.focusBorder : colors.inputBorder }]}>
              <UserIcon color={firstFocused ? colors.focusBorder : colors.subText} size={18} />
              <TextInput
                ref={firstNameRef}
                placeholder="e.g. John"
                placeholderTextColor={colors.placeholder}
                value={firstName}
                onChangeText={setFirstName}
                style={[styles.input, { color: colors.text }]}
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                blurOnSubmit={false}
                onFocus={() => { setFirstFocused(true); scrollToField(firstNameRef); }}
                onBlur={() => setFirstFocused(false)}
              />
            </View>
          </View>

          {/* Last Name */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Last Name</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: lastFocused ? colors.focusBorder : colors.inputBorder }]}>
              <BadgeIcon color={lastFocused ? colors.focusBorder : colors.subText} size={18} />
              <TextInput
                ref={lastNameRef}
                placeholder="e.g. Doe"
                placeholderTextColor={colors.placeholder}
                value={lastName}
                onChangeText={setLastName}
                style={[styles.input, { color: colors.text }]}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                blurOnSubmit={false}
                onFocus={() => { setLastFocused(true); scrollToField(lastNameRef); }}
                onBlur={() => setLastFocused(false)}
              />
            </View>
          </View>

          {/* Phone */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Phone</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: phoneFocused ? colors.focusBorder : colors.inputBorder }]}>
              <PhoneIcon color={phoneFocused ? colors.focusBorder : colors.subText} size={18} />
              <TextInput
                ref={phoneRef}
                placeholder="e.g. 9876543210"
                placeholderTextColor={colors.placeholder}
                value={phone}
                onChangeText={setPhone}
                style={[styles.input, { color: colors.text }]}
                keyboardType="phone-pad"
                returnKeyType="done"
                blurOnSubmit
                onFocus={() => { setPhoneFocused(true); scrollToField(phoneRef); }}
                onBlur={() => setPhoneFocused(false)}
              />
            </View>
          </View>

          {/* Date of Birth — tappable, opens calendar */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Date of Birth</Text>
            <TouchableOpacity
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: showCal ? colors.focusBorder : colors.inputBorder,
                },
              ]}
              onPress={() => setShowCal(true)}
              activeOpacity={0.8}
            >
              <CalendarIcon color={showCal ? colors.focusBorder : colors.subText} size={18} />
              <Text style={[
                styles.input,
                { color: dateOfBirth ? colors.text : colors.placeholder, paddingVertical: 0 },
              ]}>
                {dobDisplay() || "Select your date of birth"}
              </Text>
              <ChevronRightIcon color={colors.subText} size={16} />
            </TouchableOpacity>
            <Text style={[styles.fieldHint, { color: colors.subText }]}>
              Tap to open calendar picker
            </Text>
          </View>

          {/* Gender */}
          <View style={styles.fieldWrapper}>
            <Text style={[styles.fieldLabel, { color: colors.text }]}>Gender</Text>
            <View style={styles.genderContainer}>
              {["Male", "Female", "Other"].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderButton,
                    {
                      backgroundColor: gender === g ? colors.genderSelected : colors.genderBg,
                      borderColor:     gender === g ? colors.accent          : colors.inputBorder,
                    },
                  ]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderButtonText, { color: gender === g ? "#ffffff" : colors.subText }]}>
                    {g === "Male" ? "♂ Male" : g === "Female" ? "♀ Female" : "⚧ Other"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Continue */}
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.accent }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>Continue →</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:        { flex: 1 },
  inner:            { padding: 24, paddingBottom: 120 },
  orb:              { position: "absolute", borderRadius: 100, opacity: 0.1 },
  orb1:             { width: 200, height: 200, top: -40,   left: -60  },
  orb2:             { width: 150, height: 150, top: "30%", right: -50 },
  orb3:             { width: 180, height: 180, bottom: 80, left: -40  },
  progressRow:      { marginBottom: 24 },
  progressTrack:    { height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
  progressFill:     { height: "100%", borderRadius: 2 },
  progressLabel:    { fontSize: 13, fontWeight: "500" },
  header:           { alignItems: "center", marginBottom: 28 },
  iconBadge:        { width: 64, height: 64, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  iconEmoji:        { fontSize: 28 },
  title:            { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginBottom: 6 },
  subtitle:         { fontSize: 13, textAlign: "center", lineHeight: 20, marginBottom: 4 },
  privacyNote:      { fontSize: 12, textAlign: "center", opacity: 0.7 },
  fieldWrapper:     { marginBottom: 18 },
  fieldLabel:       { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  fieldHint:        { fontSize: 11, marginTop: 4, opacity: 0.7 },
  inputWrapper:     { flexDirection: "row", alignItems: "center", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1.5, gap: 10 },
  input:            { flex: 1, fontSize: 15 },
  genderContainer:  { flexDirection: "row", gap: 10 },
  genderButton:     { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1.5 },
  genderButtonText: { fontSize: 13, fontWeight: "600" },
  nextBtn:          { marginTop: 10, paddingVertical: 16, borderRadius: 16, alignItems: "center", shadowColor: "#3b82f6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  nextBtnText:      { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
});

const calStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: "#00000088", justifyContent: "center", padding: 20 },
  sheet:        { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 12 },
  header:       { alignItems: "center", marginBottom: 4 },
  headerTitle:  { fontSize: 17, fontWeight: "700" },
  navRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navBtn:       { padding: 6 },
  navCenter:    { flexDirection: "row", gap: 8 },
  navChip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  navChipText:  { fontSize: 14, fontWeight: "700" },
  dayLabels:    { flexDirection: "row", justifyContent: "space-around", marginBottom: 4 },
  dayLabel:     { width: 36, textAlign: "center", fontSize: 12, fontWeight: "600" },
  grid:         { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-around", gap: 2 },
  cell:         { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  cellText:     { fontSize: 14, fontWeight: "500" },
  selectedBar:  { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 10, borderRadius: 10, marginTop: 4 },
  selectedText: { fontSize: 14, fontWeight: "600" },
  gridPicker:   { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingVertical: 8 },
  pickerChip:   { width: "28%", paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  actions:      { flexDirection: "row", gap: 12, marginTop: 8 },
  actionBtn:    { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center", borderWidth: 1.5 },
  actionTxt:    { fontSize: 15, fontWeight: "700" },
});