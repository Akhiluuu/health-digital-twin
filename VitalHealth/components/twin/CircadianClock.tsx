/**
 * CircadianClock — Sleek, theme-synchronized 24-hour circadian rhythm widget.
 * Fully aligned with VitalHealth glassmorphism design tokens.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

const W = Dimensions.get('window').width;

interface CircadianPhase {
  label: string;
  icon: string;
  startH: number;
  endH: number;
  desc: string;
  accent: string;
}

const PHASES: CircadianPhase[] = [
  { label: 'Deep Sleep',  icon: '🌙', startH: 0,  endH: 6,  desc: 'Tissue Repair · HR ↓ · BP ↓', accent: '#8b5cf6' },
  { label: 'Cortisol Surge', icon: '🌅', startH: 6,  endH: 10, desc: 'Waking Alertness · Cortisol ↑', accent: '#f59e0b' },
  { label: 'Peak Phase',  icon: '☀️', startH: 10, endH: 14, desc: 'Peak Cognition & Efficiency', accent: '#3b82f6' },
  { label: 'Afternoon',   icon: '🌤️', startH: 14, endH: 18, desc: 'Temp Peak · Quick Reactions', accent: '#10b981' },
  { label: 'Wind-Down',   icon: '🌆', startH: 18, endH: 22, desc: 'Melatonin Release · BP ↓', accent: '#ec4899' },
  { label: 'Night Rest',  icon: '🌃', startH: 22, endH: 24, desc: 'Parasympathetic Balance', accent: '#6366f1' },
];

function getCurrentPhase(hour: number): CircadianPhase {
  return PHASES.find(p => hour >= p.startH && hour < p.endH) ?? PHASES[0];
}

export default function CircadianClock() {
  const { theme } = useTheme();
  const c = themeColors[theme];

  const now  = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const pct  = Math.min(Math.max(hour / 24, 0), 1);
  const phase = getCurrentPhase(Math.floor(hour));

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const barWidth = W - 76; // Padding width
  const markerLeft = pct * barWidth - 8;

  // Format time (e.g. 12:31 PM)
  const hoursFormatted = now.getHours() % 12 || 12;
  const minsFormatted = String(now.getMinutes()).padStart(2, '0');
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
  const timeString = `${hoursFormatted}:${minsFormatted} ${ampm}`;

  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: phase.accent + '18', borderColor: phase.accent + '40' }]}>
          <Text style={styles.iconEmoji}>{phase.icon}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.phaseTitle, { color: c.text }]}>{phase.label}</Text>
            <View style={[styles.activeTag, { backgroundColor: phase.accent + '15', borderColor: phase.accent + '35' }]}>
              <View style={[styles.activeDot, { backgroundColor: phase.accent }]} />
              <Text style={[styles.activeTagTxt, { color: phase.accent }]}>Active Rhythm</Text>
            </View>
          </View>
          <Text style={[styles.phaseDesc, { color: c.sub }]}>{phase.desc}</Text>
        </View>

        <View style={[styles.timeBadge, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="time-outline" size={13} color={c.active} />
          <Text style={[styles.timeTxt, { color: c.text }]}>{timeString}</Text>
        </View>
      </View>

      {/* 24-Hour Progress Track */}
      <View style={styles.trackContainer}>
        <View style={[styles.trackBg, { backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
          <View style={[styles.trackFill, { width: `${pct * 100}%`, backgroundColor: phase.accent }]} />
        </View>

        {/* Pulse Marker */}
        <Animated.View
          style={[
            styles.marker,
            {
              left: Math.max(0, Math.min(markerLeft, barWidth - 16)),
              borderColor: phase.accent,
              shadowColor: phase.accent,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <View style={[styles.innerMarkerDot, { backgroundColor: phase.accent }]} />
        </Animated.View>
      </View>

      {/* Time Markers */}
      <View style={styles.timeMarkersRow}>
        {['00:00', '06:00', '12:00', '18:00', '24:00'].map((lbl) => (
          <Text key={lbl} style={[styles.markerLabel, { color: c.sub }]}>
            {lbl}
          </Text>
        ))}
      </View>

      {/* Phase Pills Row */}
      <View style={styles.phasePillsRow}>
        {PHASES.map((p) => {
          const isActive = phase.startH === p.startH;
          return (
            <View
              key={p.startH}
              style={[
                styles.phasePill,
                {
                  backgroundColor: isActive ? p.accent + '20' : 'transparent',
                  borderColor: isActive ? p.accent + '60' : 'transparent',
                },
              ]}
            >
              <Text style={{ fontSize: 13, opacity: isActive ? 1 : 0.4 }}>{p.icon}</Text>
              {isActive && (
                <Text style={[styles.phasePillTxt, { color: p.accent }]}>{p.label.split(' ')[0]}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 22,
  },
  phaseTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  activeTagTxt: {
    fontSize: 10,
    fontWeight: '800',
  },
  phaseDesc: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  timeTxt: {
    fontSize: 11,
    fontWeight: '700',
  },

  trackContainer: {
    height: 10,
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  trackBg: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  marker: {
    position: 'absolute',
    top: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  innerMarkerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  timeMarkersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  markerLabel: {
    fontSize: 9,
    fontWeight: '700',
  },

  phasePillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  phasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  phasePillTxt: {
    fontSize: 10,
    fontWeight: '800',
  },
});
