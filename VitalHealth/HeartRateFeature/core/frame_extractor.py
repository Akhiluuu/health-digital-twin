"""
frame_extractor.py
Extracts average RGB channel values from camera frames (base64 or raw numpy).
These values are fed into HeartRateEngine frame-by-frame.

When a finger covers the camera + flashlight:
  - RED channel pulses strongly with blood flow
  - GREEN is partially suppressed
  - BLUE is heavily suppressed (oxygenated Hb absorbs blue strongly)

Improvements:
  - Stricter and more robust finger-detection heuristics
  - Added red-dominance-over-green check (avoids false positives on red surfaces)
  - Saturation guard: if red > 252 the sensor is clipping → mark as no finger
"""

import cv2
import numpy as np
import base64
from dataclasses import dataclass
from typing import Optional


@dataclass
class FrameChannels:
    red: float
    green: float
    blue: float
    is_finger_detected: bool
    brightness: float


class FrameExtractor:
    # ── Finger detection thresholds ──────────────────────────────────────────
    MIN_RED_MEAN       = 110   # red must be bright (flashlight through skin)
    MAX_RED_MEAN       = 252   # avoid sensor saturation / clipping
    MAX_BLUE_MEAN      = 90    # blue heavily suppressed by oxygenated blood
    MAX_GREEN_MEAN     = 160   # green also suppressed (less than blue)
    MIN_RED_OVER_BLUE  = 1.5   # red must dominate blue significantly
    MIN_RED_OVER_GREEN = 1.1   # red must dominate green at least slightly

    def __init__(self, roi_fraction: float = 0.6):
        """
        roi_fraction: fraction of the centre frame to sample.
        0.6 = centre 60% — avoids vignetting and lens edge artefacts.
        """
        self.roi_fraction = roi_fraction

    # ── Public API ────────────────────────────────────────────────────────────

    def extract_from_base64(self, b64_string: str) -> Optional[FrameChannels]:
        """
        Decode a base64-encoded JPEG/PNG frame from Expo Camera
        and extract channel averages.
        """
        try:
            if ',' in b64_string:
                b64_string = b64_string.split(',')[1]

            img_bytes = base64.b64decode(b64_string)
            img_array = np.frombuffer(img_bytes, dtype=np.uint8)
            frame     = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

            if frame is None:
                return None

            return self.extract_from_frame(frame)

        except Exception as e:
            print(f"[FrameExtractor] Error decoding frame: {e}")
            return None

    def extract_from_frame(self, frame: np.ndarray) -> FrameChannels:
        """Extract RGB averages from a numpy BGR frame (OpenCV format)."""
        h, w = frame.shape[:2]

        margin_h = int(h * (1 - self.roi_fraction) / 2)
        margin_w = int(w * (1 - self.roi_fraction) / 2)
        roi      = frame[margin_h: h - margin_h, margin_w: w - margin_w]

        # OpenCV is BGR
        blue_ch  = roi[:, :, 0].astype(np.float64)
        green_ch = roi[:, :, 1].astype(np.float64)
        red_ch   = roi[:, :, 2].astype(np.float64)

        red_mean   = float(np.mean(red_ch))
        green_mean = float(np.mean(green_ch))
        blue_mean  = float(np.mean(blue_ch))
        brightness = float(np.mean(roi))

        is_finger = self._detect_finger(red_mean, green_mean, blue_mean)

        return FrameChannels(
            red=red_mean,
            green=green_mean,
            blue=blue_mean,
            is_finger_detected=is_finger,
            brightness=brightness,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _detect_finger(self, r: float, g: float, b: float) -> bool:
        """
        Multi-criteria finger-detection heuristic.
        All conditions must be met to avoid false positives.
        """
        # Red must be within a valid range (not too dark, not clipping)
        if r < self.MIN_RED_MEAN or r > self.MAX_RED_MEAN:
            return False
        # Blue must be suppressed
        if b > self.MAX_BLUE_MEAN:
            return False
        # Green must be suppressed
        if g > self.MAX_GREEN_MEAN:
            return False
        # Red must dominate both other channels
        if b < 1:
            return False
        if r / b < self.MIN_RED_OVER_BLUE:
            return False
        if g < 1:
            return False
        if r / g < self.MIN_RED_OVER_GREEN:
            return False
        return True

    def extract_from_video(self, video_path: str):
        """Generator: yields FrameChannels for each frame of a video file."""
        cap = cv2.VideoCapture(video_path)
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                yield self.extract_from_frame(frame)
        finally:
            cap.release()