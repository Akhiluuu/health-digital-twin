// app/(tabs)/history.tsx — Log Routine: reminders + all context data
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, RefreshControl, Platform, Alert, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useHydration } from '../../context/HydrationContext';
import { useNutrition } from '../../context/NutritionContext';
import { useSymptoms } from '../../context/SymptomContext';
import { useTheme } from '../../context/ThemeContext';
import { useFamily } from '../../context/FamilyContext';
import { useProfile } from '../../context/ProfileContext';
import { colors as themeColors } from '../../theme/colors';
import Header from '../components/Header';
import TimePicker from '../../components/twin/TimePicker';
import { auth } from '../../services/firebase';
import { updateProfile as firebaseUpdateProfile } from '../../services/profileService';
import { scheduleRoutineReminder, cancelRoutineReminder } from '../../services/notifeeService';
import { getMedicines } from '../../database/medicineDB';

type LogTab = 'nutrition' | 'exercise' | 'sleep' | 'hydration' | 'symptoms';
const TABS: { id: LogTab; label: string; icon: string; accent: string }[] = [
  { id: 'nutrition', label: 'Nutrition', icon: '🍽️', accent: '#f59e0b' },
  { id: 'exercise', label: 'Exercise', icon: '💪', accent: '#10b981' },
  { id: 'sleep', label: 'Sleep', icon: '😴', accent: '#6366f1' },
  { id: 'hydration', label: 'Hydration', icon: '💧', accent: '#0ea5e9' },
  { id: 'symptoms', label: 'Symptoms', icon: '🩺', accent: '#ef4444' },
];

const REMINDER_KEY = (tab: LogTab) => `@log_reminder_${tab}`;

function fmt(ts: number) {
  if (!ts || isNaN(ts)) return '';
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
}
function ago(ts: number) {
  if (!ts || isNaN(ts)) return '';
  try {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return ''; }
}

// ── Routine Reminder Types & Helpers ──────────────────────────────────────────
export type RoutineReminder = {
  id: string;
  label: string;
  time: string;
  enabled: boolean;
};

const PRESETS: Record<LogTab, string[]> = {
  nutrition: ['🍳 Breakfast', '🥗 Lunch', '🍲 Dinner', '🍎 Snack'],
  exercise: ['🏃 Workout', '🚶 Walk', '🧘 Yoga', '🚲 Cycling'],
  sleep: ['🌅 Wake Up', '😴 Bedtime', '💤 Nap'],
  hydration: ['💧 Drink Water', '💧 Morning Water', '💧 Evening Water'],
  symptoms: ['🩺 Symptom Check', '💊 Medicine Check'],
};

function getPrepopulatedReminders(tab: LogTab, habits: any): RoutineReminder[] {
  const wakeUp = habits?.wakeUp || '07:00';
  const breakfast = habits?.breakfast || '08:00';
  const lunch = habits?.lunch || '13:00';
  const dinner = habits?.dinner || '20:00';
  const sleep = habits?.sleep || '23:00';

  const formatHM = (timeStr?: any) => {
    if (!timeStr || typeof timeStr !== 'string') return '08:00';
    let clean = timeStr.trim().toLowerCase();
    const isPM = clean.includes('pm');
    const isAM = clean.includes('am');
    clean = clean.replace(/(am|pm)/g, '').trim();
    const parts = clean.split(':');
    let h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  switch (tab) {
    case 'nutrition':
      return [
        { id: `nut_bf_${Date.now()}_1`, label: '🍳 Breakfast', time: formatHM(breakfast), enabled: true },
        { id: `nut_lh_${Date.now()}_2`, label: '🥗 Lunch', time: formatHM(lunch), enabled: true },
        { id: `nut_dn_${Date.now()}_3`, label: '🍲 Dinner', time: formatHM(dinner), enabled: true },
      ];
    case 'sleep':
      return [
        { id: `sl_wu_${Date.now()}_1`, label: '🌅 Wake Up', time: formatHM(wakeUp), enabled: true },
        { id: `sl_bt_${Date.now()}_2`, label: '😴 Bedtime', time: formatHM(sleep), enabled: true },
      ];
    case 'exercise': {
      const wakeH = parseInt(formatHM(wakeUp).split(':')[0], 10);
      const exHour = (wakeH + 10) % 24;
      return [
        { id: `ex_wo_${Date.now()}_1`, label: '🏃 Workout', time: `${String(exHour).padStart(2, '0')}:00`, enabled: true },
      ];
    }
    case 'hydration': {
      const wH = parseInt(formatHM(wakeUp).split(':')[0], 10);
      const sH = parseInt(formatHM(sleep).split(':')[0], 10);
      const bedHour = sH < wH ? sH + 24 : sH;
      const step = Math.max(2, Math.floor((bedHour - wH) / 4));
      return [
        { id: `hyd_w_${Date.now()}_1`, label: '💧 Drink Water', time: `${String((wH + step) % 24).padStart(2, '0')}:00`, enabled: true },
        { id: `hyd_w_${Date.now()}_2`, label: '💧 Drink Water', time: `${String((wH + step * 2) % 24).padStart(2, '0')}:00`, enabled: true },
        { id: `hyd_w_${Date.now()}_3`, label: '💧 Drink Water', time: `${String((wH + step * 3) % 24).padStart(2, '0')}:00`, enabled: true },
      ];
    }
    case 'symptoms': {
      try {
        const meds = getMedicines();
        if (meds && meds.length > 0) {
          const uniqueTimes = Array.from(new Set(meds.map(m => m.time).filter(Boolean))).sort();
          if (uniqueTimes.length > 0) {
            return uniqueTimes.map((t, idx) => ({
              id: `sym_med_${idx}_${Date.now()}`,
              label: '🩺 Symptom Check',
              time: t,
              enabled: true,
            }));
          }
        }
      } catch (err) {
        console.log('Error reading medicines for symptom reminders prepopulation:', err);
      }
      return [
        { id: `sym_am_${Date.now()}_1`, label: '🩺 Symptom Check', time: '10:00', enabled: true },
        { id: `sym_pm_${Date.now()}_2`, label: '🩺 Symptom Check', time: '19:00', enabled: true },
      ];
    }
  }
}

const syncNotificationsForReminders = async (tab: LogTab, list: RoutineReminder[]) => {
  try {
    for (const r of list) {
      const notifId = `notif_routine_${tab}_${r.id}`;
      await cancelRoutineReminder(notifId);

      if (r.enabled) {
        const [h, m] = String(r.time || '08:00').split(':').map(Number);
        const cleanLabel = r.label.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '').trim();
        const tabEmoji = tab === 'nutrition' ? '🍽️' : tab === 'exercise' ? '💪' : tab === 'sleep' ? '😴' : tab === 'hydration' ? '💧' : '🩺';
        const title = `${tabEmoji} Habit Reminder`;
        const body = `It's time for your routine: ${cleanLabel || r.label}`;
        await scheduleRoutineReminder(notifId, title, body, h, m, tab);
      }
    }
  } catch (error) {
    console.error("Error syncing notifications:", error);
  }
};

const REMINDERS_LIST_KEY = (tab: LogTab) => `@log_reminders_list_v2_${tab}`;
const OLD_REMINDER_KEY = (tab: LogTab) => `@log_reminder_${tab}`;

// ── Reminder Card ─────────────────────────────────────────────────────────────
function ReminderCard({ tab, accent, c }: { tab: LogTab; accent: string; c: any }) {
  const [reminders, setReminders] = useState<RoutineReminder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newTime, setNewTime] = useState('08:00');

  const user = auth.currentUser;
  const userId = user?.uid || 'guest';

  useEffect(() => {
    const loadReminders = async () => {
      try {
        const raw = await AsyncStorage.getItem(REMINDERS_LIST_KEY(tab));
        let loadedList: RoutineReminder[] = [];
        let needsSave = false;

        if (raw) {
          try {
            const parsedR = JSON.parse(raw);
            if (Array.isArray(parsedR)) loadedList = parsedR;
          } catch { /* corrupted */ }
        }

        if (tab === 'symptoms') {
          try {
            const meds = getMedicines();
            if (meds && meds.length > 0) {
              const medTimes = Array.from(new Set(meds.map(m => m.time).filter(Boolean))).sort();
              const existingTimes = loadedList.map(r => r.time).sort();
              const timesMatch = JSON.stringify(medTimes) === JSON.stringify(existingTimes);

              if (!timesMatch) {
                console.log(`[SymptomReminders] Syncing symptom alarms to medicine times: ${medTimes.join(', ')}`);
                loadedList = medTimes.map((t, idx) => {
                  const existing = loadedList.find(r => r.time === t);
                  return {
                    id: existing?.id || `sym_med_${idx}_${Date.now()}`,
                    label: '🩺 Symptom Check',
                    time: t,
                    enabled: existing ? existing.enabled : true,
                  };
                });
                needsSave = true;
              }
            } else {
              if (loadedList.length === 0) {
                loadedList = [
                  { id: `sym_am_${Date.now()}_1`, label: '🩺 Symptom Check', time: '10:00', enabled: true },
                  { id: `sym_pm_${Date.now()}_2`, label: '🩺 Symptom Check', time: '19:00', enabled: true },
                ];
                needsSave = true;
              }
            }
          } catch (err) {
            console.warn('Failed to sync symptom reminders with medicine timings:', err);
          }
        } else {
          if (loadedList.length === 0) {
            // Check for legacy single reminder migration
            const oldRaw = await AsyncStorage.getItem(OLD_REMINDER_KEY(tab));
            if (oldRaw) {
              let oldData: any = null;
              try { oldData = JSON.parse(oldRaw); } catch { /* ignore corrupted legacy */ }
              if (!oldData) oldData = {};
              loadedList = [
                {
                  id: `legacy_${Date.now()}`,
                  label: '⏰ Daily Reminder',
                  time: oldData.time || '08:00',
                  enabled: oldData.enabled ?? false,
                }
              ];
            } else {
              // Load onboarding habits for pre-population
              let habits = null;
              if (user) {
                const habitsRaw = await AsyncStorage.getItem(`@onboarding_habits_${user.uid}`);
                if (habitsRaw) { try { habits = JSON.parse(habitsRaw); } catch { habits = null; } }
              }
              loadedList = getPrepopulatedReminders(tab, habits);
            }
            needsSave = true;
          }
        }

        setReminders(loadedList);
        if (needsSave) {
          await AsyncStorage.setItem(REMINDERS_LIST_KEY(tab), JSON.stringify(loadedList));
          await syncNotificationsForReminders(tab, loadedList);
        }
      } catch (e) {
        console.error("Error loading reminders list:", e);
      } finally {
        setLoaded(true);
      }
    };

    loadReminders();
  }, [tab, userId]);

  const updateReminder = async (id: string, updates: Partial<RoutineReminder>) => {
    const updated = reminders.map(r => r.id === id ? { ...r, ...updates } : r);
    setReminders(updated);
    await AsyncStorage.setItem(REMINDERS_LIST_KEY(tab), JSON.stringify(updated));

    // Sync notification for this specific reminder
    const item = updated.find(r => r.id === id);
    if (item) {
      const notifId = `notif_routine_${tab}_${id}`;
      await cancelRoutineReminder(notifId);
      if (item.enabled) {
        const [h, m] = String(item.time || '08:00').split(':').map(Number);
        const cleanLabel = item.label.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '').trim();
        const tabEmoji = tab === 'nutrition' ? '🍽️' : tab === 'exercise' ? '💪' : tab === 'sleep' ? '😴' : tab === 'hydration' ? '💧' : '🩺';
        const title = `${tabEmoji} Habit Reminder`;
        const body = `It's time for your routine: ${cleanLabel || item.label}`;
        await scheduleRoutineReminder(notifId, title, body, h, m, tab);
      }
    }
  };

  const deleteReminder = async (id: string) => {
    const updated = reminders.filter(r => r.id !== id);
    setReminders(updated);
    await AsyncStorage.setItem(REMINDERS_LIST_KEY(tab), JSON.stringify(updated));
    const notifId = `notif_routine_${tab}_${id}`;
    await cancelRoutineReminder(notifId);
  };

  const addReminder = async () => {
    if (!newLabel.trim()) {
      Alert.alert('Label Required', 'Please enter or select a label for this reminder.');
      return;
    }
    const newReminder: RoutineReminder = {
      id: `${tab}_${Date.now()}`,
      label: newLabel.trim(),
      time: newTime,
      enabled: true,
    };
    const updated = [...reminders, newReminder];
    setReminders(updated);
    await AsyncStorage.setItem(REMINDERS_LIST_KEY(tab), JSON.stringify(updated));

    const notifId = `notif_routine_${tab}_${newReminder.id}`;
    const [h, m] = String(newTime || '08:00').split(':').map(Number);
    const cleanLabel = newReminder.label.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '').trim();
    const tabEmoji = tab === 'nutrition' ? '🍽️' : tab === 'exercise' ? '💪' : tab === 'sleep' ? '😴' : tab === 'hydration' ? '💧' : '🩺';
    const title = `${tabEmoji} Habit Reminder`;
    const body = `It's time for your routine: ${cleanLabel || newReminder.label}`;
    await scheduleRoutineReminder(notifId, title, body, h, m, tab);

    setNewLabel('');
    setNewTime('08:00');
    setShowAddForm(false);
  };

  const resetToOnboarding = async () => {
    Alert.alert(
      'Reset Reminders',
      'Are you sure you want to reset reminders to match your onboarding routine timings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            for (const r of reminders) {
              const notifId = `notif_routine_${tab}_${r.id}`;
              await cancelRoutineReminder(notifId);
            }
            let habits = null;
            if (user) {
              const habitsRaw = await AsyncStorage.getItem(`@onboarding_habits_${user.uid}`);
              if (habitsRaw) { try { habits = JSON.parse(habitsRaw); } catch { habits = null; } }
            }
            const prepopulated = getPrepopulatedReminders(tab, habits);
            setReminders(prepopulated);
            await AsyncStorage.setItem(REMINDERS_LIST_KEY(tab), JSON.stringify(prepopulated));
            await syncNotificationsForReminders(tab, prepopulated);
            Alert.alert('Success', 'Reminders reset to onboarding timings.');
          }
        }
      ]
    );
  };

  if (!loaded) return null;

  const activeCount = reminders.filter(r => r.enabled).length;

  return (
    <View style={[rc.card, { backgroundColor: c.card, borderColor: isExpanded ? accent + '70' : c.border }]}>
      <TouchableOpacity
        style={rc.headerRow}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.8}
      >
        <View style={[rc.iconBox, { backgroundColor: accent + '20' }]}>
          <Ionicons name="alarm-outline" size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[rc.title, { color: c.text }]}>Daily Reminders</Text>
          <Text style={[rc.sub, { color: c.sub }]}>
            {activeCount === 0 ? 'No active reminders' : `${activeCount} active reminder${activeCount === 1 ? '' : 's'}`}
          </Text>
        </View>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={c.sub} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={[rc.body, { borderTopColor: c.border }]}>
          {reminders.length === 0 ? (
            <Text style={[rc.emptyText, { color: c.sub }]}>No reminders set. Add one below!</Text>
          ) : (
            reminders.map(r => (
              <View key={r.id} style={[rc.reminderRow, { borderBottomColor: c.border }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[rc.reminderLabel, { color: c.text }]}>{r.label}</Text>
                  <Text style={[rc.reminderSub, { color: c.sub }]}>{r.enabled ? 'Active' : 'Muted'}</Text>
                </View>
                <View style={rc.reminderControls}>
                  <TimePicker
                    value={r.time}
                    onChange={(t) => updateReminder(r.id, { time: t })}
                    accent={accent}
                  />
                  <Switch
                    value={r.enabled}
                    onValueChange={(val) => updateReminder(r.id, { enabled: val })}
                    trackColor={{ false: c.border, true: accent }}
                    thumbColor={Platform.OS === 'android' ? c.card : undefined}
                  />
                  <TouchableOpacity
                    style={rc.deleteBtn}
                    onPress={() => deleteReminder(r.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {showAddForm ? (
            <View style={[rc.addForm, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Text style={[rc.formTitle, { color: c.text }]}>Add New Reminder</Text>

              {/* Presets Row */}
              <View style={rc.presetContainer}>
                <Text style={[rc.presetTitle, { color: c.sub }]}>Quick Presets:</Text>
                <View style={rc.presetsWrap}>
                  {PRESETS[tab]?.map(preset => (
                    <TouchableOpacity
                      key={preset}
                      style={[rc.presetChip, { backgroundColor: c.card, borderColor: c.border }]}
                      onPress={() => setNewLabel(preset)}
                      activeOpacity={0.7}
                    >
                      <Text style={[rc.presetChipText, { color: c.text }]}>{preset}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Form Input fields */}
              <TextInput
                style={[rc.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }]}
                placeholder="Reminder label (e.g. Snack, Yoga)"
                placeholderTextColor={c.sub}
                value={newLabel}
                onChangeText={setNewLabel}
              />

              <View style={rc.formRow}>
                <Text style={[rc.formLabel, { color: c.text }]}>Time:</Text>
                <TimePicker value={newTime} onChange={setNewTime} accent={accent} />
              </View>

              <View style={rc.formActions}>
                <TouchableOpacity
                  style={[rc.cancelBtn, { borderColor: c.border }]}
                  onPress={() => setShowAddForm(false)}
                >
                  <Text style={[rc.cancelBtnText, { color: c.sub }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[rc.saveBtn, { backgroundColor: accent }]}
                  onPress={addReminder}
                >
                  <Text style={rc.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={rc.actionsRow}>
              <TouchableOpacity
                style={[rc.addButton, { borderColor: accent }]}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={accent} />
                <Text style={[rc.addButtonText, { color: accent }]}>Add Reminder Time</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={rc.resetLink}
                onPress={resetToOnboarding}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={12} color={c.sub} />
                <Text style={[rc.resetLinkText, { color: c.sub }]}>Reset to Profile Timings</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const rc = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 36, height: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 2 },

  body: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  emptyText: { fontSize: 12, textAlign: 'center', paddingVertical: 12, fontStyle: 'italic' },

  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1 },
  reminderLabel: { fontSize: 13, fontWeight: '600' },
  reminderSub: { fontSize: 10, marginTop: 2 },
  reminderControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteBtn: { padding: 4, marginLeft: 4 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  addButtonText: { fontSize: 12, fontWeight: '600' },
  resetLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 },
  resetLinkText: { fontSize: 11, textDecorationLine: 'underline' },

  addForm: { borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 12 },
  formTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8 },
  presetContainer: { marginBottom: 10 },
  presetTitle: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  presetsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  presetChipText: { fontSize: 11 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, marginBottom: 10 },
  formRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  formLabel: { fontSize: 12, fontWeight: '600' },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  cancelBtnText: { fontSize: 12, fontWeight: '600' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});

// ── Entry Card ────────────────────────────────────────────────────────────────
function EntryCard({ icon, title, sub, time, accent, c }: any) {
  return (
    <View style={[ec.card, { backgroundColor: c.card }]}>
      <View style={[ec.box, { backgroundColor: accent + '20' }]}><Text style={{ fontSize: 16 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={[ec.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[ec.sub, { color: c.sub }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <Text style={[ec.time, { color: c.sub }]}>{time}</Text>
    </View>
  );
}
const ec = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 13, marginBottom: 7 },
  box: { width: 36, height: 36, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 13, fontWeight: '600' },
  sub: { fontSize: 11, marginTop: 1 },
  time: { fontSize: 10, minWidth: 44, textAlign: 'right' },
});

// ── Empty State ───────────────────────────────────────────────────────────────
function Empty({ icon, text, btn, onPress, accent, c }: any) {
  return (
    <View style={[em.wrap, { backgroundColor: c.card }]}>
      <Text style={{ fontSize: 32 }}>{icon}</Text>
      <Text style={[em.text, { color: c.sub }]}>{text}</Text>
      <TouchableOpacity style={[em.btn, { backgroundColor: accent }]} onPress={onPress}>
        <Text style={em.btnT}>{btn}</Text>
      </TouchableOpacity>
    </View>
  );
}
const em = StyleSheet.create({
  wrap: { borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 10, gap: 8 },
  text: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 4, paddingHorizontal: 22, paddingVertical: 9, borderRadius: 18 },
  btnT: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

// ── Summary Pills Row ─────────────────────────────────────────────────────────
function Pills({ items }: { items: { label: string; value: string; accent: string; onPress?: () => void }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7, marginBottom: 12 }}>
      {items.map(i => {
        if (i.onPress) {
          return (
            <TouchableOpacity key={i.label} style={[pi.pill, { backgroundColor: i.accent + '18' }]} onPress={i.onPress} activeOpacity={0.75}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={[pi.val, { color: i.accent }]}>{i.value}</Text>
                <Ionicons name="pencil-sharp" size={10} color={i.accent} />
              </View>
              <Text style={[pi.lbl, { color: i.accent + 'bb' }]}>{i.label}</Text>
            </TouchableOpacity>
          );
        }
        return (
          <View key={i.label} style={[pi.pill, { backgroundColor: i.accent + '18' }]}>
            <Text style={[pi.val, { color: i.accent }]}>{i.value}</Text>
            <Text style={[pi.lbl, { color: i.accent + 'bb' }]}>{i.label}</Text>
          </View>
        );
      })}
    </View>
  );
}
const pi = StyleSheet.create({
  pill: { flex: 1, alignItems: 'center', padding: 9, borderRadius: 11 },
  val: { fontSize: 14, fontWeight: '900' },
  lbl: { fontSize: 9, marginTop: 2, fontWeight: '600' },
});

function SectionTitle({ text, c }: any) {
  return <Text style={[s.sec, { color: c.sub }]}>{text}</Text>;
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function LogRoutineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const c = themeColors[theme];
  const insets = useSafeAreaInsets();
  const headerH = Math.max(insets.top, Platform.OS === 'android' ? 24 : 20) + 52;

  const { todayEvents, refreshSessions } = useBiogearsTwin();
  const { water, history: hydHist, reloadHistory } = useHydration();
  const { totals, foodEntries, activityEntries, totalActivityCalories, mealReminders } = useNutrition();
  const { activeSymptoms, historySymptoms, refreshSymptoms } = useSymptoms();

  const { isSwitched, activeMemberId, activeProfile, updateActiveProfile } = useFamily();
  const { profile, updateProfile } = useProfile();

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const currentProfile = isSwitched ? activeProfile : profile;
  const waterGoal = currentProfile?.waterGoal || 2000;

  const openGoalModal = () => {
    setGoalInput(String(waterGoal));
    setShowGoalModal(true);
  };

  const handleSaveGoal = async () => {
    const val = parseInt(goalInput.replace(/[^0-9]/g, ''), 10);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Goal', 'Please enter a valid hydration amount in mL.');
      return;
    }

    try {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        const updatedProfile = { ...activeProfile, waterGoal: val } as any;
        await updateActiveProfile(updatedProfile);
        await firebaseUpdateProfile({ waterGoal: val }, activeMemberId);
      } else {
        await updateProfile({ waterGoal: val });
      }
      setShowGoalModal(false);
    } catch (err) {
      console.log('❌ Error saving water goal:', err);
      Alert.alert('Error', 'Failed to update daily water goal.');
    }
  };

  const [tab, setTab] = useState<LogTab>('nutrition');

  useEffect(() => {
    if (params.tab && ['nutrition', 'exercise', 'sleep', 'hydration', 'symptoms'].includes(params.tab as string)) {
      setTab(params.tab as LogTab);
    }
  }, [params.tab]);

  // Reload hydration data whenever the screen gains focus or the hydration tab is opened
  useFocusEffect(
    useCallback(() => {
      reloadHistory();
    }, [reloadHistory])
  );

  // Also reload when user switches to the hydration tab explicitly
  useEffect(() => {
    if (tab === 'hydration') {
      reloadHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const [refreshing, setRefresh] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefresh(true);
    await Promise.all([refreshSessions(), refreshSymptoms()]).catch(() => { });
    setRefresh(false);
  }, [refreshSessions, refreshSymptoms]);

  useEffect(() => { refreshSymptoms(); }, []);

  const accent = TABS.find(t => t.id === tab)?.accent ?? '#38bdf8';

  // Filter BioGears events by type
  const bgMeals = todayEvents.filter(e => e.event_type === 'meal');
  const bgWater = todayEvents.filter(e => e.event_type === 'water');
  const bgSleep = todayEvents.filter(e => e.event_type === 'sleep');
  const bgEx = todayEvents.filter(e => e.event_type === 'exercise');

  const goMeal = () => router.push({ pathname: '/twin', params: { mode: 'routine', tab: 'meal' } } as any);
  const goWater = () => router.push({ pathname: '/twin', params: { mode: 'routine', tab: 'water' } } as any);
  const goSleep = () => router.push({ pathname: '/twin', params: { mode: 'routine', tab: 'sleep' } } as any);
  const goEx = () => router.push('/activity' as any);
  const goSym = () => router.push('/symptom-log' as any);

  // ── NUTRITION ───────────────────────────────────────────────────────────────
  const renderNutrition = () => {
    const allEmpty = foodEntries.length === 0 && bgMeals.length === 0;
    return (
      <>
        <ReminderCard tab="nutrition" accent={accent} c={c} />
        {totals.calories > 0 && (
          <Pills items={[
            { label: 'Calories', value: `${Math.round(totals.calories)} kcal`, accent },
            { label: 'Carbs', value: `${Math.round(totals.carbs)}g`, accent: '#f97316' },
            { label: 'Protein', value: `${Math.round(totals.protein)}g`, accent: '#10b981' },
            { label: 'Fat', value: `${Math.round(totals.fat)}g`, accent: '#ef4444' },
          ]} />
        )}
        {/* Meal reminders from nutrition context */}
        {mealReminders.filter(r => r.enabled).length > 0 && (
          <>
            <SectionTitle text="MEAL ALARMS" c={c} />
            {mealReminders.filter(r => r.enabled).map(r => (
              <View key={r.id} style={[ec.card, { backgroundColor: c.card }]}>
                <View style={[ec.box, { backgroundColor: accent + '20' }]}>
                  <Ionicons name="alarm" size={16} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[ec.title, { color: c.text }]}>{r.mealName}</Text>
                  <Text style={[ec.sub, { color: c.sub }]}>Daily at {r.time}</Text>
                </View>
                <View style={[s.pill, { backgroundColor: accent + '20' }]}>
                  <Text style={{ color: accent, fontSize: 10, fontWeight: '700' }}>ON</Text>
                </View>
              </View>
            ))}
          </>
        )}
        {/* Food entries from nutrition page - limited to prevent OOM on large datasets */}
        {foodEntries.length > 0 && (
          <>
            <SectionTitle text="FOOD LOGGED TODAY" c={c} />
            {foodEntries.slice(0, 15).map(f => (
              <EntryCard key={f.id} icon="🍽️" title={f.foodName || 'Food'}
                sub={`${Math.round(f.calories || 0)} kcal · P:${Math.round(f.protein || 0)}g C:${Math.round(f.carbs || 0)}g F:${Math.round(f.fat || 0)}g`}
                time={f.timestamp ? (() => { try { return new Date(f.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); } catch { return ''; } })() : ''}
                accent={accent} c={c} />
            ))}
            {foodEntries.length > 15 && <Text style={[s.sec, { color: c.sub, textAlign: 'center', marginTop: 4 }]}>+{foodEntries.length - 15} more entries today</Text>}
          </>
        )}
        {/* BioGears meal events - limited to prevent OOM */}
        {bgMeals.length > 0 && (
          <>
            <SectionTitle text="BIOGEARS MEAL EVENTS" c={c} />
            {bgMeals.slice(0, 10).map(e => (
              <EntryCard key={e.id} icon={e.displayIcon || '🍽️'} title={e.displayLabel || 'Meal'}
                sub={`${Math.round(e.value || 0)} kcal · synced to twin`}
                time={e.wallTime || ''} accent={accent} c={c} />
            ))}
            {bgMeals.length > 10 && <Text style={[s.sec, { color: c.sub, textAlign: 'center', marginTop: 4 }]}>+{bgMeals.length - 10} more twin events</Text>}
          </>
        )}
        {allEmpty && <Empty icon="🍽️" text={'No food logged today.\nTap to add meals to your twin log.'} btn="Log Meal" onPress={goMeal} accent={accent} c={c} />}
      </>
    );
  };

  // ── EXERCISE ────────────────────────────────────────────────────────────────
  const renderExercise = () => {
    const allEmpty = activityEntries.length === 0 && bgEx.length === 0;
    return (
      <>
        <ReminderCard tab="exercise" accent={accent} c={c} />
        {totalActivityCalories > 0 && (
          <Pills items={[
            { label: 'Burned', value: `${totalActivityCalories} kcal`, accent },
            { label: 'Sessions', value: `${activityEntries.length}`, accent: '#38bdf8' },
          ]} />
        )}
        {/* Activity Lab entries - limited to prevent OOM */}
        {activityEntries.length > 0 && (
          <>
            <SectionTitle text="ACTIVITY LAB" c={c} />
            {activityEntries.slice(0, 10).map((a: any) => (
              <EntryCard key={a.id} icon={a.activityIcon || '🏃'} title={a.activityName || 'Activity'}
                sub={`${a.intensity || 'Unknown'} · ${a.durationMins || 0} min · −${a.caloriesBurned || 0} kcal`}
                time="Today" accent={accent} c={c} />
            ))}
          </>
        )}
        {/* BioGears exercise events - limited to prevent OOM */}
        {bgEx.length > 0 && (
          <>
            <SectionTitle text="BIOGEARS SESSIONS" c={c} />
            {bgEx.slice(0, 10).map(e => (
              <EntryCard key={e.id} icon="🏃" title={e.displayLabel || 'Exercise'}
                sub={`${Math.round((e.value || 0) * 100)}% intensity · ${Math.round((e.duration_seconds || 0) / 60)} min`}
                time={e.wallTime || ''} accent={accent} c={c} />
            ))}
          </>
        )}
        {allEmpty && <Empty icon="💪" text={'No exercise logged today.\nUse Activity Lab or BioGears Log Routine.'} btn="Log Activity" onPress={goEx} accent={accent} c={c} />}
      </>
    );
  };

  // ── SLEEP ───────────────────────────────────────────────────────────────────
  const renderSleep = () => (
    <>
      <ReminderCard tab="sleep" accent={accent} c={c} />
      {bgSleep.length > 0 ? (
        <>
          <Pills items={[{
            label: 'Total Sleep',
            value: `${bgSleep.reduce((s, e) => s + (e.value || 0), 0).toFixed(1)}h`,
            accent,
          }]} />
          <SectionTitle text="SLEEP SESSIONS" c={c} />
          {bgSleep.map(e => (
            <EntryCard key={e.id} icon="😴" title={`${e.value}h sleep`}
              sub={e.displayLabel || 'Logged to BioGears twin'}
              time={e.wallTime} accent={accent} c={c} />
          ))}
        </>
      ) : (
        <Empty icon="🌙" text={"No sleep logged today.\nLog last night's sleep for circadian analysis."} btn="Log Sleep" onPress={goSleep} accent={accent} c={c} />
      )}
    </>
  );

  // ── HYDRATION ───────────────────────────────────────────────────────────────
  const renderHydration = () => {
    // Safely coerce hydHist to array — never crash on non-array data shapes
    const hydHistArray = Array.isArray(hydHist) ? (hydHist as any[]) : [];
    const allHydEmpty = hydHistArray.length === 0 && bgWater.length === 0;
    return (
      <>
        <ReminderCard tab="hydration" accent={accent} c={c} />
        <Pills items={[
          { label: 'Today', value: `${water || 0} mL`, accent },
          { label: 'Goal', value: `${waterGoal} mL`, accent: '#64748b', onPress: openGoalModal },
          { label: 'Remaining', value: `${Math.max(0, waterGoal - (water || 0))} mL`, accent: (water || 0) >= waterGoal ? '#10b981' : '#f59e0b' },
        ]} />
        {/* Raw hydration history - limited to prevent OOM */}
        {hydHistArray.length > 0 && (
          <>
            <SectionTitle text="INTAKE LOG" c={c} />
            {hydHistArray.slice(0, 12).map((e: any, i: number) => (
              <EntryCard key={e.id ?? i}
                icon={e.source === 'notification' ? '🔔' : '💧'}
                title={`+${e.amount || 0} mL`}
                sub={e.source === 'notification' ? 'From reminder' : 'Manual entry · running total: ' + (e.total || 0) + ' mL'}
                time={e.timestamp ? fmt(e.timestamp) : ''} accent={accent} c={c} />
            ))}
            {hydHistArray.length > 12 && <Text style={[s.sec, { color: c.sub, textAlign: 'center', marginTop: 4 }]}>+{hydHistArray.length - 12} more entries</Text>}
          </>
        )}
        {/* BioGears water events - limited to prevent OOM */}
        {bgWater.length > 0 && (
          <>
            <SectionTitle text="BIOGEARS WATER EVENTS" c={c} />
            {bgWater.slice(0, 10).map(e => (
              <EntryCard key={e.id} icon="💧" title={`${Math.round(e.value || 0)} mL`}
                sub="Synced to twin simulation" time={e.wallTime || ''} accent={accent} c={c} />
            ))}
          </>
        )}
        {allHydEmpty && <Empty icon="💧" text={`No hydration logged today.\nStay hydrated — aim for ${waterGoal} mL.`} btn="Log Water" onPress={goWater} accent={accent} c={c} />}
      </>
    );
  };

  const renderSymptoms = () => {
    const sev = (v: string) => v === 'emergency' ? '#ef4444' : v === 'severe' ? '#f97316' : v === 'moderate' ? '#f59e0b' : '#10b981';
    return (
      <>
        {activeSymptoms.length === 0 && historySymptoms.length === 0 ? (
          <Empty icon="🩺" text={'No symptoms logged.\nTrack how you feel over time.'} btn="Log Symptom" onPress={goSym} accent={accent} c={c} />
        ) : (
          <>
            {activeSymptoms.length > 0 && (
              <>
                <SectionTitle text="ACTIVE" c={c} />
                {activeSymptoms.map((sym: any) => (
                  <TouchableOpacity key={sym.id}
                    style={[ec.card, { backgroundColor: c.card }]}
                    onPress={() => router.push({ pathname: '/symptom-followup', params: { id: sym.id.toString(), name: sym.name } } as any)}>
                    <View style={[ec.box, { backgroundColor: sev(sym.severity) + '20' }]}>
                      <Ionicons name="medical" size={16} color={sev(sym.severity)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[ec.title, { color: c.text }]}>{sym.name}</Text>
                      <Text style={[ec.sub, { color: sev(sym.severity) }]}>{sym.severity} · {ago(sym.startedAt)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={c.sub} />
                  </TouchableOpacity>
                ))}
              </>
            )}
            {historySymptoms.length > 0 && (
              <>
                <SectionTitle text="RESOLVED" c={c} />
                {historySymptoms.slice(0, 5).map((sym: any) => (
                  <EntryCard key={sym.id} icon="🩹" title={sym.name}
                    sub={`Resolved · ${sym.severity}`}
                    time={sym.startedAt ? ago(sym.startedAt) : ''} accent="#64748b" c={c} />
                ))}
              </>
            )}
          </>
        )}
      </>
    );
  };

  const tabContent = () => {
    switch (tab) {
      case 'nutrition': return renderNutrition();
      case 'exercise': return renderExercise();
      case 'sleep': return renderSleep();
      case 'hydration': return renderHydration();
      case 'symptoms': return renderSymptoms();
    }
  };

  const logAction = () => {
    switch (tab) {
      case 'nutrition': return goMeal;
      case 'exercise': return goEx;
      case 'sleep': return goSleep;
      case 'hydration': return goWater;
      default: return goSym;
    }
  };

  return (
    <View style={[s.root, { backgroundColor: c.bg }]}>
      <Header title="Log Routine" showBack={false} />

      {/* Tab bar — absolutely positioned below the absolute Header, no layout space taken */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{
          position: 'absolute',
          top: headerH,
          left: 0,
          right: 0,
          height: 48,
          backgroundColor: c.bg,
          zIndex: 10,
          borderTopWidth: 8,
          borderTopColor: c.border,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
        contentContainerStyle={s.tabRow}>
        {TABS.map(t => {
          const active = t.id === tab;
          return (
            <TouchableOpacity key={t.id}
              style={[s.tabBtn, { borderColor: active ? t.accent : c.border }, active && { backgroundColor: t.accent }]}
              onPress={() => setTab(t.id)}>
              <Text style={{ fontSize: 13 }}>{t.icon}</Text>
              <Text style={[s.tabLabel, { color: active ? '#fff' : c.sub }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content scroll — paddingTop accounts for header + tab bar so content starts below both */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scroll, { paddingTop: headerH + 55 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} progressViewOffset={headerH + 44} />}
        showsVerticalScrollIndicator={false}>

        {/* Section header */}
        <View style={s.secHeader}>
          <Text style={[s.secTitle, { color: c.text }]}>
            {TABS.find(t => t.id === tab)?.icon} Today's {TABS.find(t => t.id === tab)?.label}
          </Text>
          <TouchableOpacity style={[s.addBtn, { backgroundColor: accent }]} onPress={logAction()}>
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={s.addBtnT}>Log</Text>
          </TouchableOpacity>
        </View>

        {tabContent()}

        {/* Twin shortcut */}
        <TouchableOpacity style={[s.twin, { backgroundColor: c.card }]} onPress={() => router.push('/twin' as any)}>
          <Text style={{ fontSize: 20 }}>🫀</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.twinT, { color: c.text }]}>View in Digital Twin</Text>
            <Text style={[s.twinS, { color: c.sub }]}>Full simulation dashboard & BioGears history</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.sub} />
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Water Goal Edit Modal ─────────────────────────────── */}
      <Modal visible={showGoalModal} transparent animationType="fade" onRequestClose={() => setShowGoalModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000077', justifyContent: 'center', alignItems: 'center', padding: 24 }}
            activeOpacity={1} onPress={() => setShowGoalModal(false)}>
            <TouchableOpacity activeOpacity={1} style={[gm.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={gm.row}>
                <Text style={{ fontSize: 28 }}>💧</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[gm.title, { color: c.text }]}>Daily Water Goal</Text>
                  <Text style={[gm.sub, { color: c.sub }]}>Set your personal hydration target in mL</Text>
                </View>
              </View>

              <Text style={[gm.label, { color: c.sub }]}>AMOUNT (mL)</Text>
              <View style={[gm.inputWrap, { backgroundColor: c.bg, borderColor: c.border }]}>
                <Ionicons name="water-outline" size={18} color="#64748b" style={{ marginHorizontal: 10 }} />
                <TextInput
                  style={[gm.input, { color: c.text }]}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="numeric"
                  placeholder="e.g. 2500"
                  placeholderTextColor={c.sub}
                  maxLength={5}
                  autoFocus
                />
                <Text style={[gm.unit, { color: c.sub }]}>mL</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                {[1500, 2000, 2500, 3000].map(v => (
                  <TouchableOpacity key={v} onPress={() => setGoalInput(String(v))}
                    style={[gm.preset, { backgroundColor: goalInput === String(v) ? '#0ea5e920' : c.bg, borderColor: goalInput === String(v) ? '#0ea5e9' : c.border }]}>
                    <Text style={[gm.presetTxt, { color: goalInput === String(v) ? '#0ea5e9' : c.sub }]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={[gm.btn, { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1 }]} onPress={() => setShowGoalModal(false)}>
                  <Text style={[gm.btnTxt, { color: c.sub }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[gm.btn, { backgroundColor: '#0ea5e9' }]} onPress={handleSaveGoal}>
                  <Text style={[gm.btnTxt, { color: '#fff' }]}>Save Goal</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 6 },
  tabRow: { paddingHorizontal: 12, paddingVertical: 4, gap: 8, flexDirection: 'row', alignItems: 'center' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 6, borderRadius: 18, borderWidth: 1 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  secHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  secTitle: { fontSize: 16, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 15 },
  addBtnT: { color: '#fff', fontSize: 13, fontWeight: '700' },
  sec: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  twin: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, marginTop: 16 },
  twinT: { fontSize: 14, fontWeight: '700' },
  twinS: { fontSize: 12, marginTop: 2 },
});

const gm = StyleSheet.create({
  card: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 22, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, marginBottom: 14, height: 48 },
  input: { flex: 1, fontSize: 20, fontWeight: '700', paddingVertical: 0 },
  unit: { fontSize: 13, fontWeight: '600', marginRight: 14 },
  preset: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  presetTxt: { fontSize: 12, fontWeight: '700' },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnTxt: { fontSize: 14, fontWeight: '700' },
});