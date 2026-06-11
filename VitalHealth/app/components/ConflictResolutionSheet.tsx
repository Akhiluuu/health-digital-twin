/**
 * ConflictResolutionSheet.tsx
 *
 * Bottom-sheet modal for resolving timeline event conflicts when a Saved Routine
 * or Baseline Fill has events that overlap with existing manually-entered events.
 *
 * Design:
 *  - Shows each conflict as a card: existing (manual) vs incoming (routine/baseline)
 *  - Three resolution choices per conflict: Keep Mine / Use Routine / Keep Both
 *  - Global "Apply to all remaining" shortcut
 *  - Confirm button commits all resolutions
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { EventConflict } from '../../context/BiogearsTwinContext';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

const { height: SCREEN_H } = Dimensions.get('window');
type Resolution = 'keep_mine' | 'use_routine' | 'keep_both';

interface Props {
  conflicts: EventConflict[];
  onResolve: (resolutions: Record<string, Resolution>) => void;
  onDismiss: () => void;
  visible: boolean;
  /** 'routine' when loading a saved routine, 'baseline' when filling baseline */
  mode?: 'routine' | 'baseline';
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Your Entry',
  routine: 'Saved Routine',
  baseline: 'Baseline',
};

const EVENT_ICON: Record<string, string> = {
  meal: '🍽️',
  exercise: '🏃',
  sleep: '😴',
  water: '💧',
  substance: '💊',
  stress: '😰',
  alcohol: '🍺',
  fast: '⏳',
  environment: '🌡️',
};

function formatWallTime(wt?: any): string {
  if (!wt) return '';
  const [hh, mm] = String(wt || '').split(':').map(Number);
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
}

function ConflictCard({
  conflict,
  resolution,
  onPick,
  mode,
  c,
}: {
  conflict: EventConflict;
  resolution: Resolution;
  onPick: (r: Resolution) => void;
  mode: 'routine' | 'baseline';
  c: any;
}) {
  const { existing, incoming } = conflict;
  const incomingLabel = mode === 'baseline' ? 'Baseline' : 'Saved Routine';

  const choices: { key: Resolution; label: string; icon: string; color: string }[] = [
    { key: 'keep_mine',   label: 'Keep Mine',        icon: 'person',        color: '#6366f1' },
    { key: 'use_routine', label: `Use ${incomingLabel}`, icon: 'refresh',   color: '#f59e0b' },
    { key: 'keep_both',   label: 'Keep Both',        icon: 'layers',        color: '#22c55e' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: c.bg, borderColor: c.border }]}>
      {/* Conflict header */}
      <View style={styles.cardHeader}>
        <Text style={styles.eventIcon}>
          {EVENT_ICON[existing.event_type] ?? '📝'}
        </Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eventType, { color: c.text }]}>
            {existing.event_type.charAt(0).toUpperCase() + existing.event_type.slice(1)}
          </Text>
          <Text style={styles.conflictSubtitle}>Two similar events at the same time</Text>
        </View>
      </View>

      {/* Side by side comparison */}
      <View style={styles.compareRow}>
        {/* Existing (manual) */}
        <View style={[styles.compareBox, styles.compareBoxLeft, { backgroundColor: c.card }]}>
          <Text style={styles.compareLabel}>🔵 {SOURCE_LABEL[existing.source ?? 'manual']}</Text>
          <Text style={[styles.compareName, { color: c.text }]} numberOfLines={2}>
            {existing.displayLabel || existing.event_type}
          </Text>
          <Text style={[styles.compareTime, { color: c.subText }]}>{formatWallTime(existing.wallTime)}</Text>
          {existing.value != null && (
            <Text style={styles.compareValue}>
              {existing.event_type === 'meal' ? `${existing.value} kcal` :
               existing.event_type === 'exercise' ? `${Math.round(existing.value * 100)}% intensity` :
               existing.event_type === 'sleep' ? `${existing.value} hrs` :
               String(existing.value)}
            </Text>
          )}
        </View>

        <View style={styles.vsWrapper}>
          <Text style={[styles.vsText, { color: c.subText }]}>VS</Text>
        </View>

        {/* Incoming (routine/baseline) */}
        <View style={[styles.compareBox, styles.compareBoxRight, { backgroundColor: c.card }]}>
          <Text style={styles.compareLabel}>
            {mode === 'baseline' ? '🟢 Baseline' : '🟡 Routine'}
          </Text>
          <Text style={[styles.compareName, { color: c.text }]} numberOfLines={2}>
            {incoming.displayLabel || incoming.event_type}
          </Text>
          <Text style={[styles.compareTime, { color: c.subText }]}>{formatWallTime(incoming.wallTime)}</Text>
          {incoming.value != null && (
            <Text style={styles.compareValue}>
              {incoming.event_type === 'meal' ? `${incoming.value} kcal` :
               incoming.event_type === 'exercise' ? `${Math.round(incoming.value * 100)}% intensity` :
               incoming.event_type === 'sleep' ? `${incoming.value} hrs` :
               String(incoming.value)}
            </Text>
          )}
        </View>
      </View>

      {/* Resolution buttons */}
      <View style={styles.choiceRow}>
        {choices.map(cBox => (
          <TouchableOpacity
            key={cBox.key}
            style={[
              styles.choiceBtn,
              { backgroundColor: c.card, borderColor: c.border },
              resolution === cBox.key && { backgroundColor: cBox.color + '18', borderColor: cBox.color },
            ]}
            onPress={() => onPick(cBox.key)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={cBox.icon as any}
              size={13}
              color={resolution === cBox.key ? cBox.color : c.subText}
            />
            <Text style={[styles.choiceTxt, { color: c.subText }, resolution === cBox.key && { color: cBox.color }]}>
              {cBox.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export function ConflictResolutionSheet({ conflicts, onResolve, onDismiss, visible, mode = 'routine' }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];

  // Initialise all resolutions to 'keep_mine' (user's entry wins by default)
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>(() => {
    const init: Record<string, Resolution> = {};
    for (const cConflict of conflicts) init[cConflict.fingerprint] = 'keep_mine';
    return init;
  });

  const pick = useCallback((fingerprint: string, r: Resolution) => {
    setResolutions(prev => ({ ...prev, [fingerprint]: r }));
  }, []);

  const applyAll = useCallback((r: Resolution) => {
    const all: Record<string, Resolution> = {};
    for (const cConflict of conflicts) all[cConflict.fingerprint] = r;
    setResolutions(all);
  }, [conflicts]);

  const confirm = useCallback(() => {
    onResolve(resolutions);
  }, [resolutions, onResolve]);

  if (!visible || conflicts.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + 16 }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: theme === 'dark' ? '#1e294b' : '#cbd5e1' }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: c.text }]}>⚠️ {conflicts.length} Event Conflict{conflicts.length > 1 ? 's' : ''}</Text>
              <Text style={[styles.sheetSubtitle, { color: c.subText }]}>
                {mode === 'baseline'
                  ? 'Baseline events overlap with things you already logged. Choose what to keep.'
                  : 'Saved routine events overlap with your existing timeline. Review each conflict below.'}
              </Text>
            </View>
            <TouchableOpacity onPress={onDismiss} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={c.subText} />
            </TouchableOpacity>
          </View>

          {/* Bulk actions */}
          <View style={[styles.bulkRow, { borderBottomColor: c.border }]}>
            <Text style={[styles.bulkLabel, { color: c.subText }]}>Apply to all:</Text>
            {(['keep_mine', 'use_routine', 'keep_both'] as Resolution[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.bulkBtn, { backgroundColor: c.bg, borderColor: c.border }]}
                onPress={() => applyAll(r)}
              >
                <Text style={[styles.bulkBtnTxt, { color: c.text }]}>
                  {r === 'keep_mine' ? 'Keep Mine' : r === 'use_routine' ? `Use ${mode === 'baseline' ? 'Baseline' : 'Routine'}` : 'Keep Both'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Conflict list */}
          <ScrollView
            style={{ maxHeight: SCREEN_H * 0.45 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingBottom: 8 }}
          >
            {conflicts.map(cConflict => (
              <ConflictCard
                key={cConflict.fingerprint}
                conflict={cConflict}
                resolution={resolutions[cConflict.fingerprint] ?? 'keep_mine'}
                onPick={r => pick(cConflict.fingerprint, r)}
                mode={mode}
                c={c}
              />
            ))}
          </ScrollView>

          {/* Confirm */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: c.active }]} onPress={confirm} activeOpacity={0.8}>
              <Text style={styles.confirmTxt}>✓ Apply Resolutions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
              <Text style={[styles.cancelTxt, { color: c.subText }]}>Keep All Mine &amp; Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  sheetTitle: {
    color: '#f3f4f6',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  sheetSubtitle: {
    color: '#9ca3af',
    fontSize: 12,
    lineHeight: 17,
  },
  closeBtn: {
    padding: 4,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    marginBottom: 8,
  },
  bulkLabel: {
    color: '#6b7280',
    fontSize: 11,
    marginRight: 4,
  },
  bulkBtn: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  bulkBtnTxt: {
    color: '#d1d5db',
    fontSize: 11,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  eventIcon: {
    fontSize: 24,
  },
  eventType: {
    color: '#f3f4f6',
    fontSize: 14,
    fontWeight: '700',
  },
  conflictSubtitle: {
    color: '#f59e0b',
    fontSize: 11,
    marginTop: 1,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginBottom: 12,
  },
  compareBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 10,
    gap: 3,
  },
  compareBoxLeft: {
    borderWidth: 1,
    borderColor: '#4f46e5',
  },
  compareBoxRight: {
    borderWidth: 1,
    borderColor: '#d97706',
  },
  compareLabel: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  compareName: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  compareTime: {
    color: '#6b7280',
    fontSize: 11,
  },
  compareValue: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
  },
  vsWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  vsText: {
    color: '#4b5563',
    fontSize: 11,
    fontWeight: '800',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 6,
  },
  choiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#111827',
  },
  choiceTxt: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  confirmTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelTxt: {
    color: '#6b7280',
    fontSize: 13,
  },
});
