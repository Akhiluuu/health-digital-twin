/**
 * BodyMap — Simplified human body silhouette with organ health markers.
 * Organs are placed anatomically and color-coded by their health score.
 * Tapping an organ shows its component vitals in a bottom-sheet style overlay.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, ScrollView, Pressable } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle, Line, G, Polyline, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

const W = Dimensions.get('window').width;
const BODY_H = 340;
const BODY_W = 180;

interface OrganData {
  score: number;
  status: string;
}

interface Props {
  scores: Record<string, OrganData>;
  c: any; // theme colors
  lastVitals?: any;
  sessions?: any[];
  profile?: any;
}

interface OrganPlacement {
  key: string;
  label: string;
  emoji: string;
  x: number; // center x of dot
  y: number; // center y of dot
  detail: string;
  icon: string;
}

const ORGANS: OrganPlacement[] = [
  { key: 'brain',  label: 'Brain',  emoji: '🧠', x: 90,  y: 32,  detail: 'Core temperature stability · MAP regulation', icon: 'settings' },
  { key: 'heart',  label: 'Heart',  emoji: '🫀', x: 98,  y: 105, detail: 'HR · Systolic BP · Diastolic BP · Cardiac Output', icon: 'heart' },
  { key: 'lungs',  label: 'Lungs',  emoji: '🫁', x: 82,  y: 102, detail: 'SpO₂ · Respiration rate · Tidal volume', icon: 'thermometer' },
  { key: 'liver',  label: 'Liver',  emoji: '🟤', x: 82,  y: 145, detail: 'Glucose metabolism · Active physical output', icon: 'flash' },
  { key: 'gut',    label: 'Gut',    emoji: '🦠', x: 98,  y: 165, detail: 'Nutritional digestion · Core body temperature', icon: 'restaurant' },
  { key: 'legs',   label: 'Legs',   emoji: '🦵', x: 76,  y: 240, detail: 'Peripheral stroke volume · Muscle exercise load', icon: 'walk' },
];

const LEFT_ORGANS: OrganPlacement[] = [
  { key: 'lungs',  label: 'Lungs',  emoji: '🫁', x: 82,  y: 102, detail: 'SpO₂ · Respiration rate · Tidal volume', icon: 'thermometer' },
  { key: 'liver',  label: 'Liver',  emoji: '🟤', x: 82,  y: 145, detail: 'Glucose metabolism · Active physical output', icon: 'flash' },
  { key: 'legs',   label: 'Legs',   emoji: '🦵', x: 76,  y: 240, detail: 'Peripheral stroke volume · Muscle exercise load', icon: 'walk' },
];

const RIGHT_ORGANS: OrganPlacement[] = [
  { key: 'brain',  label: 'Brain',  emoji: '🧠', x: 90,  y: 32,  detail: 'Core temperature stability · MAP regulation', icon: 'settings' },
  { key: 'heart',  label: 'Heart',  emoji: '🫀', x: 98,  y: 105, detail: 'HR · Systolic BP · Diastolic BP · Cardiac Output', icon: 'heart' },
  { key: 'gut',    label: 'Gut',    emoji: '🦠', x: 98,  y: 165, detail: 'Nutritional digestion · Core body temperature', icon: 'restaurant' },
];

// Connector line endpoints — where dashed lines point to (left card or right card boundary)
const ORGAN_TARGETS: Record<string, { x2: number, y2: number }> = {
  lungs: { x2: 0,   y2: 60  },   // → left card, top row
  liver: { x2: 0,   y2: 170 },   // → left card, middle row
  legs:  { x2: 0,   y2: 280 },   // → left card, bottom row
  brain: { x2: 180, y2: 60  },   // → right card, top row
  heart: { x2: 180, y2: 170 },   // → right card, middle row
  gut:   { x2: 180, y2: 280 },   // → right card, bottom row
};

function statusColor(status?: string): string {
  const norm = (status || '').toLowerCase();
  if (norm === 'critical' || norm === 'poor') return '#ef4444'; // Red
  if (norm === 'warning' || norm === 'fair') return '#f59e0b'; // Amber
  return '#10b981'; // Green
}

const LiverIcon = ({ size, color, style }: { size: number; color: string; style?: any }) => (
  <View style={style}>
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M89.38,27.894c-4.961-1.701-10.136-2.604-15.381-2.684l-13.64-0.206c-0.496-0.131-2.139-0.618-7.255-2.385 C48.071,20.881,42.821,20,37.5,20C19.58,20,5,34.58,5,52.5v0.412l1.47,6.617c0.683,3.073,1.03,6.229,1.03,9.379 C7.5,75.024,12.476,80,18.592,80c2.59,0,5.112-0.913,7.101-2.571l11.002-9.168c0.936-0.781,1.998-1.372,3.157-1.758l7.281-2.427 c3.179-1.06,5.918-2.973,7.969-5.523c5.153,2.092,11.208,1.862,16.179-0.625c8.156-4.078,15.364-9.601,21.422-16.417l0.197-0.221 C94.254,39.765,95,37.802,95,35.763C95,32.209,92.742,29.047,89.38,27.894z"
        fill={color}
      />
    </Svg>
  </View>
);

export default function BodyMap({ scores, c, lastVitals, sessions = [], profile }: Props) {
  const [selected, setSelected] = useState<OrganPlacement | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'advice' | 'history'>('stats');

  const selectedData = selected ? scores[selected.key] : null;

  // Retrieve relevant vitals for the selected organ
  const getOrganVitals = (key: string) => {
    const v = lastVitals || {};
    const p = profile || {};

    switch (key) {
      case 'brain':
        return [
          { label: 'Core Temp', value: v.core_temperature ? `${v.core_temperature.toFixed(1)} °C` : (p.biogears_resting_temp ? `${p.biogears_resting_temp} °C` : '37.0 °C'), range: '36.5 - 37.5 °C' },
          { label: 'Mean Arterial Pressure', value: v.map ? `${Math.round(v.map)} mmHg` : '93 mmHg', range: '70 - 105 mmHg' },
          { label: 'Cognitive Baseline', value: p.biogears_fitness_level ? (p.biogears_fitness_level === 'sedentary' ? 'Normal' : 'High') : 'Normal', range: 'Stable' },
        ];
      case 'heart':
        return [
          { label: 'Heart Rate', value: v.heart_rate ? `${v.heart_rate} bpm` : (p.biogears_resting_hr ? `${p.biogears_resting_hr} bpm` : '72 bpm'), range: '60 - 100 bpm' },
          { label: 'Blood Pressure', value: v.blood_pressure || (p.biogears_systolic_bp ? `${p.biogears_systolic_bp}/${p.biogears_diastolic_bp}` : '120/80'), range: '120/80 mmHg' },
          { label: 'Cardiac Output', value: v.cardiac_output ? `${v.cardiac_output.toFixed(1)} L/min` : '5.1 L/min', range: '4.5 - 6.0 L/min' },
        ];
      case 'lungs':
        return [
          { label: 'Oxygen Saturation (SpO₂)', value: v.spo2 ? `${v.spo2}%` : '98%', range: '95 - 100%' },
          { label: 'Respiration Rate', value: v.respiration ? `${Math.round(v.respiration)} /min` : '14 /min', range: '12 - 20 /min' },
          { label: 'Tidal Volume', value: v.tidal_volume ? `${Math.round(v.tidal_volume)} mL` : '500 mL', range: '400 - 600 mL' },
        ];
      case 'liver':
        return [
          { label: 'Blood Glucose', value: v.glucose ? `${Math.round(v.glucose)} mg/dL` : '95 mg/dL', range: '70 - 140 mg/dL' },
          { label: 'VO₂ Max Baseline', value: p.biogears_vo2max ? `${p.biogears_vo2max} ml/kg/min` : '40 ml/kg/min', range: '>35 ml/kg/min' },
          { label: 'Metabolic Output', value: v.exercise_level ? `${(v.exercise_level * 100).toFixed(0)}%` : 'Resting', range: 'Variable' },
        ];
      case 'gut':
        return [
          { label: 'Blood Glucose (Post-Meal)', value: v.glucose ? `${Math.round(v.glucose)} mg/dL` : '95 mg/dL', range: '70 - 140 mg/dL' },
          { label: 'Digestion Load', value: v.exercise_level && v.exercise_level > 0.3 ? 'Suppressed (Exercise)' : 'Standard', range: 'Optimal' },
          { label: 'Thermal Balance', value: v.core_temperature ? `${v.core_temperature.toFixed(1)} °C` : '37.0 °C', range: '36.5 - 37.5 °C' },
        ];
      case 'legs':
        return [
          { label: 'Muscle Exercise Level', value: v.exercise_level ? `${(v.exercise_level * 100).toFixed(0)}%` : 'Resting', range: '0 - 100%' },
          { label: 'Stroke Volume', value: v.stroke_volume ? `${Math.round(v.stroke_volume)} mL` : '72 mL', range: '60 - 100 mL' },
          { label: 'Fitness Profile', value: p.biogears_fitness_level ? p.biogears_fitness_level.toUpperCase() : 'SEDENTARY', range: 'Active' },
        ];
      default:
        return [];
    }
  };

  // Recommendations based on organ score
  const getOrganAdvice = (key: string, score: number) => {
    if (score >= 80) {
      switch (key) {
        case 'brain': return 'Cognitive regulation and body temperature stability are optimal. Ensure you get 7-8 hours of sleep to protect your neurological baseline.';
        case 'heart': return 'Your cardiovascular system is in excellent shape. Maintain your current active profile and hydration baseline.';
        case 'lungs': return 'Oxygenation and breathing mechanics are highly efficient. Keep up the aerobic training or deep breathing habits.';
        case 'liver': return 'Metabolic rate and glucose utilization show steady regulatory control. Limit simple carbohydrate consumption to keep it stable.';
        case 'gut': return 'Thermal digestive stability is normal. Keep dietary fiber and hydration habits consistent.';
        case 'legs': return 'Lower body venous return and vascular output are healthy. Keep moving regularly to maintain muscle tone.';
        default: return 'Organ system is operating efficiently. Maintain healthy habits.';
      }
    } else {
      switch (key) {
        case 'brain': return 'Slight cognitive or temperature fluctuations detected. Limit screen time 1 hour before bed, avoid late-night caffeine, and focus on physical hydration.';
        case 'heart': return 'Cardiovascular strain detected. Limit processed sodium, drink at least 3 liters of water, check resting heart rate values, and avoid extreme stimulants.';
        case 'lungs': return 'Respiration rate or SpO₂ is slightly off. Dedicate 5-10 minutes to steady diaphragmatic breathing, monitor allergy levels, and ensure clean ventilation.';
        case 'liver': return 'Elevated or fluctuating blood glucose detected. Space out meal carbohydrates, prioritize low-glycemic sources, and perform a light 15-minute walk post-meal.';
        case 'gut': return 'Endocrine / core temp fluctuations indicate digestive stress. Rest your stomach, stay hydrated, and stick to light, nutrient-dense meals.';
        case 'legs': return 'Circulatory pooling or low muscle activity. Break up long sitting sessions by walking for 2 minutes every hour, and execute calf stretches to trigger blood return.';
        default: return 'Slight regulatory strain. Focus on hydration, healthy nutrition, and moderate daily movement.';
      }
    }
  };

  // Get historical values for relevant vitals across sessions
  const getHistoryVitals = (key: string) => {
    const validSessions = sessions
      .filter(s => s.vitals_snapshot)
      .slice(0, 8)
      .reverse(); // oldest to newest for chronological flow

    const historyPoints = validSessions.map(s => {
      const snap = s.vitals_snapshot!;
      const dateStr = new Date(s.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      let val = '--';
      let numVal: number | null = null;
      let unit = '';

      switch (key) {
        case 'brain':
          numVal = snap.core_temperature ?? null;
          val = numVal != null ? `${numVal.toFixed(1)} °C` : '--';
          unit = '°C';
          break;
        case 'heart':
          numVal = snap.heart_rate ?? null;
          val = numVal != null ? `${numVal} bpm` : '--';
          unit = 'bpm';
          break;
        case 'lungs':
          numVal = snap.spo2 ?? null;
          val = numVal != null ? `${numVal}%` : '--';
          unit = '%';
          break;
        case 'liver':
          numVal = snap.glucose ? Math.round(snap.glucose) : null;
          val = numVal != null ? `${numVal} mg/dL` : '--';
          unit = 'mg/dL';
          break;
        case 'gut':
          numVal = snap.core_temperature ?? null;
          val = numVal != null ? `${numVal.toFixed(1)} °C` : '--';
          unit = '°C';
          break;
        case 'legs':
          numVal = snap.stroke_volume ? Math.round(snap.stroke_volume) : null;
          val = numVal != null ? `${numVal} mL` : '--';
          unit = 'mL';
          break;
      }
      return { date: dateStr, value: val, numVal, unit };
    });

    // Prepend a Baseline point from user profile to make sure there's always a start point
    const p = profile || {};
    let baselineNumVal = 72;
    let baselineVal = '--';
    let baselineUnit = '';

    switch (key) {
      case 'brain':
        baselineNumVal = p.biogears_resting_temp ? parseFloat(p.biogears_resting_temp) : 37.0;
        baselineVal = `${baselineNumVal.toFixed(1)} °C`;
        baselineUnit = '°C';
        break;
      case 'heart':
        baselineNumVal = p.biogears_resting_hr ? parseInt(p.biogears_resting_hr) : 72;
        baselineVal = `${baselineNumVal} bpm`;
        baselineUnit = 'bpm';
        break;
      case 'lungs':
        baselineNumVal = 98; // Standard baseline SpO2
        baselineVal = '98%';
        baselineUnit = '%';
        break;
      case 'liver':
        baselineNumVal = 95; // Standard baseline Glucose
        baselineVal = '95 mg/dL';
        baselineUnit = 'mg/dL';
        break;
      case 'gut':
        baselineNumVal = p.biogears_resting_temp ? parseFloat(p.biogears_resting_temp) : 37.0;
        baselineVal = `${baselineNumVal.toFixed(1)} °C`;
        baselineUnit = '°C';
        break;
      case 'legs':
        baselineNumVal = 72; // Standard stroke volume
        baselineVal = '72 mL';
        baselineUnit = 'mL';
        break;
    }

    const baselinePoint = {
      date: 'Baseline',
      value: baselineVal,
      numVal: baselineNumVal,
      unit: baselineUnit
    };

    return [baselinePoint, ...historyPoints];
  };

  const currentAdvice = selected ? getOrganAdvice(selected.key, selectedData?.score ?? 100) : '';
  const currentMetrics = selected ? getOrganVitals(selected.key) : [];
  const currentHistory = selected ? getHistoryVitals(selected.key) : [];

  const renderOrganCard = (organ: OrganPlacement, index: number) => {
    const data = scores[organ.key];
    if (!data) return null;
    const color = statusColor(data.status);
    const isSelected = selected?.key === organ.key;
    const tops = [30, 140, 250];
    return (
      <TouchableOpacity
        key={organ.key}
        style={[
          styles.organCard,
          {
            position: 'absolute',
            top: tops[index],
            left: 0,
            right: 0,
            height: 60,
            borderColor: isSelected ? color : color + '35',
            backgroundColor: color + '15',
            transform: [{ scale: isSelected ? 1.05 : 1 }],
          }
        ]}
        onPress={() => {
          setSelected(organ);
          setActiveTab('stats');
        }}
        activeOpacity={0.7}
      >
        <View style={{ alignItems: 'center', gap: 2 }}>
          {organ.key === 'liver' ? (
            <LiverIcon size={18} color="#a13c2f" />
          ) : (
            <Text style={styles.cardEmoji}>{organ.emoji}</Text>
          )}
          <Text style={[styles.cardLabel, { color: c.text }]} numberOfLines={1}>{organ.label}</Text>
        </View>
        <View style={[styles.cardScoreBadge, { backgroundColor: color }]}>
          <Text style={styles.cardScoreTxt}>{data.score}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text, marginBottom: 4 }]}>Anatomical Map</Text>
          <Text style={{ color: c.sub, fontSize: 11 }}>Tap an organ system to run diagnostics</Text>
        </View>
        <Ionicons name="body-outline" size={20} color={c.accent} style={{ marginLeft: 8 }} />
      </View>

      {/* Spaced out three-column Layout */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: BODY_H, width: '100%', marginVertical: 8 }}>
        {/* Left Column */}
        <View style={{ width: '28%', height: '100%', position: 'relative' }}>
          {LEFT_ORGANS.map((organ, idx) => renderOrganCard(organ, idx))}
        </View>

        {/* Center SVG Figure */}
        <View style={{ width: '40%', height: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <Svg width="100%" height="100%" viewBox="0 0 180 340" style={{ alignSelf: 'center' }}>
            <Defs>
              <SvgLinearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={c.accent} stopOpacity={0.25} />
                <Stop offset="100%" stopColor={c.purple || '#8b5cf6'} stopOpacity={0.05} />
              </SvgLinearGradient>
            </Defs>

            {/* Futuristic hologram scan background elements */}
            <Circle cx="90" cy="170" r="140" fill="none" stroke={c.accent + "09"} strokeWidth="1" strokeDasharray="3 6" />
            <Circle cx="90" cy="170" r="110" fill="none" stroke={c.accent + "05"} strokeWidth="1.5" />
            <Circle cx="90" cy="96" r="30" fill="none" stroke={c.accent + "0d"} strokeWidth="1" strokeDasharray="2 4" />

            {/* Symmetrical Human Outline */}
            <Path
              d="M 90 12 A 20 20 0 0 0 90 52 L 84 52 L 84 62 Q 80 70 65 70 L 51 180 Q 49 200 54 200 L 57 180 L 71 95 L 74 150 L 71 190 L 65 305 Q 65 312 72 312 L 78 312 L 86 195 L 90 195 L 94 195 L 102 312 L 108 312 Q 115 312 115 305 L 109 190 L 106 150 L 109 95 L 123 180 L 126 200 Q 131 200 129 180 L 115 70 Q 100 70 96 62 L 96 52 L 90 52 A 20 20 0 0 0 90 12 Z"
              fill="url(#bodyGrad)"
              stroke={c.accent + "44"}
              strokeWidth={1.5}
            />

            {/* Glowing guide lines from selected organ to respective card boundary */}
            {selected && selectedData && (
              <G>
                <Circle cx={selected.x} cy={selected.y} r="7" fill="none" stroke={statusColor(selectedData.status)} strokeWidth="1.5" />
                <Line
                  x1={selected.x}
                  y1={selected.y}
                  x2={ORGAN_TARGETS[selected.key]?.x2 ?? (selected.x > 90 ? 180 : 0)}
                  y2={ORGAN_TARGETS[selected.key]?.y2 ?? selected.y}
                  stroke={statusColor(selectedData.status) + "99"}
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              </G>
            )}

            {/* Indicator dots directly inside SVG so they scale exactly with the body path */}
            {ORGANS.map(organ => {
              const data = scores[organ.key];
              if (!data) return null;
              const color = statusColor(data.status);
              const isCurrentSelected = selected?.key === organ.key;
              return (
                <G key={organ.key} onPress={() => {
                  setSelected(organ);
                  setActiveTab('stats');
                }}>
                  {/* Outer glowing halo ring */}
                  <Circle
                    cx={organ.x}
                    cy={organ.y}
                    r={isCurrentSelected ? 12 : 9}
                    fill={color}
                    fillOpacity={isCurrentSelected ? 0.45 : 0.25}
                  />
                  {/* Core radar dot */}
                  <Circle
                    cx={organ.x}
                    cy={organ.y}
                    r={isCurrentSelected ? 5.5 : 4}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1.2}
                  />
                </G>
              );
            })}
          </Svg>
        </View>

        {/* Right Column */}
        <View style={{ width: '28%', height: '100%', position: 'relative' }}>
          {RIGHT_ORGANS.map((organ, idx) => renderOrganCard(organ, idx))}
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {[['#10b981','Good (80+)'],['#f59e0b','Fair (60-79)'],['#ef4444','Poor (<60)']].map(([col, lbl]) => (
          <View key={col} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: col }]} />
            <Text style={[styles.legendTxt, { color: c.sub }]}>{lbl}</Text>
          </View>
        ))}
      </View>

      {/* Horizontal scrollable breakdown cards */}
      <Text style={[styles.sectionTitle, { color: c.text, marginTop: 22, marginBottom: 10, fontWeight: '800', fontSize: 15 }]}>
        Organ Health Diagnostics
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
        {ORGANS.map(organ => {
          const data = scores[organ.key];
          if (!data) return null;
          const clr = statusColor(data.status);
          const isCurrentSelected = selected?.key === organ.key;
          return (
            <TouchableOpacity
              key={organ.key}
              style={[
                styles.horizontalOrganCard,
                {
                  backgroundColor: c.card,
                  borderColor: isCurrentSelected ? clr : c.border,
                  borderWidth: isCurrentSelected ? 1.5 : 1,
                  shadowColor: isCurrentSelected ? clr : '#000',
                  shadowOpacity: isCurrentSelected ? 0.15 : 0.05,
                  shadowRadius: isCurrentSelected ? 4 : 2,
                  elevation: isCurrentSelected ? 3 : 1,
                }
              ]}
              onPress={() => {
                setSelected(organ);
                setActiveTab('stats');
              }}
              activeOpacity={0.7}
            >
              {organ.key === 'liver' ? (
                <LiverIcon size={22} color="#a13c2f" style={{ marginVertical: 2 }} />
              ) : (
                <Text style={{ fontSize: 22 }}>{organ.emoji}</Text>
              )}
              <Text style={[styles.horizontalOrganScore, { color: clr }]}>{data.score}%</Text>
              <Text style={[styles.horizontalOrganName, { color: c.text }]}>{organ.label}</Text>
              <View style={[styles.horizontalOrganBar, { backgroundColor: c.border }]}>
                <View style={[styles.horizontalOrganBarFill, { width: `${data.score}%`, backgroundColor: clr }]} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Organ detail modal (using Sibling Overlay Pattern) */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View style={[styles.sheet, { backgroundColor: c.card, borderTopColor: c.border, borderTopWidth: 1, maxHeight: '80%', width: '100%' }]}>
            <View style={[styles.sheetHandle, { backgroundColor: c.border }]} />
            
            {selected && selectedData && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%', flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Header */}
                <View style={styles.sheetHeader}>
                  {selected.key === 'liver' ? (
                    <LiverIcon size={42} color="#a13c2f" />
                  ) : (
                    <Text style={styles.sheetEmoji}>{selected.emoji}</Text>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.sheetTitle, { color: c.text }]}>{selected.label} Diagnostics</Text>
                    <Text style={{ color: c.sub, fontSize: 12 }}>System: {selected.detail}</Text>
                  </View>
                  <View style={[styles.sheetScoreBox, { backgroundColor: statusColor(selectedData.status) + '15', borderColor: statusColor(selectedData.status) }]}>
                    <Text style={[styles.sheetScoreNum, { color: statusColor(selectedData.status) }]}>{selectedData.score}%</Text>
                    <Text style={{ color: statusColor(selectedData.status), fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                      {selectedData.status}
                    </Text>
                  </View>
                </View>

                {/* Tabs */}
                <View style={[styles.tabBar, { borderColor: c.border }]}>
                  {[
                    { key: 'stats', label: 'Vitals', icon: 'pulse' },
                    { key: 'advice', label: 'Doctor Notes', icon: 'document-text' },
                    { key: 'history', label: 'Trends', icon: 'trending-up' }
                  ].map(tab => {
                    const active = activeTab === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        style={[styles.tabBtn, active && { borderBottomColor: c.accent }]}
                        onPress={() => setActiveTab(tab.key as any)}
                      >
                        <Ionicons name={tab.icon as any} size={15} color={active ? c.accent : c.sub} />
                        <Text style={[styles.tabText, { color: active ? c.accent : c.sub, fontWeight: active ? '700' : '500' }]}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Tab Content */}
                {activeTab === 'stats' && (
                  <View style={styles.tabContent}>
                    <Text style={[styles.tabSectionTitle, { color: c.text }]}>Physiological Parameters</Text>
                    {currentMetrics.length > 0 ? (
                      currentMetrics.map((m, idx) => (
                        <View key={idx} style={[styles.metricRow, { borderColor: c.border }]}>
                          <View>
                            <Text style={[styles.metricLabel, { color: c.text }]}>{m.label}</Text>
                            <Text style={{ color: c.sub, fontSize: 11 }}>Normal: {m.range}</Text>
                          </View>
                          <Text style={[styles.metricValue, { color: c.accent }]}>{m.value}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: c.sub, fontSize: 12, paddingVertical: 12 }}>No baseline metrics available.</Text>
                    )}
                  </View>
                )}

                {activeTab === 'advice' && (
                  <View style={styles.tabContent}>
                    <Text style={[styles.tabSectionTitle, { color: c.text }]}>Clinical Guidance</Text>
                    <View style={[styles.adviceCard, { backgroundColor: c.bg, borderColor: c.border }]}>
                      <Ionicons name="medical" size={24} color={c.accent} style={{ marginBottom: 8 }} />
                      <Text style={[styles.adviceText, { color: c.text }]}>{currentAdvice}</Text>
                    </View>
                    <Text style={{ color: c.sub, fontSize: 11, marginTop: 12, fontStyle: 'italic', textAlign: 'center' }}>
                      Diagnostic scores are calculated by the BioGears engine based on current physical baselines and simulation history.
                    </Text>
                  </View>
                )}

                {activeTab === 'history' && (
                  <View style={styles.tabContent}>
                    <Text style={[styles.tabSectionTitle, { color: c.text }]}>Trend Chart</Text>
                    {currentHistory.length >= 2 ? (
                      <>
                        <OrganTrendChart
                          data={currentHistory}
                          accentColor={statusColor(selectedData?.status)}
                          c={c}
                        />
                        <Text style={[styles.tabSectionTitle, { color: c.text, marginTop: 18, marginBottom: 8 }]}>History Logs</Text>
                        {currentHistory.map((item, idx) => (
                          <View key={idx} style={[styles.historyRow, { borderColor: c.border }]}>
                            <View style={styles.historyDetails}>
                              <Text style={[styles.historyDate, { color: c.text }]}>{item.date}</Text>
                              <Text style={{ color: c.sub, fontSize: 11 }}>Simulated Value</Text>
                            </View>
                            <Text style={[styles.historyVal, { color: statusColor(selectedData?.status) }]}>{item.value}</Text>
                          </View>
                        ))}
                      </>
                    ) : currentHistory.length === 1 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                        <Ionicons name="bar-chart-outline" size={36} color={c.sub} />
                        <Text style={[{ color: c.text, fontWeight: '700', marginTop: 10, fontSize: 14 }]}>Only 1 session recorded</Text>
                        <Text style={{ color: c.sub, fontSize: 12, marginTop: 6, textAlign: 'center' }}>Run at least 2 simulations to see the trend graph.</Text>
                        <View style={[styles.historyRow, { borderColor: c.border, marginTop: 16, width: '100%' }]}>
                          <View style={styles.historyDetails}>
                            <Text style={[styles.historyDate, { color: c.text }]}>{currentHistory[0].date}</Text>
                            <Text style={{ color: c.sub, fontSize: 11 }}>Simulated Value</Text>
                          </View>
                          <Text style={[styles.historyVal, { color: statusColor(selectedData?.status) }]}>{currentHistory[0].value}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                        <Ionicons name="time-outline" size={32} color={c.sub} />
                        <Text style={{ color: c.sub, fontSize: 12, marginTop: 8 }}>No past sessions found for this active twin.</Text>
                        <Text style={{ color: c.sub, fontSize: 11, marginTop: 4, textAlign: 'center' }}>Run a simulation to start seeing trends.</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Trend Chart Component ────────────────────────────────────────────────────

function OrganTrendChart({ data, accentColor, c }: {
  data: { date: string; value: string; numVal: number | null; unit: string }[];
  accentColor: string;
  c: any;
}) {
  const chartW = Dimensions.get('window').width - 80; // modal padding
  const chartH = 135;
  const paddingLeft = 44;
  const paddingRight = 12;
  const paddingTop = 12;
  const paddingBottom = 22;
  const plotW = chartW - paddingLeft - paddingRight;
  const plotH = chartH - paddingTop - paddingBottom;

  // Filter points with valid numeric values
  const points = data.filter(d => d.numVal !== null) as { date: string; value: string; numVal: number; unit: string }[];

  if (points.length < 2) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Text style={{ color: c.sub, fontSize: 12 }}>Not enough numeric data to plot.</Text>
      </View>
    );
  }

  const vals = points.map(p => p.numVal);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;
  // Add a bit of padding to range
  const domainMin = minVal - range * 0.15;
  const domainMax = maxVal + range * 0.15;
  const domainRange = domainMax - domainMin;

  const toX = (i: number) => paddingLeft + (i / (points.length - 1)) * plotW;
  const toY = (v: number) => paddingTop + plotH - ((v - domainMin) / domainRange) * plotH;

  // Build polyline points string
  const linePoints = points.map((p, i) => `${toX(i)},${toY(p.numVal)}`).join(' ');

  // Build filled area polygon (line + bottom)
  const areaPoints = [
    ...points.map((p, i) => `${toX(i)},${toY(p.numVal)}`),
    `${toX(points.length - 1)},${paddingTop + plotH}`,
    `${toX(0)},${paddingTop + plotH}`,
  ].join(' ');

  // Y-axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map(t => domainMin + t * domainRange);

  const unit = points[0]?.unit ?? '';

  return (
    <View style={[styles.chartContainer, { backgroundColor: c.bg ?? '#0f172a', borderColor: c.border }]}>
      <Svg width={chartW} height={chartH}>
        <Defs>
          <SvgLinearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={accentColor} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={accentColor} stopOpacity={0.02} />
          </SvgLinearGradient>
        </Defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = toY(tick);
          return (
            <G key={i}>
              <Line
                x1={paddingLeft}
                y1={y}
                x2={chartW - paddingRight}
                y2={y}
                stroke={c.border}
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <SvgText
                x={paddingLeft - 4}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill={c.sub ?? '#64748b'}
              >
                {tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}
              </SvgText>
            </G>
          );
        })}

        {/* Y axis line */}
        <Line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={paddingTop + plotH}
          stroke={c.border}
          strokeWidth={1}
        />

        {/* X axis line */}
        <Line
          x1={paddingLeft}
          y1={paddingTop + plotH}
          x2={chartW - paddingRight}
          y2={paddingTop + plotH}
          stroke={c.border}
          strokeWidth={1}
        />

        {/* Filled area */}
        <Polygon
          points={areaPoints}
          fill="url(#areaGrad)"
        />

        {/* Line */}
        <Polyline
          points={linePoints}
          fill="none"
          stroke={accentColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points + X labels */}
        {points.map((p, i) => {
          const x = toX(i);
          const y = toY(p.numVal);
          const isLast = i === points.length - 1;
          return (
            <G key={i}>
              {/* Outer glow circle */}
              <Circle cx={x} cy={y} r={7} fill={accentColor} fillOpacity={0.18} />
              {/* Core dot */}
              <Circle cx={x} cy={y} r={3.5} fill={accentColor} stroke="#ffffff" strokeWidth={1.5} />
              {/* Value label above dot (only first, last, and every 2nd in between) */}
              {(i === 0 || isLast || i % 2 === 0) && (
                <SvgText
                  x={x}
                  y={y - 10}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight="700"
                  fill={accentColor}
                >
                  {p.numVal % 1 === 0 ? p.numVal.toFixed(0) : p.numVal.toFixed(1)}
                </SvgText>
              )}
              {/* X axis date label */}
              <SvgText
                x={x}
                y={paddingTop + plotH + 12}
                textAnchor="middle"
                fontSize={8}
                fill={c.sub ?? '#64748b'}
              >
                {p.date}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {/* Unit label */}
      {unit ? (
        <Text style={{ color: c.sub, fontSize: 10, textAlign: 'right', marginTop: 2, paddingRight: 8 }}>
          Unit: {unit}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: { borderRadius: 16, borderWidth: 1, padding: 8, marginTop: 4, overflow: 'hidden' },
  wrap: { borderRadius: 24, padding: 18, borderWidth: 1, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontWeight: '800', fontSize: 17 },
  body: { height: BODY_H, position: 'relative', alignSelf: 'center', marginVertical: 8 },
  organCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  cardEmoji: { fontSize: 18 },
  cardLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cardScoreBadge: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5, minWidth: 26, alignItems: 'center' },
  cardScoreTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendTxt: { fontSize: 10, fontWeight: '600' },
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 14, alignItems: 'center' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 18 },
  sheetEmoji: { fontSize: 42 },
  sheetTitle: { fontSize: 19, fontWeight: '800' },
  sheetScoreBox: { borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' },
  sheetScoreNum: { fontSize: 22, fontWeight: '900' },
  tabBar: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, marginBottom: 16, gap: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13 },
  tabContent: { width: '100%', marginTop: 4 },
  tabSectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1 },
  metricLabel: { fontSize: 13, fontWeight: '600' },
  metricValue: { fontSize: 14, fontWeight: '700' },
  adviceCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 4 },
  adviceText: { fontSize: 13, lineHeight: 20 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  historyDotWrap: { width: 20, alignItems: 'center', position: 'relative', height: '100%', justifyContent: 'center' },
  historyTimelineDot: { width: 10, height: 10, borderRadius: 5, zIndex: 2 },
  historyTimelineLine: { position: 'absolute', top: 18, bottom: -18, width: 2, zIndex: 1 },
  historyDetails: { flex: 1, marginLeft: 12 },
  historyDate: { fontSize: 13, fontWeight: '600' },
  historyVal: { fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  horizontalOrganCard: {
    width: 100,
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginRight: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  horizontalOrganScore: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  horizontalOrganName: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  horizontalOrganBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  horizontalOrganBarFill: {
    height: 4,
    borderRadius: 2,
  },
});
