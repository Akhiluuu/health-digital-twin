/**
 * CircadianClock — Horizontal 24-hour strip showing circadian physiology phases.
 * Uses app theme colors for light/dark compatibility.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

const W = Dimensions.get('window').width;

interface CircadianPhase {
  label: string;
  icon: string;
  startH: number;
  endH: number;
  desc: string;
}

const PHASES: CircadianPhase[] = [
  { label: 'Deep Sleep',  icon: '🌙', startH: 0,  endH: 6,  desc: 'HR ↓ · BP ↓ · Repair' },
  { label: 'Surge',       icon: '🌅', startH: 6,  endH: 10, desc: 'Cortisol ↑ · HR ↑' },
  { label: 'Peak',        icon: '☀️', startH: 10, endH: 14, desc: 'Peak performance' },
  { label: 'Afternoon',   icon: '🌤️', startH: 14, endH: 18, desc: 'Temp peak · Reaction ↑' },
  { label: 'Wind-Down',   icon: '🌆', startH: 18, endH: 22, desc: 'Melatonin ↑ · BP ↓' },
  { label: 'Night',       icon: '🌃', startH: 22, endH: 24, desc: 'Parasympathetic ↑' },
];

function getCurrentPhase(hour: number): CircadianPhase {
  return PHASES.find(p => hour >= p.startH && hour < p.endH) ?? PHASES[0];
}

export default function CircadianClock() {
  const { theme } = useTheme();
  const c = themeColors[theme];

  const now  = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const pct  = hour / 24;
  const phase = getCurrentPhase(Math.floor(hour));

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const markerLeft = pct * (W - 80) - 6;

  return (
    <View style={[styles.wrap, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>{phase.icon}</Text>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.phaseLabel, { color: c.text }]}>{phase.label} Phase</Text>
          <Text style={[styles.phaseDesc,  { color: c.sub  }]}>{phase.desc}</Text>
        </View>
        <Text style={[styles.timeTxt, { color: c.active }]}>
          {now.getHours()}:{String(now.getMinutes()).padStart(2,'0')}
        </Text>
      </View>

      {/* Gradient bar */}
      <View style={styles.barWrap}>
        <LinearGradient
          colors={['#1e1b4b','#312e81','#78350f','#d97706','#064e3b','#10b981','#0c4a6e','#0284c7','#4c1d95','#7c3aed','#1e1b4b']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.bar}
        />
        <Animated.View
          style={[styles.marker, { left: markerLeft, borderColor: c.active, transform: [{ scale: pulseAnim }] }]}
        />
        {[0, 6, 12, 18, 24].map(h => (
          <Text key={h} style={[styles.hourLbl, { left: (h / 24) * (W - 80) - 8, color: c.sub }]}>
            {h === 24 ? '' : `${h}h`}
          </Text>
        ))}
      </View>

      <View style={styles.phaseRow}>
        {PHASES.map(p => (
          <Text key={p.startH} style={[styles.phaseIcon, { opacity: phase.startH === p.startH ? 1 : 0.35 }]}>
            {p.icon}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  icon: { fontSize: 28 },
  phaseLabel: { fontWeight: '700', fontSize: 14 },
  phaseDesc:  { fontSize: 11, marginTop: 1 },
  timeTxt:    { fontWeight: '700', fontSize: 16, fontFamily: 'monospace' },
  barWrap: { position: 'relative', height: 12, marginBottom: 20 },
  bar: { height: 12, borderRadius: 6, width: '100%' },
  marker: {
    position: 'absolute', top: -4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 3,
    shadowColor: '#38bdf8', shadowOpacity: 0.8, shadowRadius: 6, elevation: 6,
  },
  hourLbl: { position: 'absolute', top: 16, fontSize: 9, fontWeight: '600' },
  phaseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  phaseIcon: { fontSize: 18 },
});
