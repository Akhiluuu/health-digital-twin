/**
 * QuickAddRow — User-customized one-tap shortcuts for common health events.
 * Persisted in AsyncStorage. Tapping a shortcut immediately runs the BioGears engine.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal,
  TextInput, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useNutrition } from '../../context/NutritionContext';
import { colors as themeColors } from '../../theme/colors';

const SHORTCUTS_STORAGE_KEY = 'biogears_custom_shortcuts';

const DEFAULT_SHORTCUTS = [
  {
    id: 'default-coffee',
    icon: '☕',
    label: 'Coffee',
    event_type: 'substance',
    value: 200,
    substance_name: 'Caffeine',
    displayLabel: 'Caffeine · 200mg',
    displayIcon: '☕',
  },
  {
    id: 'default-water',
    icon: '💧',
    label: 'Water Glass',
    event_type: 'water',
    value: 250,
    displayLabel: 'Water · 250mL',
    displayIcon: '💧',
  },
  {
    id: 'default-run',
    icon: '🏃',
    label: '30m Run',
    event_type: 'exercise',
    value: 0.6,
    duration_seconds: 1800,
    displayLabel: 'Run · 60% · 30min',
    displayIcon: '🏃',
  }
];

const EMOJI_OPTIONS = ['☕', '💧', '🍱', '🥗', '🚶', '🏃', '😴', '🧘', '🍺', '💊', '🧪', '🥛', '🍏', '🍕', '🍩', '🍫', '🍎', '🥩', '🥦', '🥪', '🥤'];

interface Props {
  addEventAndSimulate: (event: any, customSimName?: string) => Promise<void>;
  twinStatus: string;
}

export default function QuickAddRow({ addEventAndSimulate, twinStatus }: Props) {
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];
  const { twinUserId } = useBiogearsTwin();
  const { addFoodEntry } = useNutrition();

  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [shortcutIcon, setShortcutIcon] = useState('☕');
  const [shortcutLabel, setShortcutLabel] = useState('');
  const [shortcutEventType, setShortcutEventType] = useState<'meal' | 'water' | 'exercise' | 'substance' | 'sleep' | 'stress' | 'alcohol' | 'fast'>('meal');

  // Specific event inputs
  const [mealKcal, setMealKcal] = useState('400');
  const [mealCarbs, setMealCarbs] = useState('45');
  const [mealProtein, setMealProtein] = useState('20');
  const [mealFat, setMealFat] = useState('12');
  const [mealType, setMealType] = useState('balanced');

  const [waterMl, setWaterMl] = useState('250');

  const [exDuration, setExDuration] = useState('30');
  const [exIntensity, setExIntensity] = useState('0.5'); // 0.1 to 1.0

  const [subName, setSubName] = useState('Caffeine');
  const [subDose, setSubDose] = useState('150');

  const [sleepHours, setSleepHours] = useState('8');

  const [stressDur, setStressDur] = useState('15');
  const [stressLevel, setStressLevel] = useState('0.3'); // 0.1 to 1.0

  const [alcoholDrinks, setAlcoholDrinks] = useState('1');

  const [fastHours, setFastHours] = useState('16');

  // Load shortcuts on mount/profile switch
  useEffect(() => {
    loadShortcuts();
  }, [twinUserId]);

  const loadShortcuts = async () => {
    if (!twinUserId) return;
    try {
      const key = `biogears_custom_shortcuts_${twinUserId}`;
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        try { const p = JSON.parse(raw); if (Array.isArray(p)) setShortcuts(p); } catch {}
      } else {
        // Seed default shortcuts
        setShortcuts(DEFAULT_SHORTCUTS);
        await AsyncStorage.setItem(key, JSON.stringify(DEFAULT_SHORTCUTS));
      }
    } catch (e) {
      console.error('[QuickAdd] Load shortcuts error:', e);
    }
  };

  const saveShortcutsToStore = async (list: any[]) => {
    if (!twinUserId) return;
    try {
      const key = `biogears_custom_shortcuts_${twinUserId}`;
      await AsyncStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.error('[QuickAdd] Save shortcuts error:', e);
    }
  };

  const handleCreateShortcut = async () => {
    if (!shortcutLabel.trim()) {
      Alert.alert('Validation Error', 'Please enter a shortcut name.');
      return;
    }

    let value = 0;
    let extra: any = {};

    switch (shortcutEventType) {
      case 'meal': {
        const kcal = parseFloat(mealKcal);
        if (isNaN(kcal) || kcal < 5 || kcal > 10000) {
          Alert.alert('Validation Error', 'Meal calories must be between 5 and 10,000 kcal.');
          return;
        }
        const carbs = parseFloat(mealCarbs) || 0;
        const protein = parseFloat(mealProtein) || 0;
        const fat = parseFloat(mealFat) || 0;
        if (carbs < 0 || protein < 0 || fat < 0) {
          Alert.alert('Validation Error', 'Macro nutrients cannot be negative.');
          return;
        }
        value = kcal;
        extra = {
          meal_type: mealType,
          carb_g: carbs,
          protein_g: protein,
          fat_g: fat,
        };
        break;
      }
      case 'water': {
        const ml = parseFloat(waterMl);
        if (isNaN(ml) || ml < 5 || ml > 10000) {
          Alert.alert('Validation Error', 'Water volume must be between 5 and 10,000 mL.');
          return;
        }
        value = ml;
        break;
      }
      case 'exercise': {
        const mins = parseFloat(exDuration);
        if (isNaN(mins) || mins < 1 || mins > 240) {
          Alert.alert('Validation Error', 'Workout duration must be between 1 and 240 minutes.');
          return;
        }
        const intensity = parseFloat(exIntensity);
        if (isNaN(intensity) || intensity < 0.1 || intensity > 1.0) {
          Alert.alert('Validation Error', 'Workout intensity must be between 0.1 and 1.0.');
          return;
        }
        value = intensity;
        extra = {
          duration_seconds: mins * 60,
        };
        break;
      }
      case 'substance': {
        const dose = parseFloat(subDose);
        if (isNaN(dose) || dose <= 0) {
          Alert.alert('Validation Error', 'Substance dose must be greater than 0.');
          return;
        }
        const name = subName.trim();
        if (!name) {
          Alert.alert('Validation Error', 'Please specify the substance name.');
          return;
        }
        value = dose;
        extra = {
          substance_name: name,
        };
        break;
      }
      case 'sleep': {
        const hours = parseFloat(sleepHours);
        if (isNaN(hours) || hours < 0.25 || hours > 14.0) {
          Alert.alert('Validation Error', 'Sleep duration must be between 0.25 and 14.0 hours.');
          return;
        }
        value = hours;
        break;
      }
      case 'stress': {
        const mins = parseFloat(stressDur);
        if (isNaN(mins) || mins < 1 || mins > 240) {
          Alert.alert('Validation Error', 'Stress duration must be between 1 and 240 minutes.');
          return;
        }
        const level = parseFloat(stressLevel);
        if (isNaN(level) || level < 0.1 || level > 1.0) {
          Alert.alert('Validation Error', 'Stress level must be between 0.1 and 1.0.');
          return;
        }
        value = level;
        extra = {
          duration_seconds: mins * 60,
        };
        break;
      }
      case 'alcohol': {
        const drinks = parseFloat(alcoholDrinks);
        if (isNaN(drinks) || drinks < 0.1 || drinks > 10.0) {
          Alert.alert('Validation Error', 'Alcohol drinks must be between 0.1 and 10 standard drinks.');
          return;
        }
        value = drinks;
        break;
      }
      case 'fast': {
        const hours = parseFloat(fastHours);
        if (isNaN(hours) || hours < 1.0 || hours > 48.0) {
          Alert.alert('Validation Error', 'Fasting duration must be between 1 and 48 hours.');
          return;
        }
        value = hours;
        break;
      }
    }

    const newShortcut = {
      id: `shortcut_${Date.now()}`,
      icon: shortcutIcon,
      label: shortcutLabel.trim(),
      event_type: shortcutEventType,
      value,
      ...extra,
    };

    const updated = [...shortcuts, newShortcut];
    setShortcuts(updated);
    await saveShortcutsToStore(updated);

    // Reset form
    setShortcutLabel('');
    setShortcutIcon('☕');
    setShortcutEventType('meal');
    setModalVisible(false);
  };

  const handleDeleteShortcut = (id: string, name: string) => {
    Alert.alert('Delete Shortcut', `Remove "${name}" from Quick Add shortcuts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = shortcuts.filter(s => s.id !== id);
          setShortcuts(updated);
          await saveShortcutsToStore(updated);
        }
      }
    ]);
  };

  const handleTapShortcut = async (s: any) => {
    if (twinStatus !== 'ready') {
      Alert.alert(
        'Baseline Calibration Required',
        'Your baseline clinical twin profile must be completed/calibrated before you can trigger quick add events.'
      );
      return;
    }

    setLoading(true);
    try {
      const pad = (n: number) => String(n).padStart(2, '0');
      const now = new Date();
      const wallTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const eventPayload = {
        event_type: s.event_type,
        value: s.value,
        wallTime,
        substance_name: s.substance_name,
        meal_type: s.meal_type,
        carb_g: s.carb_g,
        protein_g: s.protein_g,
        fat_g: s.fat_g,
        duration_seconds: s.duration_seconds,
        displayLabel: s.displayLabel || `${s.label} · ${s.value}`,
        displayIcon: s.icon,
      };

      if (s.event_type === 'meal') {
        // Sync with NutritionContext
        await addFoodEntry({
          foodId: s.id || 'shortcut',
          foodName: s.label || 'Meal Shortcut',
          calories: s.value,
          protein: s.protein_g || 0,
          carbs: s.carb_g || 0,
          fat: s.fat_g || 0,
          sugar: 0,
          sodium: 0,
          fiber: 0,
          mealId: s.meal_type === 'custom' ? 'snacks' : s.meal_type || 'snacks',
        });
      }

      await addEventAndSimulate(eventPayload, `${s.label} Sim`);
    } catch (e: any) {
      Alert.alert('Simulation Error', e.message || 'Could not execute simulation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: c.sub }]}>⚡ Quick Add Shortcuts</Text>
        {loading && <ActivityIndicator size="small" color={c.active} style={{ marginLeft: 8 }} />}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={{ paddingRight: 16 }}>
        <TouchableOpacity
          style={[styles.plusChip, { backgroundColor: c.card, borderColor: c.active }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.75}
        >
          <Ionicons name="add" size={22} color={c.active} />
          <Text style={[styles.plusLabel, { color: c.active }]}>Add New</Text>
        </TouchableOpacity>

        {shortcuts.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.chip, { backgroundColor: c.card, borderColor: c.border }]}
            onPress={() => handleTapShortcut(s)}
            onLongPress={() => handleDeleteShortcut(s.id, s.label)}
            activeOpacity={0.75}
          >
            <Text style={styles.chipIcon}>{s.icon}</Text>
            <Text style={[styles.chipLabel, { color: c.text }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Creation Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardContainer}
          >
            <Pressable style={[styles.modalCard, { backgroundColor: c.card }]} onPress={e => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: c.text }]}>New Shortcut</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={24} color={c.sub} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Shortcut Name */}
                <Text style={[styles.label, { color: c.sub }]}>Shortcut Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
                  placeholder="e.g. 'Whey Shake' or 'Bedtime'"
                  placeholderTextColor={c.sub}
                  value={shortcutLabel}
                  onChangeText={setShortcutLabel}
                />

                {/* Icon Selector */}
                <Text style={[styles.label, { color: c.sub }]}>Select Icon</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
                  {EMOJI_OPTIONS.map(emoji => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.emojiBtn, shortcutIcon === emoji && { backgroundColor: c.active + '20', borderColor: c.active }]}
                      onPress={() => setShortcutIcon(emoji)}
                    >
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Event Type selection */}
                <Text style={[styles.label, { color: c.sub }]}>Event Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                  {([
                    { id: 'meal', label: 'Meal', icon: 'fast-food' },
                    { id: 'water', label: 'Water', icon: 'water' },
                    { id: 'exercise', label: 'Workout', icon: 'fitness' },
                    { id: 'substance', label: 'Substance', icon: 'cafe' },
                    { id: 'sleep', label: 'Sleep', icon: 'moon' },
                    { id: 'stress', label: 'Stress', icon: 'warning' },
                    { id: 'alcohol', label: 'Alcohol', icon: 'beer' },
                    { id: 'fast', label: 'Fasting', icon: 'hourglass' },
                  ] as const).map(t => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeBtn, { backgroundColor: c.bg, borderColor: c.border }, shortcutEventType === t.id && { borderColor: c.active, backgroundColor: c.active + '10' }]}
                      onPress={() => setShortcutEventType(t.id)}
                    >
                      <Ionicons name={t.icon as any} size={16} color={shortcutEventType === t.id ? c.active : c.sub} />
                      <Text style={[styles.typeLabel, { color: shortcutEventType === t.id ? c.active : c.sub }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Parameter inputs based on Event Type */}
                <View style={styles.divider} />

                {shortcutEventType === 'meal' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Meal Properties</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.miniLabel}>Calories (kcal)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={mealKcal} onChangeText={setMealKcal} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Carbs (g)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={mealCarbs} onChangeText={setMealCarbs} />
                      </View>
                    </View>
                    <View style={styles.row}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.miniLabel}>Protein (g)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={mealProtein} onChangeText={setMealProtein} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Fat (g)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={mealFat} onChangeText={setMealFat} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'water' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Water Volume</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Amount (mL)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={waterMl} onChangeText={setWaterMl} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'exercise' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Workout Properties</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.miniLabel}>Duration (mins)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={exDuration} onChangeText={setExDuration} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Intensity (0.1 - 1.0)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={exIntensity} onChangeText={setExIntensity} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'substance' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Substance Properties</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.miniLabel}>Substance Name</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} value={subName} onChangeText={setSubName} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Dose (mg)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={subDose} onChangeText={setSubDose} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'sleep' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Sleep Duration</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Duration (hours)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={sleepHours} onChangeText={setSleepHours} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'stress' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Stress Properties</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.miniLabel}>Duration (mins)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={stressDur} onChangeText={setStressDur} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Level (0.1 - 1.0)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={stressLevel} onChangeText={setStressLevel} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'alcohol' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Alcohol Level</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Number of Drinks</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={alcoholDrinks} onChangeText={setAlcoholDrinks} />
                      </View>
                    </View>
                  </View>
                )}

                {shortcutEventType === 'fast' && (
                  <View>
                    <Text style={[styles.label, { color: c.sub }]}>Fast Properties</Text>
                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.miniLabel}>Duration (hours)</Text>
                        <TextInput style={[styles.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]} keyboardType="numeric" value={fastHours} onChangeText={setFastHours} />
                      </View>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: c.active }]}
                  onPress={handleCreateShortcut}
                >
                  <Text style={styles.saveBtnText}>Save Shortcut</Text>
                </TouchableOpacity>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  scroll: { overflow: 'visible' },
  plusChip: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
    marginRight: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', gap: 4,
    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, elevation: 1,
  },
  plusLabel: { fontSize: 10, fontWeight: '700' },
  chip: {
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    marginRight: 8, alignItems: 'center', borderWidth: 1, minWidth: 80,
    flexDirection: 'row', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chipIcon: { fontSize: 18 },
  chipLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  keyboardContainer: { width: '100%' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  miniLabel: { fontSize: 10, color: '#64748b', marginBottom: 4 },
  input: { borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 14, marginBottom: 8 },
  emojiScroll: { flexDirection: 'row', paddingVertical: 4 },
  emojiBtn: { padding: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 8, marginRight: 6 },
  typeScroll: { flexDirection: 'row', paddingVertical: 6 },
  typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8 },
  typeLabel: { fontSize: 11, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(100,116,139,0.15)', marginVertical: 12 },
  row: { flexDirection: 'row', gap: 8 },
  saveBtn: { borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
