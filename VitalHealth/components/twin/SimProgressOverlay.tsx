/**
 * SimProgressOverlay — Non-blocking floating banner shown while BioGears runs.
 * The simulation already runs async in the context; this is purely cosmetic.
 * Users can navigate to any screen freely — the banner stays pinned at the bottom.
 * Tap the banner to expand/collapse the details panel.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { colors as themeColors } from '../../theme/colors';

type SimStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

interface Props {
  status: SimStatus;
  progress: string;
  error: string | null;
  /** Pixels from bottom — set to tabBarHeight + insets.bottom so banner sits above tab bar */
  bottomOffset?: number;
}

const STEPS = ['Queued', 'Sent', 'Computing', 'Done'];

function stepIdx(status: SimStatus, progress: string): number {
  if (status === 'queued') return 0;
  if (status === 'running' && progress.toLowerCase().includes('starting')) return 1;
  if (status === 'running') return 2;
  if (status === 'done') return 4;
  return 0;
}

export default function SimProgressOverlay({ status, progress, error, bottomOffset = 0 }: Props) {
  const isActive  = status === 'queued' || status === 'running';
  const isDone    = status === 'done';
  const isFailed  = status === 'failed';
  const isVisible = isActive || isDone || isFailed;

  const { theme } = useTheme();
  const c      = themeColors[theme];
  const isDark = theme === 'dark';

  // ── State ─────────────────────────────────────────────────────────────────
  const [expanded, setExpanded]   = useState(false);
  const [elapsed,  setElapsed]    = useState(0);
  const startRef = useRef<number | null>(null);

  // ── Animations ────────────────────────────────────────────────────────────
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(80)).current; // slide up from bottom

  // Elapsed timer
  useEffect(() => {
    if (isActive) {
      if (!startRef.current) startRef.current = Date.now();
      const iv = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
      return () => clearInterval(iv);
    } else {
      if (!isActive) startRef.current = null;
    }
  }, [isActive]);

  // Pulse + spin while running
  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.timing(rotateAnim, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true })
      ).start();
    } else {
      pulseAnim.stopAnimation();
      rotateAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isActive]);

  // Slide-up entry / slide-down exit
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: isVisible ? 0 : 80,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
    if (!isVisible) setExpanded(false);
  }, [isVisible]);

  // Auto-collapse expanded panel when done / failed
  useEffect(() => {
    if (!isActive && expanded) {
      const t = setTimeout(() => setExpanded(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  const spin   = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const step   = stepIdx(status, progress);
  const mins   = Math.floor(elapsed / 60);
  const secs   = elapsed % 60;
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

  // ── Colors ────────────────────────────────────────────────────────────────
  const bannerBg    = isDark ? '#0f172a' : '#ffffff';
  const accentColor = isFailed ? '#ef4444' : isDone ? '#10b981' : '#38bdf8';
  const statusEmoji = isFailed ? '❌' : isDone ? '✅' : '🧬';
  const statusText  = isFailed
    ? 'Simulation failed'
    : isDone
    ? 'Simulation complete!'
    : status === 'queued'
    ? 'BioGears queued…'
    : 'BioGears running…';

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bannerBg,
          borderTopColor: accentColor,
          bottom: bottomOffset,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      {/* ── Collapsed mini-banner (always shown) ── */}
      <TouchableOpacity
        style={styles.bannerRow}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
      >
        {/* Pulse dot */}
        {isActive ? (
          <Animated.View style={[styles.pulseDot, { backgroundColor: accentColor, transform: [{ scale: pulseAnim }] }]} />
        ) : (
          <View style={[styles.pulseDot, { backgroundColor: accentColor }]} />
        )}

        {/* Status text */}
        <View style={styles.bannerTextCol}>
          <Text style={[styles.bannerTitle, { color: c.text }]}>{statusEmoji} {statusText}</Text>
          {isActive && (
            <Text style={[styles.bannerSub, { color: c.sub }]}>
              ⏱ {timeStr} elapsed · tap to {expanded ? 'hide' : 'see'} details
            </Text>
          )}
          {isFailed && (
            <Text style={[styles.bannerSub, { color: '#ef4444' }]} numberOfLines={1}>
              {error || 'Check server logs'}
            </Text>
          )}
          {isDone && (
            <Text style={[styles.bannerSub, { color: '#10b981' }]}>
              Tap to dismiss · Navigate freely ✓
            </Text>
          )}
        </View>

        {/* Spinner (while running) or chevron */}
        {isActive ? (
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons name="sync" size={18} color={accentColor} />
          </Animated.View>
        ) : (
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={16} color={c.sub} />
        )}
      </TouchableOpacity>

      {/* ── Expanded details panel ── */}
      {expanded && (
        <View style={[styles.detailPanel, { borderTopColor: isDark ? '#1e293b' : '#e2e8f0' }]}>

          {/* Step progress */}
          <View style={styles.stepsRow}>
            {STEPS.map((s, i) => {
              const done   = i < step;
              const active = i === step && isActive;
              const dotBg  = done ? '#10b981' : active ? accentColor : (isDark ? '#1e293b' : '#e2e8f0');
              return (
                <React.Fragment key={s}>
                  <View style={styles.stepItem}>
                    <View style={[styles.stepDot, { backgroundColor: dotBg }]}>
                      <Text style={{ color: '#fff', fontSize: 8, fontWeight: '700' }}>
                        {done ? '✓' : i + 1}
                      </Text>
                    </View>
                    <Text style={[styles.stepTxt, { color: done || active ? c.text : c.sub }]}>{s}</Text>
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.stepLine, { backgroundColor: done ? '#10b981' : (isDark ? '#1e293b' : '#e2e8f0') }]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Progress message */}
          {!!progress && (
            <Text style={[styles.progressMsg, { color: c.sub }]} numberOfLines={2}>{progress}</Text>
          )}

          {/* Elapsed timer (only while running) */}
          {isActive && (
            <View style={[styles.timerRow, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
              <Text style={[styles.timerNum, { color: accentColor }]}>{timeStr}</Text>
              <Text style={[styles.timerLabel, { color: c.sub }]}>  elapsed · typical 10–25 min</Text>
            </View>
          )}

          <Text style={[styles.hint, { color: isDark ? '#475569' : '#94a3b8' }]}>
            {'You can navigate to other screens — the simulation runs in the background.'}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 2,
    // Elevation above tab bar
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    zIndex: 9999,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitle: {
    fontWeight: '700',
    fontSize: 13,
  },
  bannerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  detailPanel: {
    borderTopWidth: 1,
    padding: 14,
    gap: 10,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  stepItem: {
    alignItems: 'center',
    width: 54,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  stepTxt: {
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepLine: {
    width: 18,
    height: 2,
    marginBottom: 14,
    borderRadius: 1,
  },
  progressMsg: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  timerNum: {
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 11,
  },
  hint: {
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 15,
  },
});
