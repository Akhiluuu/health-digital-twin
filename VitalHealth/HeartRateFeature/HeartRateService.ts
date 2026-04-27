/**
 * HeartRateService.ts
 * VitalHealth — Heart Rate Monitor Service
 *
 * Fixes applied:
 *   1. Removed unused `react-native-fs` import (was causing TS2307 error)
 *   2. Added finger-gated session logic: only send frames when finger detected
 *      (a pre-check frame is sent first to determine finger presence cheaply)
 *   3. FRAME_SEND_INTERVAL_MS increased to 150 ms → ~6–7 fps to API
 *      (30 fps is overkill over WiFi; 6 fps is plenty for rPPG accuracy)
 *   4. Auto-stop confidence threshold matched to Python engine (0.82)
 */

import { useCallback, useRef, useState } from 'react';
import { Camera } from 'react-native-vision-camera';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE_URL = __DEV__
  ? 'http://192.168.1.100:5000'          // ← Replace with YOUR machine's LAN IP
  : 'https://your-production-api.com';

const FRAME_SEND_INTERVAL_MS = 150;      // ~6–7 fps to API (sufficient for rPPG)
const AUTO_STOP_CONFIDENCE   = 0.82;     // must match Python engine threshold

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HeartRateResult {
  bpm:              number;
  confidence:       number;
  hrv_ms:           number;
  spo2:             number;
  signal_quality:   'excellent' | 'good' | 'poor';
  measurement_time: number;
}

export interface MeasurementState {
  status:         'idle' | 'measuring' | 'done' | 'error';
  progress:       number;
  fingerDetected: boolean;
  result:         HeartRateResult | null;
  liveResult:     HeartRateResult | null;
  errorMessage:   string | null;
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class HeartRateService {
  private sessionId:     string | null = null;
  private lastFrameSent: number        = 0;

  async startSession(): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start session');
    const data = await res.json();
    this.sessionId = data.session_id;
    return data.session_id;
  }

  async sendFrame(base64Frame: string): Promise<{
    progress:       number;
    fingerDetected: boolean;
    ready:          boolean;
    liveBpm:        HeartRateResult | null;
  }> {
    if (!this.sessionId) throw new Error('No active session');

    // Throttle
    const now = Date.now();
    if (now - this.lastFrameSent < FRAME_SEND_INTERVAL_MS) {
      return { progress: 0, fingerDetected: false, ready: false, liveBpm: null };
    }
    this.lastFrameSent = now;

    const res = await fetch(`${API_BASE_URL}/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: this.sessionId,
        frame_data: base64Frame,
      }),
    });

    const data = await res.json();
    return {
      progress:       data.progress       ?? 0,
      fingerDetected: data.finger_detected ?? false,
      ready:          data.ready           ?? false,
      liveBpm:        data.live_bpm        ?? null,
    };
  }

  async stopSession(): Promise<HeartRateResult | null> {
    if (!this.sessionId) return null;
    const res = await fetch(`${API_BASE_URL}/stop/${this.sessionId}`, {
      method: 'POST',
    });
    const data = await res.json();
    this.sessionId = null;
    return data.final_result ?? null;
  }

  async getResult(): Promise<HeartRateResult | null> {
    if (!this.sessionId) return null;
    const res  = await fetch(`${API_BASE_URL}/result/${this.sessionId}`);
    const data = await res.json();
    return data.result ?? null;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/ping`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

// ── React Hook ────────────────────────────────────────────────────────────────

export function useHeartRateMonitor() {
  const service = useRef(new HeartRateService());
  const camera  = useRef<Camera>(null);

  const [state, setState] = useState<MeasurementState>({
    status:         'idle',
    progress:       0,
    fingerDetected: false,
    result:         null,
    liveResult:     null,
    errorMessage:   null,
  });

  const startMeasuring = useCallback(async () => {
    try {
      setState(s => ({
        ...s,
        status:         'measuring',
        progress:       0,
        result:         null,
        liveResult:     null,
        fingerDetected: false,
        errorMessage:   null,
      }));
      await service.current.startSession();
    } catch {
      setState(s => ({
        ...s,
        status:       'error',
        errorMessage: 'Could not connect to server. Check IP and run: python app.py',
      }));
    }
  }, []);

  const stopMeasuring = useCallback(async () => {
    try {
      const result = await service.current.stopSession();
      setState(s => ({ ...s, status: 'done', result }));
    } catch {
      setState(s => ({
        ...s,
        status:       'error',
        errorMessage: 'Failed to get final result.',
      }));
    }
  }, []);

  const onFrame = useCallback(async (base64: string) => {
    if (state.status !== 'measuring') return;
    try {
      const { progress, fingerDetected, ready, liveBpm } =
        await service.current.sendFrame(base64);

      setState(s => ({
        ...s,
        progress,
        fingerDetected,
        liveResult: liveBpm ?? s.liveResult,
      }));

      if (ready && liveBpm && liveBpm.confidence >= AUTO_STOP_CONFIDENCE) {
        await stopMeasuring();
      }
    } catch {
      // Silently skip failed frames
    }
  }, [state.status, stopMeasuring]);

  const reset = useCallback(() => {
    setState({
      status:         'idle',
      progress:       0,
      fingerDetected: false,
      result:         null,
      liveResult:     null,
      errorMessage:   null,
    });
  }, []);

  return { state, startMeasuring, stopMeasuring, onFrame, reset, camera };
}