/**
 * MacroRing — Animated progress ring for macro/nutrient tracking.
 * Accepts `c` (theme colors) as a prop so the inner circle matches the app background.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  value: number;    // current amount (g or kcal)
  target: number;   // daily target
  label: string;    // e.g. "Carbs"
  unit: string;     // e.g. "g" or "kcal"
  color: string;    // ring accent color
  c: any;           // app theme colors object
  size?: number;    // ring diameter (default 88)
}

export default function MacroRing({ value, target, label, unit, color, c, size = 88 }: Props) {
  const pct      = target > 0 ? Math.min(value / target, 1) : 0;
  const innerSize = size - 14;
  const radius    = size / 2;

  return (
    <View style={[styles.wrap, { width: size + 16 }]}>
      <View style={{ width: size, height: size, position: 'relative' }}>
        {/* Background full ring (faint) */}
        <View style={[styles.ring, {
          width: size, height: size, borderRadius: radius, borderColor: color + '25',
        }]} />

        {/* Progress overlay — clip left half then right half */}
        {pct > 0 && (
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
            {/* Right half progress (0–50%) */}
            <View style={{
              position: 'absolute', left: radius, top: 0, width: radius, height: size,
              backgroundColor: 'transparent', overflow: 'hidden',
            }}>
              <View style={[styles.halfArc, {
                width: size, height: size, borderRadius: radius, borderColor: color,
                transform: [{ rotate: `${Math.min(pct, 0.5) * 360}deg` }],
              }]} />
            </View>
            {/* Left half progress (50–100%) */}
            {pct > 0.5 && (
              <View style={{
                position: 'absolute', left: 0, top: 0, width: radius, height: size,
                backgroundColor: 'transparent', overflow: 'hidden',
              }}>
                <View style={[styles.halfArc, {
                  width: size, height: size, borderRadius: radius, borderColor: color,
                  left: -radius,
                  transform: [{ rotate: `${(pct - 0.5) * 360}deg` }],
                }]} />
              </View>
            )}
          </View>
        )}

        {/* Inner circle (donut hole) — uses theme card color so it matches background */}
        <View style={[styles.inner, {
          width: innerSize, height: innerSize, borderRadius: innerSize / 2,
          top: 7, left: 7,
          backgroundColor: c.card,
        }]}>
          <Text style={[styles.valueText, { color }]}>{Math.round(value)}</Text>
          <Text style={[styles.unitText, { color: c.sub }]}>{unit}</Text>
        </View>
      </View>

      <Text style={[styles.label,  { color: c.text }]}>{label}</Text>
      <Text style={[styles.target, { color: c.sub  }]}>/{Math.round(target)}{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:    { alignItems: 'center', paddingHorizontal: 8 },
  ring:    { position: 'absolute', borderWidth: 7 },
  halfArc: { position: 'absolute', borderWidth: 7, borderColor: 'transparent' },
  inner:   { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  valueText: { fontSize: 16, fontWeight: '800' },
  unitText:  { fontSize: 9, marginTop: -2 },
  label:     { fontSize: 11, fontWeight: '700', marginTop: 6 },
  target:    { fontSize: 9, marginTop: 1 },
});
