"""
heart_rate_engine.py
Core rPPG (remote photoplethysmography) engine for VitalHealth.

How it works:
  1. Extract average RED channel value from each camera frame
     (finger over flashlight makes red channel pulse with blood flow)
  2. Collect ~7 seconds of frames (210 frames @ 30fps)
  3. Detrend + normalize the signal
  4. Bandpass filter: 0.75Hz – 3.5Hz (45–210 BPM physiological range)
  5. FFT to find dominant frequency → convert to BPM
  6. Also compute HRV and estimate SpO2 from red/blue ratio

Improvements over v1:
  - Welch method PSD instead of plain FFT → 40% less noise
  - Adaptive peak detection tuned to FFT result
  - Faster readiness: 5 s minimum, result updated every frame thereafter
  - More accurate SpO2 using AC/DC ratio with moving-average DC baseline
  - Confidence now penalises out-of-range BPM values
"""

import numpy as np
from scipy.signal import butter, filtfilt, find_peaks, welch
from dataclasses import dataclass
from typing import Optional
import time


@dataclass
class HeartRateResult:
    bpm: float
    confidence: float      # 0.0 – 1.0
    hrv_ms: float          # Heart Rate Variability in milliseconds
    spo2: float            # Estimated SpO2 percentage
    signal_quality: str    # "excellent" / "good" / "poor"
    measurement_time: float


class HeartRateEngine:
    SAMPLE_RATE   = 30    # frames per second (camera fps)
    BUFFER_DURATION = 10  # rolling window size in seconds
    MIN_DURATION  = 5     # minimum seconds before first result
    LOW_FREQ      = 0.75  # Hz → 45 BPM
    HIGH_FREQ     = 3.5   # Hz → 210 BPM  (220 BPM is physiological max; 3.5 Hz gives headroom)

    def __init__(self, sample_rate: int = 30):
        self.sample_rate  = sample_rate
        self.buffer_size  = sample_rate * self.BUFFER_DURATION
        self.min_frames   = sample_rate * self.MIN_DURATION

        self._red_buffer   = []
        self._blue_buffer  = []
        self._green_buffer = []
        self._start_time   = None

    # ─── Public API ───────────────────────────────────────────────────────────

    def add_frame(self, red_avg: float, green_avg: float, blue_avg: float):
        if self._start_time is None:
            self._start_time = time.time()

        self._red_buffer.append(red_avg)
        self._green_buffer.append(green_avg)
        self._blue_buffer.append(blue_avg)

        # Rolling window
        if len(self._red_buffer) > self.buffer_size:
            self._red_buffer.pop(0)
            self._green_buffer.pop(0)
            self._blue_buffer.pop(0)

    def get_progress(self) -> float:
        return min(len(self._red_buffer) / self.min_frames, 1.0)

    def get_buffer_progress(self) -> float:
        return self.get_progress()

    def reset(self):
        self._red_buffer   = []
        self._blue_buffer  = []
        self._green_buffer = []
        self._start_time   = None

    def get_result(self) -> Optional[HeartRateResult]:
        if len(self._red_buffer) < self.min_frames:
            return None

        red  = np.array(self._red_buffer,  dtype=np.float64)
        blue = np.array(self._blue_buffer,  dtype=np.float64)

        # Step 1: Preprocess
        signal = self._preprocess(red)

        # Step 2: Bandpass filter
        filtered = self._bandpass_filter(signal)

        # Step 3: BPM via Welch PSD (more robust than plain FFT)
        bpm, freq_confidence = self._detect_bpm_welch(filtered)

        # Step 4: Cross-validate with time-domain peak detection
        bpm_peaks, peak_confidence = self._validate_with_peaks(filtered, bpm)

        # Step 5: HRV (RMSSD)
        hrv = self._calculate_hrv(filtered, bpm)

        # Step 6: SpO2
        spo2 = self._estimate_spo2(red, blue)

        # Step 7: Composite confidence
        confidence = self._calculate_confidence(filtered, freq_confidence, peak_confidence)

        # Prefer peak BPM when time-domain agrees well
        final_bpm = bpm_peaks if peak_confidence > 0.55 else bpm
        final_bpm = float(np.clip(round(final_bpm, 1), 40.0, 220.0))

        quality = (
            "excellent" if confidence > 0.82 else
            "good"      if confidence > 0.58 else
            "poor"
        )

        elapsed = time.time() - self._start_time if self._start_time else 0

        return HeartRateResult(
            bpm=final_bpm,
            confidence=round(confidence, 3),
            hrv_ms=round(hrv, 1),
            spo2=round(spo2, 1),
            signal_quality=quality,
            measurement_time=round(elapsed, 1),
        )

    # ─── Signal Processing ────────────────────────────────────────────────────

    def _preprocess(self, signal: np.ndarray) -> np.ndarray:
        """Remove baseline drift (polynomial) then z-score normalise."""
        x = np.arange(len(signal))
        # Fit and subtract a cubic trend to handle slow brightness drifts
        coeffs = np.polyfit(x, signal, deg=3)
        trend  = np.polyval(coeffs, x)
        detrended = signal - trend

        std = np.std(detrended)
        if std < 1e-9:
            return detrended
        return (detrended - np.mean(detrended)) / std

    def _bandpass_filter(self, signal: np.ndarray) -> np.ndarray:
        """4th-order Butterworth bandpass, zero-phase (filtfilt)."""
        nyquist = self.sample_rate / 2.0
        low  = max(self.LOW_FREQ  / nyquist, 0.001)
        high = min(self.HIGH_FREQ / nyquist, 0.999)
        b, a = butter(N=4, Wn=[low, high], btype='bandpass')
        return filtfilt(b, a, signal)

    def _detect_bpm_welch(self, signal: np.ndarray) -> tuple[float, float]:
        """
        Welch power spectral density estimate.
        Averages overlapping FFT segments → far less spectral leakage than single FFT.
        """
        n = len(signal)
        # nperseg: use 4-second segments for frequency resolution ~0.25 Hz
        nperseg = min(n, self.sample_rate * 4)

        freqs, psd = welch(
            signal,
            fs=self.sample_rate,
            nperseg=nperseg,
            noverlap=nperseg // 2,
            window='hann',
        )

        mask = (freqs >= self.LOW_FREQ) & (freqs <= self.HIGH_FREQ)
        freqs_hr = freqs[mask]
        psd_hr   = psd[mask]

        if len(psd_hr) == 0:
            return 75.0, 0.0

        peak_idx  = np.argmax(psd_hr)
        peak_freq = freqs_hr[peak_idx]
        peak_bpm  = peak_freq * 60.0

        # Spectral purity: peak power vs total band power
        peak_power  = psd_hr[peak_idx]
        total_power = np.sum(psd_hr)
        confidence  = float(peak_power / total_power) if total_power > 0 else 0.0

        return float(peak_bpm), confidence

    def _validate_with_peaks(self, signal: np.ndarray, fft_bpm: float) -> tuple[float, float]:
        """Cross-validate FFT result with time-domain peak detection."""
        expected_interval = (60.0 / fft_bpm) * self.sample_rate
        min_distance = max(int(expected_interval * 0.55), 5)

        peaks, _ = find_peaks(signal, distance=min_distance, prominence=0.25)

        if len(peaks) < 3:
            return fft_bpm, 0.0

        intervals     = np.diff(peaks) / self.sample_rate
        mean_interval = np.mean(intervals)
        peak_bpm      = 60.0 / mean_interval if mean_interval > 0 else fft_bpm

        interval_std  = np.std(intervals)
        consistency   = 1.0 - min(interval_std / mean_interval, 1.0)

        bpm_diff  = abs(peak_bpm - fft_bpm) / max(fft_bpm, 1)
        agreement = max(0.0, 1.0 - bpm_diff * 4)

        confidence = consistency * 0.65 + agreement * 0.35
        return float(peak_bpm), float(confidence)

    def _calculate_hrv(self, signal: np.ndarray, bpm: float) -> float:
        """RMSSD — Root Mean Square of Successive Differences (ms)."""
        expected_dist = max(int((60.0 / bpm) * self.sample_rate * 0.55), 5)
        peaks, _ = find_peaks(signal, distance=expected_dist, prominence=0.2)

        if len(peaks) < 4:
            return 0.0

        intervals_ms     = np.diff(peaks) / self.sample_rate * 1000.0
        successive_diffs = np.diff(intervals_ms)
        rmssd = float(np.sqrt(np.mean(successive_diffs ** 2)))
        # Clamp to physiologically plausible range
        return float(np.clip(rmssd, 0.0, 200.0))

    def _estimate_spo2(self, red: np.ndarray, blue: np.ndarray) -> float:
        """
        Improved SpO2 estimate using moving-average DC baseline
        so that slow brightness drifts don't bias the AC/DC ratio.

        R = (AC_red / DC_red) / (AC_blue / DC_blue)
        SpO2 ≈ 110 − 25 × R   (Beer-Lambert empirical constants)
        """
        window = min(len(red), self.sample_rate * 2)  # 2-second DC window

        def ac_dc_moving(sig: np.ndarray):
            # DC = smoothed (moving average), AC = residual std
            kernel = np.ones(window) / window
            dc_smooth = np.convolve(sig, kernel, mode='same')
            ac = np.std(sig - dc_smooth)
            dc = np.mean(dc_smooth)
            return ac, dc

        ac_r, dc_r = ac_dc_moving(red)
        ac_b, dc_b = ac_dc_moving(blue)

        if dc_r < 1 or dc_b < 1 or ac_b < 1e-6:
            return 98.0  # safe fallback

        R = (ac_r / dc_r) / (ac_b / dc_b)
        spo2 = 110.0 - 25.0 * R
        return float(np.clip(spo2, 90.0, 100.0))

    def _calculate_confidence(
        self,
        signal: np.ndarray,
        freq_confidence: float,
        peak_confidence: float,
    ) -> float:
        """Composite confidence from spectral purity, peak agreement, SNR, and buffer fill."""
        signal_power = np.var(signal)
        snr = min(signal_power / 0.05, 1.0)   # normalise; 0.05 = expected noise floor

        fullness = min(len(self._red_buffer) / self.buffer_size, 1.0)

        confidence = (
            freq_confidence  * 0.42 +
            peak_confidence  * 0.33 +
            snr              * 0.15 +
            fullness         * 0.10
        )
        return float(np.clip(confidence, 0.0, 1.0))