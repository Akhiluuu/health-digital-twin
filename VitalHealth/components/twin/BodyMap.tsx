/**
 * BodyMap — Simplified human body silhouette with organ health markers.
 * Organs are placed anatomically and color-coded by their health score.
 * Tapping an organ shows its component vitals in a bottom-sheet style overlay.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, ScrollView } from 'react-native';

const W = Dimensions.get('window').width;
const BODY_H = 340;
const BODY_W = W - 48; // horizontal padding

interface OrganData {
  score: number;
  status: string;
}

interface Props {
  scores: Record<string, OrganData>;
  c: any; // theme colors
}

interface OrganPlacement {
  key: string;
  label: string;
  emoji: string;
  // Position as fraction of body dimensions (0-1)
  x: number; // 0 = left edge, 1 = right edge
  y: number; // 0 = top, 1 = bottom
  detail: string;
}

const ORGANS: OrganPlacement[] = [
  { key: 'brain',  label: 'Brain',  emoji: '🧠', x: 0.5,  y: 0.06, detail: 'Core temp stability · HR regulation' },
  { key: 'heart',  label: 'Heart',  emoji: '🫀', x: 0.44, y: 0.28, detail: 'HR · Systolic BP · Diastolic BP' },
  { key: 'lungs',  label: 'Lungs',  emoji: '🫁', x: 0.62, y: 0.28, detail: 'SpO₂ · Respiration rate' },
  { key: 'liver',  label: 'Liver',  emoji: '🟤', x: 0.60, y: 0.42, detail: 'Glucose metabolism · Detoxification' },
  { key: 'gut',    label: 'Gut',    emoji: '🦠', x: 0.50, y: 0.52, detail: 'Glucose · Core temperature balance' },
  { key: 'legs',   label: 'Legs',   emoji: '🦵', x: 0.50, y: 0.82, detail: 'Peripheral circulation · Exercise output' },
];

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

export default function BodyMap({ scores, c }: Props) {
  const [selected, setSelected] = useState<OrganPlacement | null>(null);
  const selectedData = selected ? scores[selected.key] : null;

  return (
    <View style={[styles.wrap, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.text }]}>Organ Health Map</Text>

      {/* Body figure + organ markers */}
      <View style={[styles.body, { width: BODY_W - 32 }]}>
        {/* Silhouette figure using text/View shapes */}
        <View style={styles.silhouetteWrap}>
          {/* Head */}
          <View style={[styles.head, { borderColor: c.border }]} />
          {/* Torso */}
          <View style={[styles.torso, { borderColor: c.border }]} />
          {/* Arms */}
          <View style={styles.armsRow}>
            <View style={[styles.arm, { borderColor: c.border }]} />
            <View style={{ width: 50 }} />
            <View style={[styles.arm, { borderColor: c.border }]} />
          </View>
          {/* Legs */}
          <View style={styles.legsRow}>
            <View style={[styles.leg, { borderColor: c.border }]} />
            <View style={[styles.leg, { borderColor: c.border }]} />
          </View>
        </View>

        {/* Organ markers — absolutely positioned */}
        {ORGANS.map(organ => {
          const data = scores[organ.key];
          if (!data) return null;
          const color = scoreColor(data.score);
          const left = organ.x * (BODY_W - 80) - 18;
          const top  = organ.y * BODY_H - 18;
          return (
            <TouchableOpacity
              key={organ.key}
              style={[styles.organDot, { left, top, borderColor: color, backgroundColor: color + '22' }]}
              onPress={() => setSelected(organ)}
              activeOpacity={0.7}
            >
              <Text style={styles.organEmoji}>{organ.emoji}</Text>
              <View style={[styles.scoreBadge, { backgroundColor: color }]}>
                <Text style={styles.scoreBadgeTxt}>{data.score}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
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

      {/* Organ detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setSelected(null)}>
          <View style={[styles.sheet, { backgroundColor: c.card }]}>
            <View style={[styles.sheetHandle, { backgroundColor: c.border }]} />
            {selected && selectedData && (
              <>
                <Text style={styles.sheetEmoji}>{selected.emoji}</Text>
                <Text style={[styles.sheetTitle, { color: c.text }]}>{selected.label}</Text>
                <Text style={[styles.sheetDetail, { color: c.sub }]}>{selected.detail}</Text>
                <View style={[styles.sheetScore, { backgroundColor: scoreColor(selectedData.score) + '20', borderColor: scoreColor(selectedData.score) }]}>
                  <Text style={[styles.sheetScoreNum, { color: scoreColor(selectedData.score) }]}>
                    {selectedData.score}%
                  </Text>
                  <Text style={[styles.sheetScoreLabel, { color: c.sub }]}>
                    {selectedData.status.charAt(0).toUpperCase() + selectedData.status.slice(1)}
                  </Text>
                </View>
                <Text style={[styles.sheetHint, { color: c.sub }]}>
                  Score based on latest simulation vitals. Run a new simulation to update.
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 16 },
  title: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  body: { height: BODY_H, position: 'relative', alignSelf: 'center' },
  silhouetteWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center' },
  head: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, marginTop: 10, marginBottom: 4 },
  torso: { width: 68, height: 100, borderRadius: 10, borderWidth: 1.5, marginBottom: 4 },
  armsRow: { flexDirection: 'row', marginBottom: 4 },
  arm: { width: 16, height: 80, borderRadius: 8, borderWidth: 1.5 },
  legsRow: { flexDirection: 'row', gap: 10 },
  leg: { width: 20, height: 90, borderRadius: 10, borderWidth: 1.5 },
  organDot: {
    position: 'absolute', width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, justifyContent: 'center', alignItems: 'center',
  },
  organEmoji: { fontSize: 16 },
  scoreBadge: {
    position: 'absolute', bottom: -4, right: -4, borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1, minWidth: 24, alignItems: 'center',
  },
  scoreBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '800' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { fontSize: 10, fontWeight: '500' },
  modalBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, marginBottom: 20 },
  sheetEmoji: { fontSize: 48, marginBottom: 8 },
  sheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sheetDetail: { fontSize: 13, marginBottom: 16, textAlign: 'center', lineHeight: 20 },
  sheetScore: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 32, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  sheetScoreNum: { fontSize: 40, fontWeight: '900' },
  sheetScoreLabel: { fontSize: 13, marginTop: 2 },
  sheetHint: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
