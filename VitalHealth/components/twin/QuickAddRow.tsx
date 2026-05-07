/**
 * QuickAddRow — One-tap shortcuts for common health events.
 * Theme-aware: uses app light/dark color tokens.
 */
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

type AddEventFn = (event: any) => void;

interface Props {
  addEvent: AddEventFn;
}

const pad = (n: number) => String(n).padStart(2, '0');
function now() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SHORTCUTS = [
  {
    icon: '☕', label: 'Morning Coffee', accent: '#f59e0b',
    build: () => ({ event_type: 'substance', value: 200, wallTime: now(), substance_name: 'Caffeine', displayLabel: 'Caffeine · 200mg', displayIcon: '☕' }),
  },
  {
    icon: '💧', label: 'Glass of Water', accent: '#0ea5e9',
    build: () => ({ event_type: 'water', value: 250, wallTime: now(), displayLabel: 'Water · 250mL', displayIcon: '💧' }),
  },
  {
    icon: '🍱', label: 'Lunch', accent: '#10b981',
    build: () => ({ event_type: 'meal', value: 650, meal_type: 'balanced', wallTime: now(), displayLabel: 'Balanced Lunch · 650 kcal', displayIcon: '🍱' }),
  },
  {
    icon: '🥗', label: 'Light Snack', accent: '#84cc16',
    build: () => ({ event_type: 'meal', value: 200, meal_type: 'balanced', wallTime: now(), displayLabel: 'Light Snack · 200 kcal', displayIcon: '🥗' }),
  },
  {
    icon: '🚶', label: '20min Walk', accent: '#6366f1',
    build: () => ({ event_type: 'exercise', value: 0.3, duration_seconds: 1200, wallTime: now(), displayLabel: 'Walk · 30% · 20min', displayIcon: '🚶' }),
  },
  {
    icon: '🏃', label: '30min Run', accent: '#ef4444',
    build: () => ({ event_type: 'exercise', value: 0.6, duration_seconds: 1800, wallTime: now(), displayLabel: 'Run · 60% · 30min', displayIcon: '🏃' }),
  },
  {
    icon: '😴', label: "Night Sleep", accent: '#8b5cf6',
    build: () => ({ event_type: 'sleep', value: 7.5, wallTime: '22:30', displayLabel: 'Sleep · 7.5h', displayIcon: '😴' }),
  },
];

export default function QuickAddRow({ addEvent }: Props) {
  const { theme } = useTheme();
  const c = themeColors[theme];

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: c.sub }]}>⚡ Quick Add</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {SHORTCUTS.map(s => (
          <TouchableOpacity
            key={s.label}
            style={[styles.chip, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => addEvent(s.build())}
            activeOpacity={0.75}
          >
            <Text style={styles.chipIcon}>{s.icon}</Text>
            <Text style={[styles.chipLabel, { color: c.sub }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  scroll: { overflow: 'visible' },
  chip: {
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, alignItems: 'center', borderWidth: 1, minWidth: 80,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chipIcon: { fontSize: 20, marginBottom: 4 },
  chipLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
});
