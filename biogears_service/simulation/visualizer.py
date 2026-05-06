"""
visualizer.py — BioGears report generator (v2).

Improvements vs v1:
  - Dynamic stabilisation filter: skips rows until HeartRate CV < 5%
  - SpO₂ panel added when OxygenSaturation column is present
  - CoreTemperature panel added when available
  - New generate_comparison_report() for baseline vs intervention overlay
"""

import matplotlib
matplotlib.use("Agg")   # Non-interactive backend — safe for server use

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import pandas as pd
import numpy as np
import time
import datetime
from pathlib import Path

from biogears_service.simulation.config import BIO_OUTPUT_DIR, BASE_DIR, SCENARIO_API_DIR, BIOGEARS_BIN_DIR

BASE_URL = os.environ.get("SERVER_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


# ── CSV discovery ─────────────────────────────────────────────────────────────

def get_csv_path(user_id, run_id=None, prefix="run_"):
    """Locates a BioGears output CSV by trying several candidate locations."""
    filename = f"run_{run_id}Results.csv" if run_id else f"{prefix}{user_id}Results.csv"

    candidates = [
        BIOGEARS_BIN_DIR / "Scenarios" / "API" / filename,
        BIOGEARS_BIN_DIR / filename,
        BIO_OUTPUT_DIR / filename,
        SCENARIO_API_DIR / filename,
    ]

    for attempt in range(10):
        for path in candidates:
            if path.exists() and path.stat().st_size > 0:
                return path
        time.sleep(1.5)

    return None


# ── Dynamic stabilisation filter ─────────────────────────────────────────────

def _apply_stabilisation_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Skips leading rows where HeartRate coefficient of variation exceeds 5%.
    Falls back to a 10-second cutoff if CV cannot be computed.
    """
    if "HeartRate" not in df.columns or len(df) < 20:
        # Fallback: skip first 10 simulation-seconds
        if "Time" in df.columns and df["Time"].iloc[-1] > 20:
            return df[df["Time"] >= 10].copy()
        return df

    window  = max(10, len(df) // 20)   # rolling window ≈ 5% of data
    rolling_cv = (
        df["HeartRate"].rolling(window).std() /
        df["HeartRate"].rolling(window).mean()
    ).fillna(1.0)

    # Find first index where CV drops below 5%
    stable_mask = rolling_cv < 0.05
    if stable_mask.any():
        first_stable = stable_mask[stable_mask].index[0]
        return df.loc[first_stable:].copy()

    # If never stabilises, fall back to skipping the first 10%
    return df.iloc[len(df) // 10:].copy()


# ── Colour palette ────────────────────────────────────────────────────────────

_COLOURS = {
    "heart_rate":   "#e74c3c",
    "glucose":      "#27ae60",
    "systolic":     "#8e44ad",
    "diastolic":    "#9b59b6",
    "respiration":  "#2980b9",
    "spo2":         "#16a085",
    "temperature":  "#e67e22",
    "exercise":     "#95a5a6",
    "baseline":     "#3498db",
    "intervention": "#e74c3c",
}


# ── Main clinical health report ───────────────────────────────────────────────

def generate_health_report(user_id, run_id=None, custom_path=None):
    """
    Generates a multi-panel clinical report PNG.
    Panels adapt to whichever columns are present in the CSV.
    """
    csv_path = Path(custom_path) if custom_path else get_csv_path(user_id, run_id=run_id)
    if not csv_path or not csv_path.exists():
        return None

    try:
        df = pd.read_csv(csv_path)
        df.columns = [c.split('(')[0].strip() for c in df.columns]
        df = _apply_stabilisation_filter(df)   # ✅ dynamic filter

        # Determine panels dynamically
        has_spo2  = "OxygenSaturation"  in df.columns
        has_temp  = "CoreTemperature"   in df.columns
        n_panels  = 4 + int(has_spo2) + int(has_temp)
        fig, axes = plt.subplots(n_panels, 1, figsize=(14, 4 * n_panels), sharex=True)
        axes = list(axes)

        title = f"Digital Twin Clinical Report — {user_id}"
        if run_id:
            title += f"\n(Session: {run_id})"
        fig.suptitle(title, fontsize=16, fontweight="bold", y=0.99)

        T = df["Time"]

        # Panel 0: Heart Rate
        ax = axes[0]
        ax.plot(T, df["HeartRate"], color=_COLOURS["heart_rate"],
                linewidth=2.5, label="Heart Rate")
        ax.fill_between(T, 60, 100, color="green", alpha=0.05, label="Normal zone")
        if "AchievedExerciseLevel" in df.columns:
            ax2 = ax.twinx()
            ax2.fill_between(T, df["AchievedExerciseLevel"],
                             color=_COLOURS["exercise"], alpha=0.15, label="Exercise load")
            ax2.set_ylabel("Exercise (0–1)", color="#7f8c8d", fontsize=9)
            ax2.set_ylim(0, 1.3)
        ax.set_ylabel("HR (bpm)", fontweight="bold")
        ax.legend(loc="upper right", fontsize=9)
        ax.grid(True, linestyle="--", alpha=0.35)

        # Panel 1: Glucose
        ax = axes[1]
        gcol = "Glucose-BloodConcentration"
        if gcol in df.columns:
            ax.plot(T, df[gcol], color=_COLOURS["glucose"], linewidth=2.5,
                    label="Blood Glucose")
            ax.axhline(140, color="#f39c12", linestyle="--", alpha=0.7, label="Hyperglycaemia (140)")
            ax.axhline(70,  color="#c0392b", linestyle="--", alpha=0.7, label="Hypoglycaemia (70)")
        ax.set_ylabel("Glucose (mg/dL)", fontweight="bold")
        ax.legend(loc="upper right", fontsize=9)
        ax.grid(True, linestyle="--", alpha=0.35)

        # Panel 2: Blood Pressure
        ax = axes[2]
        if "SystolicArterialPressure" in df.columns:
            ax.plot(T, df["SystolicArterialPressure"],  color=_COLOURS["systolic"],
                    linewidth=2,   label="Systolic")
            ax.plot(T, df["DiastolicArterialPressure"], color=_COLOURS["diastolic"],
                    linewidth=1.5, linestyle="--", label="Diastolic")
            ax.fill_between(T, df["DiastolicArterialPressure"],
                            df["SystolicArterialPressure"],
                            color=_COLOURS["systolic"], alpha=0.08)
        ax.set_ylabel("BP (mmHg)", fontweight="bold")
        ax.legend(loc="upper right", fontsize=9)
        ax.grid(True, alpha=0.3)

        # Panel 3: Respiration
        ax = axes[3]
        if "RespirationRate" in df.columns:
            ax.plot(T, df["RespirationRate"], color=_COLOURS["respiration"],
                    linewidth=2, label="Resp Rate")
            ax.axhline(12, color="black", linestyle=":", alpha=0.3)
            ax.axhline(20, color="black", linestyle=":", alpha=0.3)
        ax.set_ylabel("Breaths/min", fontweight="bold")
        ax.legend(loc="upper right", fontsize=9)
        ax.grid(True, linestyle="--", alpha=0.35)

        panel_idx = 4

        # Panel 4 (optional): SpO₂
        if has_spo2:
            ax = axes[panel_idx]; panel_idx += 1
            ax.plot(T, df["OxygenSaturation"] * 100, color=_COLOURS["spo2"],
                    linewidth=2, label="SpO₂")
            ax.axhline(95, color="#e74c3c", linestyle="--", alpha=0.6, label="Low threshold (95%)")
            ax.set_ylim(80, 102)
            ax.set_ylabel("SpO₂ (%)", fontweight="bold")
            ax.legend(loc="lower right", fontsize=9)
            ax.grid(True, linestyle="--", alpha=0.35)

        # Panel 5 (optional): Core Temperature
        if has_temp:
            ax = axes[panel_idx]
            ax.plot(T, df["CoreTemperature"], color=_COLOURS["temperature"],
                    linewidth=2, label="Core Temp")
            ax.axhline(37.0, color="green", linestyle="--", alpha=0.4, label="Normal (37°C)")
            ax.axhline(38.5, color="#e74c3c", linestyle="--", alpha=0.5, label="Fever (38.5°C)")
            ax.set_ylabel("Temp (°C)", fontweight="bold")
            ax.legend(loc="upper right", fontsize=9)
            ax.grid(True, linestyle="--", alpha=0.35)

        axes[-1].set_xlabel("Simulation Time (seconds)", fontsize=12)
        plt.tight_layout(rect=[0, 0, 1, 0.97])

        fname = f"{user_id}_{run_id}_report.png" if run_id else f"{user_id}_report.png"
        out   = BASE_DIR / "reports" / fname
        plt.savefig(out, dpi=150)
        plt.close(fig)
        return f"{BASE_URL}/view-reports/{fname}"

    except Exception as e:
        print(f"❌ Visualizer Error: {e}")
        return None


# ── Forecast report ───────────────────────────────────────────────────────────

def generate_forecast_report(user_id, run_id=None):
    """Generates a 2-panel recovery forecast with confidence shading."""
    csv_path = get_csv_path(user_id, run_id=run_id, prefix="forecast_")
    if not csv_path:
        return None

    try:
        df = pd.read_csv(csv_path)
        df.columns = [c.split('(')[0].strip() for c in df.columns]

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10), sharex=True)
        fig.suptitle(f"4-Hour Recovery Forecast — {user_id}", fontsize=14, fontweight="bold")

        T = df["Time"]
        gcol = "Glucose-BloodConcentration"

        if gcol in df.columns:
            ax1.plot(T, df[gcol], color=_COLOURS["baseline"], linestyle="--",
                     linewidth=2, label="Predicted Glucose")
            ax1.fill_between(T, df[gcol] - 4, df[gcol] + 4,
                             color=_COLOURS["baseline"], alpha=0.12)
        ax1.set_ylabel("Glucose (mg/dL)", fontweight="bold")
        ax1.legend()
        ax1.grid(True, alpha=0.3)

        ax2.plot(T, df["HeartRate"], color=_COLOURS["intervention"], linestyle="--",
                 linewidth=2, label="Predicted HR")
        ax2.fill_between(T, df["HeartRate"] - 2, df["HeartRate"] + 2,
                         color=_COLOURS["intervention"], alpha=0.12)
        ax2.set_ylabel("Heart Rate (bpm)", fontweight="bold")
        ax2.set_xlabel("Seconds from current state", fontsize=12)
        ax2.legend()
        ax2.grid(True, alpha=0.3)

        plt.tight_layout()
        fname = f"{user_id}_{run_id}_forecast.png" if run_id else f"{user_id}_forecast.png"
        out   = BASE_DIR / "reports" / fname
        plt.savefig(out, dpi=130)
        plt.close(fig)
        return f"{BASE_URL}/view-reports/{fname}"

    except Exception as e:
        print(f"❌ Forecast Error: {e}")
        return None


# ── What-if comparison report ─────────────────────────────────────────────────

def generate_comparison_report(user_id: str, baseline_df: pd.DataFrame,
                                intervention_df: pd.DataFrame,
                                intervention_label: str = "With Intervention") -> str | None:
    """
    Overlays baseline vs intervention vitals on the same axes.
    Returns the report URL or None on failure.
    """
    try:
        fig, axes = plt.subplots(3, 1, figsize=(14, 14), sharex=True)
        fig.suptitle(f"What-If Comparison — {user_id}\n"
                     f"Baseline vs {intervention_label}",
                     fontsize=14, fontweight="bold")

        for df, label, style, alpha in [
            (baseline_df,     "Baseline",          "-",  0.8),
            (intervention_df, intervention_label,  "--", 0.9),
        ]:
            T = df["Time"]
            gcol = "Glucose-BloodConcentration"
            c_hr  = _COLOURS["baseline"] if label == "Baseline" else _COLOURS["intervention"]
            c_gluc = "#27ae60" if label == "Baseline" else "#f39c12"

            axes[0].plot(T, df["HeartRate"], color=c_hr, linestyle=style,
                         linewidth=2, alpha=alpha, label=f"HR — {label}")

            if gcol in df.columns:
                axes[1].plot(T, df[gcol], color=c_gluc, linestyle=style,
                             linewidth=2, alpha=alpha, label=f"Glucose — {label}")

            if "SystolicArterialPressure" in df.columns:
                axes[2].plot(T, df["SystolicArterialPressure"], color=c_hr,
                             linestyle=style, linewidth=2, alpha=alpha,
                             label=f"Systolic — {label}")

        axes[0].set_ylabel("Heart Rate (bpm)", fontweight="bold")
        axes[1].set_ylabel("Glucose (mg/dL)",  fontweight="bold")
        axes[2].set_ylabel("Systolic BP (mmHg)", fontweight="bold")
        axes[-1].set_xlabel("Simulation Time (seconds)", fontsize=12)

        for ax in axes:
            ax.legend(fontsize=9)
            ax.grid(True, linestyle="--", alpha=0.35)

        plt.tight_layout()

        ts    = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        fname = f"{user_id}_whatif_{ts}.png"
        out   = BASE_DIR / "reports" / fname
        plt.savefig(out, dpi=140)
        plt.close(fig)
        return f"{BASE_URL}/view-reports/{fname}"

    except Exception as e:
        print(f"❌ Comparison Report Error: {e}")
        return None