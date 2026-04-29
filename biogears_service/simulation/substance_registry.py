"""
substance_registry.py — BioGears substance registry with physiologically correct
administration routes, units, dose ranges, and safety warnings.

Fixes:
  - Caffeine is ORAL at mg (matches BioGears CDM)
  - All IV_BOLUS substances now use correct pharmacological units (mg, not mL)
  - Fentanyl correctly in ug
  - Added safe_dose_mg ranges for UI guidance
  - Added safety_level: "safe" | "caution" | "danger" | "clinical_only"
  - Added warning text for each substance category
  - Hard-coded registry instead of auto-discovery to prevent broken routes
"""

from typing import Dict, Any

# ── Substance Registry ─────────────────────────────────────────────────────────
# Each entry: route, unit (what the dose value means), category,
#             safe_min (typical minimum dose), safe_max (max safe single dose),
#             safety_level, warning
#
# Routes:
#   ORAL       → SubstanceOralDoseData (AdminRoute="Gastrointestinal"), unit=mg
#   NASAL      → SubstanceNasalDoseData, unit=ug
#   IV_BOLUS   → SubstanceBolusData (AdminRoute="Intravenous"), unit=mg or ug
#   IV_COMPOUND→ SubstanceCompoundInfusionData, unit=mL/min

SUBSTANCE_REGISTRY: Dict[str, Any] = {

    # ── Stimulants ─────────────────────────────────────────────────────────────
    "Caffeine": {
        "route": "ORAL", "unit": "mg",
        "category": "Stimulant",
        "safe_min": 40, "safe_max": 400,
        "safety_level": "safe",
        "warning": None,
        "note": "Standard coffee = 80–100 mg. Max daily dose = 400 mg.",
        "effects": "↑ HR, ↑ alertness, mild ↑ BP, ↓ fatigue",
    },

    # ── Analgesics ─────────────────────────────────────────────────────────────
    "Morphine": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Analgesic (Opioid)",
        "safe_min": 2, "safe_max": 15,
        "safety_level": "clinical_only",
        "warning": "⚠️ OPIOID — Respiratory depression risk. Clinical use only.",
        "note": "Typical IV dose 2–15 mg. Do NOT combine with benzodiazepines.",
        "effects": "↓ HR, ↓ BP, ↓ RR, analgesia, sedation",
    },
    "Fentanyl": {
        "route": "IV_BOLUS", "unit": "ug",
        "category": "Analgesic (Opioid)",
        "safe_min": 25, "safe_max": 200,
        "safety_level": "clinical_only",
        "warning": "⚠️ POTENT OPIOID — 100× more potent than morphine. ICU use only.",
        "note": "Typical bolus 25–200 µg. Respiratory arrest risk.",
        "effects": "Profound ↓ RR, ↓ HR, analgesia",
    },
    "Ketamine": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Analgesic / Dissociative",
        "safe_min": 10, "safe_max": 500,
        "safety_level": "clinical_only",
        "warning": "⚠️ Dissociative anesthetic — hallucinations, ↑ HR, ↑ BP. Clinical only.",
        "note": "Analgesic sub-anesthetic dose: 10–50 mg. Full anesthesia: 1–2 mg/kg.",
        "effects": "↑ HR, ↑ BP, bronchodilation, dissociation",
    },
    "Acetaminophen": {
        "route": "ORAL", "unit": "mg",
        "category": "Analgesic / Antipyretic",
        "safe_min": 325, "safe_max": 1000,
        "safety_level": "safe",
        "warning": "⚠️ Max 4000 mg/day. Liver damage risk with chronic use or alcohol.",
        "note": "Standard dose 500–1000 mg per administration.",
        "effects": "↓ fever, mild analgesia",
    },


    # ── Emergency / Cardiac ────────────────────────────────────────────────────
    "Epinephrine": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Emergency / Cardiac",
        "safe_min": 0.1, "safe_max": 1.0,
        "safety_level": "danger",
        "warning": "🚨 EPINEPHRINE — Severe hypertension, tachycardia, arrhythmia risk. Emergency only.",
        "note": "Cardiac arrest: 1 mg. Anaphylaxis: 0.3–0.5 mg IM.",
        "effects": "↑↑ HR, ↑↑ BP, bronchodilation, ↑ glucose",
    },
    "Norepinephrine": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Emergency / Vasopressor",
        "safe_min": 0.01, "safe_max": 0.5,
        "safety_level": "danger",
        "warning": "🚨 VASOPRESSOR — ICU septic shock use only. Extreme hypertension risk.",
        "note": "Typical infusion 0.01–0.3 mg/min. Single bolus rarely used.",
        "effects": "↑↑ BP, reflex ↓ HR, vasoconstriction",
    },
    "Vasopressin": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Emergency / Vasopressor",
        "safe_min": 0.04, "safe_max": 0.4,
        "safety_level": "danger",
        "warning": "🚨 VASOPRESSOR — Severe ischemia risk at high doses. ICU only.",
        "note": "Cardiac arrest adjunct: 40 units (≈0.04 mg).",
        "effects": "↑ BP, water retention, ↓ urine output",
    },

    # ── Anticholinergics ───────────────────────────────────────────────────────


    # ── Reversal Agents ────────────────────────────────────────────────────────
    "Naloxone": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Opioid Reversal",
        "safe_min": 0.4, "safe_max": 10.0,
        "safety_level": "clinical_only",
        "warning": "⚠️ Reverses opioid effects — may precipitate acute withdrawal.",
        "note": "Initial dose 0.4–2 mg. Repeat every 2–3 min as needed.",
        "effects": "↑ RR (reverses opioid depression), withdrawal possible",
    },
    "Pralidoxime": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Organophosphate Reversal",
        "safe_min": 1000, "safe_max": 2000,
        "safety_level": "clinical_only",
        "warning": "⚠️ Antidote for nerve agent / organophosphate poisoning. Rx only.",
        "note": "1–2 g IV over 15–30 min. Must be used with atropine.",
        "effects": "Reverses cholinesterase inhibition",
    },

    # ── Anesthetics / Sedatives ────────────────────────────────────────────────
    "Propofol": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Anesthetic",
        "safe_min": 40, "safe_max": 200,
        "safety_level": "clinical_only",
        "warning": "🚨 ANESTHETIC — Apnea, hypotension, loss of airway. ICU/OR only.",
        "note": "Induction: 1.5–2.5 mg/kg. Sedation: 0.5–1 mg/kg.",
        "effects": "↓↓ HR, ↓↓ BP, ↓ RR, unconsciousness",
    },

    "Midazolam": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Benzodiazepine / Sedative",
        "safe_min": 1, "safe_max": 30,
        "safety_level": "clinical_only",
        "warning": "⚠️ BENZODIAZEPINE — Respiratory depression, sedation. Avoid with opioids.",
        "note": "Procedural sedation: 1–5 mg. Max 30 mg in 1h.",
        "effects": "↓ RR, sedation, amnesia",
    },

    # ── Neuromuscular Blockers ─────────────────────────────────────────────────
    "Succinylcholine": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Neuromuscular Blocker",
        "safe_min": 50, "safe_max": 200,
        "safety_level": "danger",
        "warning": "🚨 PARALYTIC — Complete respiratory paralysis. Must be intubated.",
        "note": "RSI: 1–1.5 mg/kg (~100 mg). Duration 10–15 min.",
        "effects": "Complete muscle paralysis, ↑ K⁺, fasciculations",
    },
    "Rocuronium": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Neuromuscular Blocker",
        "safe_min": 50, "safe_max": 200,
        "safety_level": "danger",
        "warning": "🚨 PARALYTIC — Complete respiratory paralysis. Must be intubated.",
        "note": "RSI: 1.2 mg/kg (~84 mg). Duration 60–90 min.",
        "effects": "Complete muscle paralysis",
    },

    # ── Pulmonary ──────────────────────────────────────────────────────────────
    "Albuterol": {
        "route": "NASAL", "unit": "ug",
        "category": "Bronchodilator",
        "safe_min": 90, "safe_max": 800,
        "safety_level": "caution",
        "warning": "⚠️ May cause tachycardia and tremor at high doses.",
        "note": "Standard inhaler: 90–180 µg (1–2 puffs). Max 800 µg/dose.",
        "effects": "↑ HR, bronchodilation, ↓ airway resistance",
    },

    # ── Diuretics ─────────────────────────────────────────────────────────────
    "Furosemide": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Diuretic",
        "safe_min": 20, "safe_max": 200,
        "safety_level": "clinical_only",
        "warning": "⚠️ Electrolyte imbalance, hypotension, dehydration risk.",
        "note": "Typical IV dose 20–80 mg. Monitor K⁺.",
        "effects": "↑ urine output, ↓ BP, ↓ circulating volume",
    },

    # ── Hormones / Metabolic ───────────────────────────────────────────────────
    "Insulin": {
        "route": "IV_BOLUS", "unit": "U",
        "category": "Hormone",
        "safe_min": 2, "safe_max": 50,
        "safety_level": "caution",
        "warning": "⚠️ INSULIN — Hypoglycemia risk. Monitor glucose closely.",
        "note": "DKA: 0.1 U/kg/h. Never exceed 50 U bolus without monitoring.",
        "effects": "↓ blood glucose, ↑ cellular glucose uptake",
    },

    # ── Antibiotics ────────────────────────────────────────────────────────────
    "Moxifloxacin": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Antibiotic (Fluoroquinolone)",
        "safe_min": 200, "safe_max": 400,
        "safety_level": "clinical_only",
        "warning": "⚠️ QT prolongation risk. Avoid with other QT-prolonging drugs.",
        "note": "Standard dose 400 mg IV once daily.",
        "effects": "Bactericidal, mild ↓ BP at high doses",
    },
    "Ertapenem": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Antibiotic (Carbapenem)",
        "safe_min": 500, "safe_max": 1000,
        "safety_level": "clinical_only",
        "warning": "⚠️ Seizure risk in CNS disease. Rx only.",
        "note": "Standard dose 1 g IV once daily.",
        "effects": "Broad spectrum bactericidal",
    },

    # ── Hemostatics ───────────────────────────────────────────────────────────
    "TranexamicAcid": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Hemostatic",
        "safe_min": 500, "safe_max": 1000,
        "safety_level": "clinical_only",
        "warning": "⚠️ Thromboembolic risk. Rx only.",
        "note": "Trauma: 1 g IV over 10 min within 3h of injury.",
        "effects": "↓ bleeding, clot stabilization",
    },

    # ── Antiemetics ───────────────────────────────────────────────────────────


    # ── Corticosteroids ───────────────────────────────────────────────────────
    "Prednisone": {
        "route": "ORAL", "unit": "mg",
        "category": "Corticosteroid",
        "safe_min": 5, "safe_max": 60,
        "safety_level": "caution",
        "warning": "⚠️ Immunosuppression, ↑ blood glucose, fluid retention. Taper on discontinuation.",
        "note": "Typical 5–60 mg/day. Short courses generally safe.",
        "effects": "↑ glucose, fluid retention, ↑ BP (chronic)",
    },

    # ── IV Fluids ─────────────────────────────────────────────────────────────
    "Saline": {
        "route": "IV_COMPOUND", "unit": "mL/min",
        "category": "IV Fluid",
        "safe_min": 1, "safe_max": 500,
        "safety_level": "safe",
        "warning": None,
        "note": "Normal saline (0.9% NaCl). Standard rate 83–167 mL/h (1–2 mL/min).",
        "effects": "Plasma volume expansion, ↑ BP, dilutional effect",
    },
    "RingersLactate": {
        "route": "IV_COMPOUND", "unit": "mL/min",
        "category": "IV Fluid",
        "safe_min": 1, "safe_max": 500,
        "safety_level": "safe",
        "warning": None,
        "note": "Balanced crystalloid. Preferred in trauma resuscitation.",
        "effects": "Plasma volume expansion with better electrolyte balance than saline",
    },
    "PlasmaLyteA": {
        "route": "IV_COMPOUND", "unit": "mL/min",
        "category": "IV Fluid",
        "safe_min": 1, "safe_max": 500,
        "safety_level": "safe",
        "warning": None,
        "note": "Physiologically balanced crystalloid. Ideal for large volume resuscitation.",
        "effects": "Plasma volume expansion, minimal electrolyte disturbance",
    },

    # ── Blood Products ────────────────────────────────────────────────────────
    "Blood_APositive": {
        "route": "IV_COMPOUND", "unit": "mL/min",
        "category": "Blood Product",
        "safe_min": 1, "safe_max": 100,
        "safety_level": "clinical_only",
        "warning": "⚠️ Type & crossmatch required. Transfusion reaction risk.",
        "note": "pRBC transfusion rate 1–4 mL/min (60–240 mL/h).",
        "effects": "↑ Hgb, ↑ O2 carrying capacity, ↑ BP",
    },
    "Blood_ONegative": {
        "route": "IV_COMPOUND", "unit": "mL/min",
        "category": "Blood Product",
        "safe_min": 1, "safe_max": 100,
        "safety_level": "clinical_only",
        "warning": "⚠️ Universal donor. Transfusion reaction risk (rare).",
        "note": "Used in emergency when type unknown. Rate 1–4 mL/min.",
        "effects": "↑ Hgb, ↑ O2 carrying capacity",
    },

    # ── Chemical / Toxic (simulation only) ───────────────────────────────────
    "Sarin": {
        "route": "IV_BOLUS", "unit": "mg",
        "category": "Chemical Warfare Agent",
        "safe_min": 0.0, "safe_max": 0.0,
        "safety_level": "danger",
        "warning": "🚨 CHEMICAL WARFARE AGENT — Nerve agent. Simulation/research only. Lethal at microgram levels.",
        "note": "For WMD exposure simulation only.",
        "effects": "Cholinergic crisis: ↓↓ HR, bronchoconstriction, seizures",
    },
}

# ─── Compatibility: provide ROUTE_GROUPS for server.py ──────────────────────
ROUTE_GROUPS: Dict[str, list] = {
    "IV_COMPOUND": [],
    "ORAL":        [],
    "NASAL":       [],
    "IV_BOLUS":    [],
}
for _name, _info in SUBSTANCE_REGISTRY.items():
    ROUTE_GROUPS[_info["route"]].append({"name": _name, **_info})
