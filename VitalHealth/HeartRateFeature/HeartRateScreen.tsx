/**
 * HeartRateScreen.tsx
 * Drop-in screen for your VitalHealth app.
 * Shows camera, finger detection, live BPM and final results.
 *
 * Fix: Added missing `errorText` style (was causing ts(2339) at Ln 45)
 */

import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Vibration, Platform,
} from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';
import { useHeartRateMonitor } from './HeartRateService';

export default function HeartRateScreen() {
  const device = useCameraDevice('back');
  const { state, startMeasuring, stopMeasuring, onFrame, reset, camera } = useHeartRateMonitor();

  // Vibrate when finger is first detected
  useEffect(() => {
    if (state.fingerDetected) {
      Vibration.vibrate(80);
    }
  }, [state.fingerDetected]);

  // Frame processor — runs on every camera frame
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    try {
      const arrayBuffer = frame.toArrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      runOnJS(onFrame)(base64);
    } catch (_) {}
  }, [onFrame]);

  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Fix: was referencing styles.errorText which didn't exist */}
        <Text style={styles.errorText}>Camera not available</Text>
      </SafeAreaView>
    );
  }

  const isMeasuring = state.status === 'measuring';
  const isDone      = state.status === 'done';
  const progressPercent = Math.round(state.progress * 100);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>❤️ Heart Rate</Text>
        <Text style={styles.subtitle}>Place finger firmly over camera & flash</Text>
      </View>

      {/* Camera View */}
      <View style={styles.cameraWrapper}>
        <Camera
          ref={camera}
          style={styles.camera}
          device={device}
          isActive={isMeasuring}
          torch={isMeasuring && state.fingerDetected ? 'on' : 'off'}
          frameProcessor={isMeasuring ? frameProcessor : undefined}
          fps={30}
        />

        {/* Finger Placement Guide */}
        <View style={styles.fingerOverlay}>
          <View style={[
            styles.fingerCircle,
            state.fingerDetected && styles.fingerCircleDetected,
            isDone && styles.fingerCircleDone,
          ]}>
            <Text style={styles.fingerIcon}>👆</Text>
            <Text style={styles.fingerHint}>
              {isDone
                ? 'Done!'
                : state.fingerDetected
                ? 'Hold still...'
                : 'Place finger here'}
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Bar */}
      {isMeasuring && state.fingerDetected && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>{progressPercent}% collected</Text>
        </View>
      )}

      {/* Live / Final Results */}
      {(state.liveResult || state.result) && (
        <View style={styles.resultsCard}>
          {(() => {
            const r = state.result ?? state.liveResult!;
            return (
              <>
                <View style={styles.metricsRow}>
                  <MetricBox value={r.bpm.toFixed(0)}          unit="BPM" label="Heart Rate" accent="#e84040" />
                  <MetricBox value={r.spo2.toFixed(1)}         unit="%"   label="SpO₂ est."  accent="#2196F3" />
                  <MetricBox value={r.hrv_ms.toFixed(0)}       unit="ms"  label="HRV"        accent="#4CAF50" />
                </View>
                <View style={styles.qualityRow}>
                  <View style={[
                    styles.qualityBadge,
                    { backgroundColor: qualityColor(r.signal_quality) + '22' },
                  ]}>
                    <Text style={[styles.qualityText, { color: qualityColor(r.signal_quality) }]}>
                      {r.signal_quality.toUpperCase()} QUALITY
                    </Text>
                  </View>
                  <Text style={styles.confidenceText}>
                    {Math.round(r.confidence * 100)}% confidence
                  </Text>
                </View>
              </>
            );
          })()}
        </View>
      )}

      {/* Status Message */}
      <View style={styles.statusRow}>
        {isMeasuring && !state.fingerDetected && (
          <Text style={styles.statusWarning}>⚠️ No finger detected — cover camera fully</Text>
        )}
        {isMeasuring && state.fingerDetected && (
          <Text style={styles.statusGood}>✓ Signal detected — measuring...</Text>
        )}
        {state.status === 'error' && (
          <Text style={styles.statusError}>❌ {state.errorMessage}</Text>
        )}
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        {!isMeasuring && !isDone && (
          <TouchableOpacity style={styles.btnStart} onPress={startMeasuring}>
            <Text style={styles.btnStartText}>Start Measuring</Text>
          </TouchableOpacity>
        )}

        {isMeasuring && (
          <TouchableOpacity style={styles.btnStop} onPress={stopMeasuring}>
            <Text style={styles.btnStopText}>Stop</Text>
          </TouchableOpacity>
        )}

        {isDone && (
          <>
            <TouchableOpacity style={styles.btnStart} onPress={startMeasuring}>
              <Text style={styles.btnStartText}>Measure Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={reset}>
              <Text style={styles.btnOutlineText}>Clear</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function MetricBox({ value, unit, label, accent }: {
  value: string; unit: string; label: string; accent: string;
}) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function qualityColor(q: string) {
  return q === 'excellent' ? '#4CAF50' : q === 'good' ? '#FF9800' : '#F44336';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── Styles ──────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0d0d0d' },
  header:     { padding: 20, paddingBottom: 10 },
  title:      { fontSize: 24, fontWeight: '600', color: '#fff' },
  subtitle:   { fontSize: 13, color: '#888', marginTop: 2 },

  // ✅ Fix: errorText was missing — caused ts(2339) at Ln 45
  errorText:  { fontSize: 16, color: '#F44336', textAlign: 'center', marginTop: 40 },

  cameraWrapper: {
    height: 260, marginHorizontal: 20, borderRadius: 16,
    overflow: 'hidden', backgroundColor: '#1a1a1a',
  },
  camera: { flex: 1 },
  fingerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  fingerCircle: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  fingerCircleDetected: { borderColor: '#e84040', borderStyle: 'solid' },
  fingerCircleDone:     { borderColor: '#4CAF50', borderStyle: 'solid' },
  fingerIcon:  { fontSize: 28 },
  fingerHint:  { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'center' },

  progressContainer: { marginHorizontal: 20, marginTop: 12 },
  progressTrack:     { height: 4, backgroundColor: '#222', borderRadius: 2, overflow: 'hidden' },
  progressFill:      { height: '100%', backgroundColor: '#e84040', borderRadius: 2 },
  progressLabel:     { fontSize: 11, color: '#666', marginTop: 4, textAlign: 'right' },

  resultsCard: {
    margin: 20, marginBottom: 0,
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16,
    borderWidth: 0.5, borderColor: '#333',
  },
  metricsRow:      { flexDirection: 'row', justifyContent: 'space-around' },
  metricBox:       { alignItems: 'center' },
  metricValue:     { fontSize: 30, fontWeight: '600' },
  metricUnit:      { fontSize: 12, color: '#888' },
  metricLabel:     { fontSize: 11, color: '#555', marginTop: 2 },
  qualityRow:      {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 12,
    paddingTop: 12, borderTopWidth: 0.5, borderTopColor: '#2a2a2a',
  },
  qualityBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  qualityText:     { fontSize: 11, fontWeight: '600' },
  confidenceText:  { fontSize: 12, color: '#666' },

  statusRow:       { minHeight: 28, paddingHorizontal: 20, marginTop: 10, justifyContent: 'center' },
  statusWarning:   { fontSize: 13, color: '#FF9800', textAlign: 'center' },
  statusGood:      { fontSize: 13, color: '#4CAF50', textAlign: 'center' },
  statusError:     { fontSize: 13, color: '#F44336', textAlign: 'center' },

  buttonRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12,
  },
  btnStart: {
    flex: 1, backgroundColor: '#e84040',
    paddingVertical: 15, borderRadius: 12, alignItems: 'center',
  },
  btnStartText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnStop: {
    flex: 1, backgroundColor: '#333',
    paddingVertical: 15, borderRadius: 12, alignItems: 'center',
  },
  btnStopText:   { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnOutline: {
    paddingVertical: 15, paddingHorizontal: 20, borderRadius: 12,
    borderWidth: 0.5, borderColor: '#444', alignItems: 'center',
  },
  btnOutlineText: { color: '#888', fontSize: 16 },
});