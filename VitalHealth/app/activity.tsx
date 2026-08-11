// app/activity.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Activity Lab — logs exercise sessions and syncs burned calories to
// NutritionContext so Calorie Intelligence shows the real net balance.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router"; 
import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { ActivityEntry, useNutrition } from "../context/NutritionContext";
import { useProfile } from "../context/ProfileContext";
import { useTheme } from "../context/ThemeContext";
import { useBiogearsTwin } from "../context/BiogearsTwinContext";
import { useFamily } from "../context/FamilyContext";
import TimePicker from "../components/twin/TimePicker";
import { useStackBackHandler } from "../hooks/useStackBackHandler";

// ─── MET table ───────────────────────────────────────────────────────────────
// MET (Metabolic Equivalent of Task) values per activity per intensity level
// Source: Compendium of Physical Activities
const MET_TABLE: Record<string, Record<string, number>> = {
  // Popular
  Running:       { Low: 7.0,  Moderate: 9.8,  High: 11.5, Max: 14.5 },
  Walking:       { Low: 2.5,  Moderate: 3.5,  High: 4.5,  Max: 5.0  },
  Cycling:       { Low: 4.0,  Moderate: 6.8,  High: 9.5,  Max: 12.0 },
  Swimming:      { Low: 5.0,  Moderate: 7.0,  High: 9.5,  Max: 11.0 },
  Weightlifting: { Low: 3.0,  Moderate: 5.0,  High: 6.0,  Max: 8.0  },
  Yoga:          { Low: 2.0,  Moderate: 2.5,  High: 3.5,  Max: 4.0  },
  // Sports
  Football:      { Low: 5.0,  Moderate: 7.0,  High: 9.0,  Max: 11.0 },
  Basketball:    { Low: 4.5,  Moderate: 6.5,  High: 8.0,  Max: 10.0 },
  Tennis:        { Low: 5.0,  Moderate: 7.3,  High: 9.0,  Max: 11.0 },
  Badminton:     { Low: 4.5,  Moderate: 6.0,  High: 7.5,  Max: 9.0  },
  Cricket:       { Low: 3.5,  Moderate: 5.0,  High: 6.5,  Max: 8.0  },
  Golf:          { Low: 2.5,  Moderate: 3.5,  High: 4.5,  Max: 5.0  },
  Padel:         { Low: 5.0,  Moderate: 7.0,  High: 9.0,  Max: 11.0 },
  Volleyball:    { Low: 3.0,  Moderate: 4.0,  High: 6.0,  Max: 8.0  },
  "Table Tennis":{ Low: 3.0,  Moderate: 4.0,  High: 5.5,  Max: 7.0  },
  Baseball:      { Low: 4.0,  Moderate: 5.0,  High: 6.0,  Max: 7.5  },
  Rugby:         { Low: 6.0,  Moderate: 8.3,  High: 10.5, Max: 13.0 },
  Boxing:        { Low: 6.0,  Moderate: 9.0,  High: 11.5, Max: 14.0 },
  "Martial Arts":{ Low: 5.0,  Moderate: 8.0,  High: 10.5, Max: 13.0 },
  "Ice Skating": { Low: 5.0,  Moderate: 7.0,  High: 9.0,  Max: 11.5 },
  Skiing:        { Low: 5.0,  Moderate: 7.0,  High: 9.0,  Max: 12.0 },
  Surfing:       { Low: 3.0,  Moderate: 5.0,  High: 7.0,  Max: 9.0  },
  // Fitness
  HIIT:          { Low: 7.0,  Moderate: 9.0,  High: 11.0, Max: 14.0 },
  Crossfit:      { Low: 6.0,  Moderate: 9.0,  High: 11.5, Max: 14.5 },
  Pilates:       { Low: 2.5,  Moderate: 3.5,  High: 4.5,  Max: 6.0  },
  Rowing:        { Low: 4.5,  Moderate: 7.0,  High: 9.5,  Max: 12.0 },
  Dance:         { Low: 3.0,  Moderate: 5.0,  High: 7.0,  Max: 9.0  },
  Climbing:      { Low: 5.5,  Moderate: 8.0,  High: 10.0, Max: 12.0 },
  "Jump Rope":   { Low: 7.0,  Moderate: 10.0, High: 12.0, Max: 14.0 },
  Elliptical:    { Low: 4.0,  Moderate: 6.0,  High: 8.0,  Max: 10.0 },
  // Recovery
  Meditation:    { Low: 1.0,  Moderate: 1.2,  High: 1.5,  Max: 2.0  },
  Stretching:    { Low: 1.5,  Moderate: 2.0,  High: 2.5,  Max: 3.0  },
  "Tai Chi":     { Low: 2.0,  Moderate: 2.8,  High: 3.5,  Max: 4.0  },
  // Outdoor
  Hiking:        { Low: 4.0,  Moderate: 5.5,  High: 7.0,  Max: 9.0  },
  Trekking:      { Low: 4.5,  Moderate: 6.0,  High: 8.0,  Max: 10.0 },
  "Rock Climb":  { Low: 5.5,  Moderate: 8.0,  High: 10.0, Max: 12.0 },
  "Trail Run":   { Low: 7.0,  Moderate: 9.5,  High: 11.5, Max: 14.0 },
  Skating:       { Low: 4.5,  Moderate: 6.5,  High: 9.0,  Max: 11.0 },
};

// ─── Activity database ────────────────────────────────────────────────────────
type ActivityItem = { name: string; icon: string };
type ActivityMap  = Record<string, ActivityItem[]>;

const activities: ActivityMap = {
  Popular: [
    { name: "Running",       icon: "run" },
    { name: "Walking",       icon: "walk"  },
    { name: "Cycling",       icon: "bicycle" },
    { name: "Swimming",      icon: "swim" },
    { name: "Weightlifting", icon: "weight-lifter" },
    { name: "Yoga",          icon: "yoga"  },
  ],
  Sports: [
    { name: "Football",      icon: "soccer"  },
    { name: "Basketball",    icon: "basketball"  },
    { name: "Tennis",        icon: "tennis"  },
    { name: "Badminton",     icon: "badminton"  },
    { name: "Cricket",       icon: "cricket"  },
    { name: "Golf",          icon: "golf"  },
    { name: "Padel",         icon: "tennis"  },
    { name: "Volleyball",    icon: "volleyball"  },
    { name: "Table Tennis",  icon: "table-tennis"  },
    { name: "Baseball",      icon: "baseball"  },
    { name: "Rugby",         icon: "rugby"  },
    { name: "Boxing",        icon: "boxing-glove"  },
    { name: "Martial Arts",  icon: "karate"  },
    { name: "Ice Skating",   icon: "ice-skating"  },
    { name: "Skiing",        icon: "skiing"  },
    { name: "Surfing",       icon: "surfing" },
  ],
  Fitness: [
    { name: "HIIT",          icon: "lightning-bolt"  },
    { name: "Crossfit",      icon: "weight"  },
    { name: "Pilates",       icon: "yoga"  },
    { name: "Rowing",        icon: "rowing"  },
    { name: "Dance",         icon: "music"  },
    { name: "Climbing",      icon: "climbing"  },
    { name: "Jump Rope",     icon: "jump-rope"  },
    { name: "Elliptical",    icon: "walk"  },
  ],
  Recovery: [
    { name: "Meditation",    icon: "brain"  },
    { name: "Stretching",    icon: "walk"  },
    { name: "Tai Chi",       icon: "yin-yang"  },
  ],
  Outdoor: [
    { name: "Hiking",        icon: "hiking"  },
    { name: "Trekking",      icon: "mountain"  },
    { name: "Rock Climb",    icon: "climbing"  },
    { name: "Trail Run",     icon: "pine-tree"  },
    { name: "Skating",       icon: "roller-skate"  },
  ],
};

// ─── Calorie burn formula ─────────────────────────────────────────────────────
// kcal = MET × weightKg × durationHours
function calcBurn(activityName: string, intensity: string, durationMins: number, weightKg: number): number {
  const met = MET_TABLE[activityName]?.[intensity] ?? 4.0;
  return Math.round(met * weightKg * (durationMins / 60));
}

// ─── Intensity config ─────────────────────────────────────────────────────────
const intensities = [
  { name: "Low",      color: "#22c55e", description: "Easy pace, can hold a conversation" },
  { name: "Moderate", color: "#38bdf8", description: "Somewhat hard, slightly breathless"  },
  { name: "High",     color: "#f97316", description: "Hard effort, difficult to talk"       },
  { name: "Max",      color: "#ef4444", description: "All-out, cannot sustain long"         },
];

const ACTIVITY_COLORS: Record<string, string> = {
  Running:       "#ef4444",
  Walking:       "#38bdf8",
  Cycling:       "#f97316",
  Swimming:      "#06b6d4",
  Weightlifting: "#a78bfa",
  Yoga:          "#10b981",

  Football:      "#22c55e",
  Basketball:    "#f59e0b",
  Tennis:        "#84cc16",
  Badminton:     "#14b8a6",
  Cricket:       "#eab308",
  Golf:          "#a855f7",
  Padel:         "#6366f1",
  Volleyball:    "#ec4899",
  "Table Tennis":"#f43f5e",
  Baseball:      "#fb7185",
  Rugby:         "#9a3412",
  Boxing:        "#dc2626",
  "Martial Arts":"#b91c1c",
  "Ice Skating": "#22d3ee",
  Skiing:        "#38bdf8",
  Surfing:       "#0284c7",

  HIIT:          "#f43f5e",
  Crossfit:      "#8b5cf6",
  Pilates:       "#10b981",
  Rowing:        "#0ea5e9",
  Dance:         "#ec4899",
  Climbing:      "#b45309",
  "Jump Rope":   "#f97316",
  Elliptical:    "#64748b",

  Meditation:    "#6366f1",
  Stretching:    "#059669",
  "Tai Chi":     "#14b8a6",

  Hiking:        "#15803d",
  Trekking:      "#047857",
  "Rock Climb":  "#7c2d12",
  "Trail Run":   "#b45309",
  Skating:       "#6366f1",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ActivityLab() {
  useStackBackHandler();
  const router  = useRouter();
  const { theme } = useTheme();
  const { weightKg: parentWeight } = useProfile();
  const { activeProfile, isSwitched } = useFamily();
  const weightKg = isSwitched && activeProfile?.weight
    ? (parseFloat(String(activeProfile.weight).replace(/[^0-9.]/g, "")) || 60)
    : parentWeight;
  const {
    activityEntries,
    addActivityEntry,
    removeActivityEntry,
    totals,
    totalActivityCalories,
    netCalories,
    selectedProfile,
  } = useNutrition();

  const { addEvent } = useBiogearsTwin();

  const colors = theme === "light"
    ? { bg: "#f8fafc", card: "#ffffff", text: "#020617", subText: "#64748b", accent: "#0ea5e9", border: "#e2e8f0", active: "#0ea5e9" }
    : { bg: "#020617", card: "#111827", text: "#ffffff", subText: "#94a3b8", accent: "#38bdf8", border: "#1e293b", active: "#38bdf8" };

  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState("Running");
  const [duration,  setDuration]  = useState(30);
  const [intensity, setIntensity] = useState("Moderate");
  const [showLog,   setShowLog]   = useState(false);

  // Start time — defaults to current time, editable by user
  const nowTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [startTime, setStartTime] = useState(nowTime);

  // Selected activity icon
  const selectedIcon = useMemo(() => {
    for (const list of Object.values(activities)) {
      const found = list.find((a) => a.name === selected);
      if (found) return found.icon;
    }
    return "run";
  }, [selected]);

  // Live calorie preview
  const previewBurn = useMemo(
    () => calcBurn(selected, intensity, duration, weightKg),
    [selected, intensity, duration, weightKg]
  );

  // Filtered grid
  const filtered: ActivityMap = useMemo(() => {
    if (!search) return activities;
    const result: ActivityMap = {};
    Object.entries(activities).forEach(([cat, list]) => {
      const match = list.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));
      if (match.length) result[cat] = match;
    });
    return result;
  }, [search]);

  const selectedIntensity = intensities.find((i) => i.name === intensity)!;
  const met = MET_TABLE[selected]?.[intensity] ?? 4.0;

  // Net calorie status after logging this session
  const projectedNet = Math.max(0, totals.calories - totalActivityCalories - previewBurn);
  const surplus = totals.calories - selectedProfile.recommendations.calories + totalActivityCalories;

  const handleConfirm = () => {
    // Log to Nutrition Context
    addActivityEntry({
      activityName:   selected,
      activityIcon:   selectedIcon,
      durationMins:   duration,
      intensity:      intensity as ActivityEntry["intensity"],
      caloriesBurned: previewBurn,
      met,
    });

    // Log to BioGears Digital Twin
    // BioGears ExerciseData.GenericExercise.Intensity expects a value in [0.0, 1.0].
    // We normalize MET → BioGears intensity using the linear map:
    //   intensity = (MET - 1) / (MET_MAX - 1), clamped to [0.05, 1.0]
    // MET reference: 1.0 = rest, ~14 = max sprint.  BioGears: 0.0 = rest, 1.0 = max.
    try {
      const wallTime = startTime; // Use user-selected start time
      const rawMet = MET_TABLE[selected]?.[intensity] ?? 4.0;
      const MET_MAX = 14.0;   // upper bound of our MET table (sprint / HIIT max)
      const biogears_intensity = Math.max(0.05, Math.min(1.0, (rawMet - 1.0) / (MET_MAX - 1.0)));

      addEvent({
        event_type: "exercise",
        value: parseFloat(biogears_intensity.toFixed(3)),
        duration_seconds: duration * 60,
        wallTime,
        displayLabel: `${selected} · ${duration} min (${intensity})`,
        displayIcon: selectedIcon,
      });
    } catch (error) {
      console.error("BioGears Activity Sync Error:", error);
    }

    Alert.alert(
      "✅ Activity Logged!",
      `${selectedIcon} ${selected} — ${previewBurn} kcal burned in ${duration} min`,
      [
        { text: "View Log", onPress: () => router.push({ pathname: "/(tabs)/history", params: { tab: "exercise" } } as any) },
        { text: "Done", onPress: () => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } } },
      ]
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { if (router.canGoBack()) { router.back(); } else { router.replace("/(tabs)"); } }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>ACTIVITY</Text>
          <Text style={[styles.sub, { color: colors.subText }]}>Kinetic calibration mode</Text>
        </View>
        <TouchableOpacity
          style={[styles.logBtn, { backgroundColor: colors.accent + "20", borderColor: colors.accent + "40" }]}
          onPress={() => setShowLog(!showLog)}
        >
          <Ionicons name="list" size={18} color={colors.accent} />
          {activityEntries.length > 0 && (
            <View style={styles.logBadge}>
              <Text style={styles.logBadgeText}>{activityEntries.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 220 }}>

        {/* ── CALORIE SUMMARY BANNER ─────────────────────────────────────── */}
        <View style={[styles.summaryBanner, { backgroundColor: colors.card }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: "#a78bfa" }]}>{totals.calories}</Text>
            <Text style={[styles.summaryLabel, { color: colors.subText }]}>Eaten</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: "#22c55e" }]}>{totalActivityCalories}</Text>
            <Text style={[styles.summaryLabel, { color: colors.subText }]}>Burned</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: netCalories > selectedProfile.recommendations.calories ? "#ef4444" : "#f97316" }]}>
              {netCalories}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.subText }]}>Net kcal</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.accent }]}>{selectedProfile.recommendations.calories}</Text>
            <Text style={[styles.summaryLabel, { color: colors.subText }]}>Target</Text>
          </View>
        </View>

        {/* ── TODAY'S ACTIVITY LOG ────────────────────────────────────────── */}
        {showLog && (
          <View style={[styles.logCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.logTitle, { color: colors.text }]}>Today's Activity Log</Text>
            {activityEntries.length === 0 ? (
              <Text style={[styles.logEmpty, { color: colors.subText }]}>No activities logged yet.</Text>
            ) : (
              activityEntries.map((entry) => (
                <View key={entry.id} style={[styles.logRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.logIconContainer}>
                    {entry.activityIcon.length > 2 ? (
                      <MaterialCommunityIcons name={entry.activityIcon as any} size={22} color={colors.accent} />
                    ) : (
                      <Text style={{ fontSize: 22 }}>{entry.activityIcon}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.logRowName, { color: colors.text }]}>
                      {entry.activityName}
                      <Text style={[styles.logRowIntensity, { color: intensities.find(i => i.name === entry.intensity)?.color }]}>
                        {" "}· {entry.intensity}
                      </Text>
                    </Text>
                    <Text style={[styles.logRowDetail, { color: colors.subText }]}>
                      {entry.durationMins} min · MET {entry.met.toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.logRowRight}>
                    <Text style={[styles.logRowCal, { color: "#22c55e" }]}>−{entry.caloriesBurned} kcal</Text>
                    <TouchableOpacity onPress={() => removeActivityEntry(entry.id)}>
                      <Ionicons name="close-circle" size={20} color={colors.subText} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            {activityEntries.length > 0 && (
              <View style={[styles.logTotal, { borderTopColor: colors.border }]}>
                <Text style={[styles.logTotalLabel, { color: colors.subText }]}>Total burned today</Text>
                <Text style={[styles.logTotalValue, { color: "#22c55e" }]}>{totalActivityCalories} kcal</Text>
              </View>
            )}
          </View>
        )}

        {/* ── SEARCH ──────────────────────────────────────────────────────── */}
        <View style={[styles.search, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={20} color={colors.accent} />
          <TextInput
            placeholder="Search activity..."
            placeholderTextColor={colors.subText}
            value={search}
            onChangeText={setSearch}
            style={[styles.input, { color: colors.text }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.subText} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── ACTIVITY GRID ────────────────────────────────────────────────── */}
        {Object.entries(filtered).map(([cat, list]) => (
          <View key={cat}>
            {!search && (
              <Text style={[styles.cat, { color: colors.subText }]}>{cat.toUpperCase()}</Text>
            )}
            <View style={styles.grid}>
              {list.map((a) => {
                const active = selected === a.name;
                const actColor = ACTIVITY_COLORS[a.name] ?? colors.accent;
                return (
                  <TouchableOpacity
                    key={a.name}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor:     active ? actColor : colors.border,
                        borderWidth:     1.5,
                      },
                    ]}
                    onPress={() => setSelected(a.name)}
                  >
                    <View style={[styles.gridIconContainer, { backgroundColor: active ? actColor + "25" : actColor + "10" }]}>
                      <MaterialCommunityIcons name={a.icon as any} size={26} color={actColor} />
                    </View>
                    <Text style={[styles.cardText, { color: colors.text }]}>{a.name}</Text>
                    {active && (
                      <Text style={[styles.cardMet, { color: actColor }]}>
                        MET {MET_TABLE[a.name]?.[intensity]?.toFixed(1) ?? "?"}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* ── CONTROL DECK ────────────────────────────────────────────────── */}
        <View style={[styles.deck, { backgroundColor: colors.card }]}>

          {/* Duration */}
          <Text style={[styles.deckTitle, { color: colors.subText }]}>TIME HORIZON</Text>
          <Text style={[styles.duration, { color: colors.accent }]}>{duration} MIN</Text>
          <Slider
            minimumValue={5}
            maximumValue={180}
            step={5}
            value={duration}
            onValueChange={setDuration}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <View style={styles.presets}>
            {[15, 30, 60, 90].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.presetBtn, { backgroundColor: duration === p ? colors.accent : colors.bg }]}
                onPress={() => setDuration(p)}
              >
                <Text style={{ color: duration === p ? "#fff" : colors.accent, fontWeight: "700" }}>
                  {p}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Intensity */}
          <Text style={[styles.deckTitle, { color: colors.subText }]}>EXERTION LEVEL</Text>
          <View style={styles.intensityRow}>
            {intensities.map((i) => (
              <TouchableOpacity
                key={i.name}
                onPress={() => setIntensity(i.name)}
                style={[
                  styles.intensityBtn,
                  { backgroundColor: intensity === i.name ? i.color : colors.bg },
                ]}
              >
                <Text style={{ color: intensity === i.name ? "#fff" : colors.subText, fontWeight: "600" }}>
                  {i.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedIntensity && (
            <Text style={[styles.intensityDesc, { color: colors.subText }]}>
              {selectedIntensity.description}
            </Text>
          )}

          {/* Start Time */}
          <Text style={[styles.deckTitle, { color: colors.subText, marginTop: 16 }]}>START TIME</Text>
          <View style={[styles.timeRow, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
            <Text style={[styles.timeLabel, { color: colors.subText }]}>Exercise started at</Text>
            <TimePicker value={startTime} onChange={setStartTime} accent={colors.accent} />
          </View>
          <Text style={[styles.timeHint, { color: colors.subText }]}>
            Used for BioGears physiological timing
          </Text>
        </View>

        {/* ── LIVE CALORIE PREVIEW CARD ────────────────────────────────────── */}
        <LinearGradient
          colors={["rgba(34,197,94,0.12)", "rgba(56,189,248,0.08)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.previewCard}
        >
          {/* Selected activity + burn */}
          <View style={styles.previewTop}>
            <View style={styles.previewIconContainer}>
              {selectedIcon.length > 2 ? (
                <MaterialCommunityIcons name={selectedIcon as any} size={32} color="#fff" />
              ) : (
                <Text style={{ fontSize: 32 }}>{selectedIcon}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewActivity}>{selected}</Text>
              <Text style={[styles.previewSub, { color: selectedIntensity.color }]}>
                {intensity} · MET {met.toFixed(1)} · {duration} min
              </Text>
            </View>
            <View style={styles.previewBurnBox}>
              <Text style={styles.previewBurnLabel}>YOU'LL BURN</Text>
              <Text style={styles.previewBurnValue}>{previewBurn}</Text>
              <Text style={styles.previewBurnUnit}>kcal</Text>
            </View>
          </View>

          {/* Calorie impact breakdown */}
          <View style={styles.previewBreakdown}>
            <View style={styles.previewBreakdownItem}>
              <Text style={styles.previewBreakdownNum}>{totals.calories}</Text>
              <Text style={styles.previewBreakdownLabel}>Eaten today</Text>
            </View>
            <Ionicons name="remove" size={16} color="rgba(255,255,255,0.3)" />
            <View style={styles.previewBreakdownItem}>
              <Text style={[styles.previewBreakdownNum, { color: "#22c55e" }]}>
                {totalActivityCalories + previewBurn}
              </Text>
              <Text style={styles.previewBreakdownLabel}>Burned (incl. this)</Text>
            </View>
            <Ionicons name="remove" size={16} color="rgba(255,255,255,0.3)" />
            <View style={styles.previewBreakdownItem}>
              <Text style={[styles.previewBreakdownNum, { color: projectedNet > selectedProfile.recommendations.calories ? "#ef4444" : "#f97316" }]}>
                {projectedNet}
              </Text>
              <Text style={styles.previewBreakdownLabel}>Net after this</Text>
            </View>
            <Ionicons name="remove" size={16} color="rgba(255,255,255,0.3)" />
            <View style={styles.previewBreakdownItem}>
              <Text style={[styles.previewBreakdownNum, { color: "#a78bfa" }]}>
                {selectedProfile.recommendations.calories}
              </Text>
              <Text style={styles.previewBreakdownLabel}>Daily target</Text>
            </View>
          </View>

          {/* Status message */}
          <View style={styles.previewStatus}>
            {projectedNet > selectedProfile.recommendations.calories ? (
              <>
                <Ionicons name="flame" size={16} color="#ef4444" />
                <Text style={[styles.previewStatusText, { color: "#ef4444" }]}>
                  Still {projectedNet - selectedProfile.recommendations.calories} kcal over target after this session
                </Text>
              </>
            ) : totals.calories === 0 ? (
              <>
                <Ionicons name="restaurant-outline" size={16} color="#4fc3f7" />
                <Text style={[styles.previewStatusText, { color: "#4fc3f7" }]}>
                  No food logged yet — log meals to see your net balance
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={[styles.previewStatusText, { color: "#22c55e" }]}>
                  Great! After this session you'll be within your calorie target 🎯
                </Text>
              </>
            )}
          </View>

          {/* Per-kg note */}
          <Text style={styles.previewNote}>
            Calculated for {weightKg} kg · kcal = MET × {weightKg} × {(duration / 60).toFixed(2)} hr
          </Text>
        </LinearGradient>

      </ScrollView>

      {/* ── FOOTER CONFIRM ────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        {/* Burn summary chip */}
        <View style={styles.footerChip}>
          <Ionicons name="flame" size={16} color="#22c55e" />
          <Text style={styles.footerChipText}>
            Logs <Text style={{ color: "#22c55e", fontWeight: "900" }}>{previewBurn} kcal</Text> burn
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.confirm, { backgroundColor: colors.accent }]}
          onPress={handleConfirm}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.confirmText}>
            LOG {selected.toUpperCase()} · {duration}M · {previewBurn} KCAL
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title:  { fontWeight: "900", letterSpacing: 1, fontSize: 18 },
  sub:    { fontSize: 12, marginTop: 1 },
  logBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", borderWidth: 1, position: "relative" },
  logBadge: { position: "absolute", top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: "#ef4444", justifyContent: "center", alignItems: "center" },
  logBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  summaryBanner: { flexDirection: "row", borderRadius: 20, padding: 16, marginBottom: 16, alignItems: "center" },
  summaryItem:   { flex: 1, alignItems: "center" },
  summaryValue:  { fontSize: 20, fontWeight: "900" },
  summaryLabel:  { fontSize: 10, marginTop: 2 },
  summaryDivider:{ width: 1, height: 36, backgroundColor: "rgba(255,255,255,0.08)" },

  logCard:  { borderRadius: 20, padding: 16, marginBottom: 16 },
  logTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  logEmpty: { fontSize: 13, textAlign: "center", paddingVertical: 12 },
  logRow:   { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  logIconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(56, 189, 248, 0.08)", justifyContent: "center", alignItems: "center" },
  logRowName: { fontSize: 14, fontWeight: "600" },
  logRowIntensity: { fontSize: 12, fontWeight: "500" },
  logRowDetail: { fontSize: 11, marginTop: 2 },
  logRowRight: { alignItems: "flex-end", gap: 4 },
  logRowCal: { fontSize: 14, fontWeight: "800" },
  logTotal:  { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, borderTopWidth: 1, marginTop: 4 },
  logTotalLabel: { fontSize: 13, fontWeight: "600" },
  logTotalValue: { fontSize: 15, fontWeight: "900" },

  search: { flexDirection: "row", borderRadius: 30, padding: 14, marginBottom: 20, alignItems: "center", gap: 10 },
  input:  { flex: 1 },

  cat:  { marginBottom: 8, marginTop: 4, letterSpacing: 2, fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 2,
    gap: 2,
  },
  gridIconContainer: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(56, 189, 248, 0.06)", justifyContent: "center", alignItems: "center", marginBottom: 4 },
  cardText: { fontSize: 11, textAlign: "center" },
  cardMet:  { fontSize: 9, fontWeight: "700" },

  deck:      { borderRadius: 32, padding: 20, marginTop: 8 },
  deckTitle: { marginTop: 12, marginBottom: 6, fontSize: 11, letterSpacing: 1 },
  duration:  { fontSize: 32, fontWeight: "900" },
  presets:   { flexDirection: "row", justifyContent: "space-between", marginTop: 8, marginBottom: 4 },
  presetBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },

  intensityRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, gap: 6 },
  intensityBtn: { flex: 1, paddingVertical: 10, borderRadius: 20, alignItems: "center" },
  intensityDesc:{ fontSize: 11, marginTop: 8, textAlign: "center", fontStyle: "italic" },

  // Start time picker
  timeRow:  { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  timeLabel:{ flex: 1, fontSize: 13, fontWeight: "500" },
  timeHint: { fontSize: 10, marginTop: 6, marginBottom: 4, fontStyle: "italic" },

  previewCard: {
    borderRadius: 28,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.2)",
  },
  previewTop:      { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  previewIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  previewActivity: { color: "#fff", fontSize: 18, fontWeight: "800" },
  previewSub:      { fontSize: 12, marginTop: 2, fontWeight: "600" },
  previewBurnBox:  { alignItems: "center", backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 16, padding: 10 },
  previewBurnLabel:{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 },
  previewBurnValue:{ color: "#22c55e", fontSize: 32, fontWeight: "900", lineHeight: 34 },
  previewBurnUnit: { color: "rgba(255,255,255,0.4)", fontSize: 10 },

  previewBreakdown:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 12, marginBottom: 12 },
  previewBreakdownItem: { alignItems: "center" },
  previewBreakdownNum:  { color: "#fff", fontSize: 16, fontWeight: "900" },
  previewBreakdownLabel:{ color: "rgba(255,255,255,0.35)", fontSize: 9, marginTop: 2, textAlign: "center" },

  previewStatus:    { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  previewStatusText:{ flex: 1, fontSize: 12, fontWeight: "600", lineHeight: 16 },
  previewNote:      { color: "rgba(255,255,255,0.2)", fontSize: 10 },

  footer:         { position: "absolute", bottom: 20, left: 16, right: 16, gap: 8 },
  footerChip:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(34,197,94,0.1)", borderRadius: 20, paddingVertical: 6 },
  footerChipText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
  confirm:        { padding: 18, borderRadius: 30, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  confirmText:    { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.5 },
});