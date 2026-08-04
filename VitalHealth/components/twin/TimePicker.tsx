// components/twin/TimePicker.tsx
// Custom themed time picker — no OS-native dialogs, fully matches app dark/light theme.
// Renders a drum-style HH : MM selector inside the app's own Modal + card.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList, Modal, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

const ITEM_H = 48;     // height of each drum item (px)
const VISIBLE = 5;     // how many items show at once (must be odd)
const DRUM_H  = ITEM_H * VISIBLE;
const MID_OFFSET = Math.floor(VISIBLE / 2); // 2

// Generate [0 … max-1] as zero-padded strings, tripled so the user can
// scroll in either direction without hitting a hard boundary.
function makeItems(max: number): string[] {
  const base = Array.from({ length: max }, (_, i) => pad(i));
  return [...base, ...base, ...base];   // triple
}

const HOURS   = makeItems(24);
const MINUTES = makeItems(60);

// ─── DrumColumn ──────────────────────────────────────────────────────────────

function DrumColumn({
  items,
  count,     // 24 or 60 — the "real" length of one cycle
  initial,   // starting index (0-based)
  accent,
  c,
  onChange,
}: {
  items: string[];
  count: number;
  initial: number;
  accent: string;
  c: any;
  onChange: (v: number) => void;
}) {
  const ref = useRef<FlatList>(null);

  // Start at middle copy so user can scroll up and down
  const [current, setCurrent] = useState(initial);

  const scrollTo = useCallback(
    (idx: number, animated: boolean) => {
      // clamp to middle copy range
      const clamped = count + (idx % count);
      ref.current?.scrollToOffset({ offset: (clamped - MID_OFFSET) * ITEM_H, animated });
    },
    [count]
  );

  // Jump to the middle triple on mount (no animation)
  const didMount = useRef(false);
  const onLayout = useCallback(() => {
    if (didMount.current) return;
    didMount.current = true;
    scrollTo(initial, false);
  }, [initial, scrollTo]);

  // Sync state if initial value changes externally/on modal open
  useEffect(() => {
    setCurrent(initial);
    if (didMount.current) {
      scrollTo(initial, false);
    }
  }, [initial, scrollTo]);

  const onMomentumEnd = useCallback(
    (e: any) => {
      const offset = e.nativeEvent.contentOffset.y;
      const rawIdx = Math.round(offset / ITEM_H);
      const selectedIdx = rawIdx + MID_OFFSET;
      const value  = selectedIdx % count;
      setCurrent(value);
      onChange(value);
      // Re-centre into the middle copy to keep infinite-scroll illusion
      const centred = count + value;
      ref.current?.scrollToOffset({ offset: (centred - MID_OFFSET) * ITEM_H, animated: false });
    },
    [count, onChange]
  );

  const onScrollEndDrag = useCallback(
    (e: any) => {
      const velocityY = e.nativeEvent.velocity ? e.nativeEvent.velocity.y : 0;
      if (velocityY === 0) {
        onMomentumEnd(e);
      }
    },
    [onMomentumEnd]
  );

  const handleScroll = useCallback(
    (e: any) => {
      const offset = e.nativeEvent.contentOffset.y;
      const rawIdx = Math.round(offset / ITEM_H);
      const selectedIdx = rawIdx + MID_OFFSET;
      const value = ((selectedIdx % count) + count) % count;
      if (!isNaN(value) && value !== current) {
        setCurrent(value);
        onChange(value);
      }
    },
    [count, current, onChange]
  );

  return (
    <View style={[drumStyles.column, { height: DRUM_H }]}>
      {/* Highlight bar behind the selected row */}
      <View
        pointerEvents="none"
        style={[
          drumStyles.highlight,
          {
            top: ITEM_H * MID_OFFSET,
            height: ITEM_H,
            backgroundColor: accent + '22',
            borderColor: accent + '55',
          },
        ]}
      />

      <FlatList
        ref={ref}
        data={items}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onLayout={onLayout}
        onScroll={handleScroll}
        onMomentumScrollEnd={onMomentumEnd}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
        renderItem={({ item, index }) => {
          const val = index % count;
          const selected = val === current;
          return (
            <TouchableOpacity
              activeOpacity={0.7}
              style={[drumStyles.item, { height: ITEM_H }]}
              onPress={() => {
                setCurrent(val);
                onChange(val);
                scrollTo(val, true);
              }}
            >
              <Text
                style={[
                  drumStyles.itemTxt,
                  { color: selected ? accent : c.sub },
                  selected && { fontWeight: '800', fontSize: 28, color: accent },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

// ─── TimePicker ──────────────────────────────────────────────────────────────

export default function TimePicker({
  value,
  onChange,
  accent = '#38bdf8',
}: {
  value: string;
  onChange: (t: string) => void;
  accent?: string;
}) {
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];

  const parseTime = (v: any): [number, number] => {
    if (!v || typeof v !== 'string') return [new Date().getHours(), new Date().getMinutes()];
    const [h, m] = v.split(':').map(Number);
    return [isNaN(h) ? 0 : h, isNaN(m) ? 0 : m];
  };

  const [open, setOpen]       = useState(false);
  const [selH, setSelH]       = useState(() => parseTime(value)[0]);
  const [selM, setSelM]       = useState(() => parseTime(value)[1]);
  // Keep a local draft while the drum is open; only commit on "Done"
  const draftH = useRef(selH);
  const draftM = useRef(selM);

  const openPicker = () => {
    const [h, m] = parseTime(value);
    setSelH(h);
    setSelM(m);
    draftH.current = h;
    draftM.current = m;
    setOpen(true);
  };

  const confirm = () => {
    onChange(`${pad(draftH.current)}:${pad(draftM.current)}`);
    setOpen(false);
  };

  const displayTime = () => {
    const [h, m] = parseTime(value);
    const ampm  = h >= 12 ? 'PM' : 'AM';
    const h12   = h % 12 || 12;
    return `${h12}:${pad(m)} ${ampm}`;
  };

  return (
    <>
      {/* ── Trigger button ── */}
      <TouchableOpacity
        onPress={openPicker}
        style={[tp.trigger, { borderColor: c.border, backgroundColor: c.card }]}
        activeOpacity={0.8}
      >
        <Text style={[tp.triggerTxt, { color: c.text }]}>{displayTime()}</Text>
        <Ionicons name="time-outline" size={18} color={accent} />
      </TouchableOpacity>

      {/* ── Modal picker ── */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={tp.overlay}>
          <View style={[tp.sheet, { backgroundColor: c.card, borderColor: c.border }]}>

            {/* Header */}
            <View style={tp.sheetHeader}>
              <Text style={[tp.sheetTitle, { color: c.text }]}>Select Time</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Ionicons name="close" size={22} color={c.sub} />
              </TouchableOpacity>
            </View>

            {/* Drums */}
            <View style={tp.drums}>
              <DrumColumn
                items={HOURS}
                count={24}
                initial={selH}
                accent={accent}
                c={c}
                onChange={v => { draftH.current = v; }}
              />

              <Text style={[tp.colon, { color: accent }]}>:</Text>

              <DrumColumn
                items={MINUTES}
                count={60}
                initial={selM}
                accent={accent}
                c={c}
                onChange={v => { draftM.current = v; }}
              />
            </View>

            {/* Divider */}
            <View style={[tp.divider, { backgroundColor: c.border }]} />

            {/* Actions */}
            <View style={tp.actions}>
              <TouchableOpacity
                style={[tp.btn, { borderColor: c.border, borderWidth: 1.5 }]}
                onPress={() => setOpen(false)}
              >
                <Text style={[tp.btnTxt, { color: c.sub }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[tp.btn, { backgroundColor: accent }]}
                onPress={confirm}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[tp.btnTxt, { color: '#fff' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const drumStyles = StyleSheet.create({
  column:    { width: 80, overflow: 'hidden' },
  item:      { alignItems: 'center', justifyContent: 'center' },
  itemTxt:   { fontSize: 22, fontWeight: '500' },
  highlight: {
    position: 'absolute', left: 0, right: 0,
    borderTopWidth: 1.5, borderBottomWidth: 1.5, borderRadius: 10,
  },
});

const tp = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1.5,
  },
  triggerTxt: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 340,
    borderRadius: 28, borderWidth: 1.5,
    overflow: 'hidden', paddingBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 22, paddingTop: 20, paddingBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },

  drums: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 4,
  },
  colon: { fontSize: 32, fontWeight: '900', paddingBottom: 4, marginHorizontal: 4 },

  divider: { height: 1, marginHorizontal: 20, marginTop: 8 },

  actions: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 14,
  },
  btnTxt: { fontSize: 15, fontWeight: '700' },
});
