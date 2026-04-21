# Clinical Twin Page — Complete A-to-Z Explanation

> Everything you need to know to explain the Clinical Twin page to anyone — a professor, a colleague, a patient, or an investor.

---

## The Big Picture: What Is the Clinical Twin?

Your **Clinical Twin** is a real-time physiological simulation of *your specific body* running inside the BioGears engine — an open-source, US Army-developed human physiology simulator. When you tap **Simulate**, the app sends your logged daily events (meals, exercise, sleep, etc.) to a Python backend, which builds an XML scenario file and hands it to the BioGears C++ engine. The engine mathematically simulates how your organs, bloodstream, and nervous system respond to those events, second by second, and outputs a CSV of physiological measurements. The backend reads that CSV and returns the values you see on screen.

**In one sentence:** Every number on the Clinical Twin page comes from a physics-based differential equation simulation of your body, not from averages or databases.

---

## The Full Data Pipeline (Step by Step)

```
You log events (Meal, Exercise, Sleep…)
        ↓
App sends events to FastAPI backend (POST /sync/async)
        ↓
validator.py validates every field (types, ranges, safety caps)
        ↓
scenario_builder.py converts events → BioGears XML scenario
        ↓
engine_runner.py runs bg-cli.exe (the BioGears C++ binary)
        ↓
BioGears simulates your physiology second-by-second
        ↓
Outputs a CSV file with 14 physiological columns
        ↓
server.py reads the last row of that CSV
        ↓
analytics.py computes derived scores (CVD, recovery, etc.)
        ↓
App displays everything on the Clinical Twin page
```

---

## Section 1: The Health Score Badge (Grade A / B / C / D)

### What it is
A single letter grade (A → D) with a score out of 100 summarizing your overall physiological state *after* this simulation.

### Where it comes from
`analytics.py → get_health_score()` — computed from the vitals in the most recent simulation CSV:

| Component | Weight | Logic |
|---|---|---|
| Heart Rate normalcy | 25% | Optimal if 60–80 bpm; penalizes tachycardia/bradycardia |
| Blood Pressure normalcy | 25% | Optimal at 115/75; penalty scales with deviation |
| Glucose normalcy | 20% | Optimal 80–99 mg/dL; penalty for hypo/hyperglycemia |
| SpO₂ normalcy | 20% | Optimal ≥97%; steep penalty below 94% |
| Respiration Rate | 10% | Optimal 12–16 br/min |

**Grade thresholds:** A=90+, B=75–89, C=60–74, D<60

### How to explain it
> "It's like a report card for your body after today's routine. The engine simulates how your heart, lungs, and blood actually respond to what you ate, how you exercised, and how you slept — and gives a grade based on how all your vitals look afterward."

---

## Section 2: Simulation Vitals (The 8 Cards)

These are **the last data point** from the BioGears simulation CSV — meaning they represent your physiology *after* all your logged events have been processed through the simulation.

---

### 🫀 Heart Rate (bpm)

**What it is:** Number of times your heart beats per minute.

**Normal range:** 60–100 bpm (resting adult). Well-trained athletes can be 40–60 bpm.

**How BioGears generates it:**
The engine models your heart using cardiovascular differential equations. Autonomic nervous system (ANS) control adjusts HR based on:
- Exercise intensity → sympathetic nervous system activation → HR rises
- Stress events (PainStimulusData) → catecholamine release → HR rises
- Sleep (SleepData) → parasympathetic dominance → HR drops
- Caffeine (oral SubstanceData) → phosphodiesterase inhibition → HR rises slightly
- Ethanol → initial sympathetic, then vagal tone → HR varies

**Where in code:** `_safe("HeartRate")` from CSV column, rounded to 1 decimal.

**How to explain:**
> "This is the heart rate your body would actually be at, accounting for everything you logged today. If you had coffee at 9 AM, exercise at 6 PM, and a heavy dinner — the engine plays all of that forward in time and tells you what your HR ended up at."

---

### 🩸 Systolic Blood Pressure (mmHg)

**What it is:** Peak pressure in your arteries when the heart contracts.

**Normal range:** 90–120 mmHg. Pre-hypertension: 120–139. Hypertension: ≥140.

**How BioGears generates it:**
Modeled via the **baroreceptor reflex** — a feedback system that keeps BP in range. The engine calculates cardiac output (heart rate × stroke volume) and peripheral vascular resistance together:
- High sodium / high-calorie meal → increased blood volume → BP rises
- Exercise → cardiac output increases but also vasodilation → net effect varies with intensity
- Stress → vasoconstriction from norepinephrine → BP rises
- Alcohol → vasodilation → BP initially drops

**Where in code:** `_safe("SystolicArterialPressure")` → `int(sys_bp)` in `_build_vitals_from_df`.

---

### 🩸 Diastolic Blood Pressure (mmHg)

**What it is:** Residual pressure in arteries when the heart is at rest between beats.

**Normal range:** 60–80 mmHg.

**How BioGears generates it:** Same cardiovascular model as systolic, representing the elastic recoil pressure of arterial walls. Diastolic is more sensitive to total peripheral resistance — things like stress and caffeine raise it by causing vasoconstriction.

**Where in code:** `_safe("DiastolicArterialPressure")` → `int(dia_bp)`.

---

### 🍬 Blood Glucose (mg/dL)

**What it is:** Concentration of glucose in your blood.

**Normal ranges:**
- Fasting (8h no food): 70–99 mg/dL
- Post-meal (2h after): < 140 mg/dL
- Diabetes diagnosis: fasting ≥ 126 mg/dL

**How BioGears generates it:**
BioGears models a full glucose-insulin feedback loop:
- Meal (ConsumeNutrientsData) → carbohydrates absorbed → blood glucose rises
- Insulin secreted (or not, if you set diabetes condition) → glucose taken up by cells → falls back
- Exercise → muscles consume glucose → blood glucose drops
- Fasting → glycogenolysis and gluconeogenesis → glucose maintained at ~80 mg/dL
- Caffeine → mild increase via cortisol-like effect
- If `has_type1_diabetes = true` in registration → insulin production severity set (0.5–0.9) → glucose control impaired

**Where in code:** `_safe("Glucose-BloodConcentration")` — this is a **SubstanceDataRequest** in the BioGears XML (not a physiology request), which is why the column name has a dash.

**How to explain:**
> "If you log a high-carb meal and then skip exercise, the simulator shows your glucose spiking and staying elevated. If you're registered as a Type 2 diabetic with HbA1c of 9%, the insulin resistance is baked into the model — so the same meal gives you a worse glucose outcome than a healthy person."

---

### 🫁 SpO₂ / Oxygen Saturation (%)

**What it is:** Percentage of hemoglobin in your blood that is carrying oxygen. Measured as a fraction (0–1) by BioGears, then multiplied by 100 for display.

**Normal range:** 94–100%. Below 90% = hypoxia emergency.

**How BioGears generates it:**
Modeled via oxygen transport through the Fick principle and hemoglobin dissociation curve:
- Normal rest: ~98–99%
- Intense exercise → O₂ demand spikes → slight drop
- Sleep apnea / poor sleep → not directly modeled but low respiration rate reduces it
- If `has_anemia = true` → `ChronicAnemiaData` with reduction factor 0.3 → O₂-carrying capacity falls
- If `is_smoker = true` → COPD conditions set → alveolar gas exchange impaired → SpO₂ drops

**Where in code:** `_safe("OxygenSaturation") * 100` — note the raw BioGears value is 0.0–1.0, multiplied by 100 before display.

---

### 💨 Respiration Rate (breaths/min)

**What it is:** How many times per minute you breathe.

**Normal range:** 12–20 br/min for resting adults. During max exercise: up to 60 br/min.

**How BioGears generates it:**
Driven by CO₂ chemoreceptor feedback — the body breathes faster when blood CO₂ rises:
- Exercise → muscles produce CO₂ → respiration rate spikes
- Sleep → metabolic rate drops → respiration slows to 10–14 br/min
- Stress → hyperventilation pattern → rate rises
- Morphine / sedatives → respiratory depression → rate drops dangerously

**Where in code:** `_safe("RespirationRate")`.

---

### 📈 Mean Arterial Pressure / MAP (mmHg)

**What it is:** The average pressure in arteries during a full cardiac cycle. More clinically meaningful than systolic/diastolic alone — it tells you the actual *perfusion pressure* to organs.

**Formula:** MAP ≈ Diastolic + (1/3 × Pulse Pressure) = Dia + (Sys-Dia)/3

**Normal range:** 70–100 mmHg. Below 60 → organs don't receive enough blood (shock risk).

**How BioGears generates it:** Calculated directly from the same cardiovascular model — it's the weighted time-average pressure. Not derived from systolic/diastolic on the frontend; it's a separate BioGears output.

**Where in code:** `_safe("MeanArterialPressure")`.

**How to explain:**
> "MAP is what doctors actually use to assess whether your brain and kidneys are getting enough blood. Your systolic might look fine at 120, but if MAP drops below 65, you're in trouble. The simulator gives us MAP directly so we're not estimating it."

---

### 🌡️ Core Temperature (°C)

**What it is:** Your internal body temperature, distinct from skin temperature.

**Normal range:** 36.5–37.5°C (97.7–99.5°F).

**How BioGears generates it:**
Heat balance modeled through:
- Metabolic heat production (rises with exercise intensity)
- Heat loss through skin convection and respiration
- External environment (if you log an environment change — e.g., ExerciseEnvironment at 35°C)
- Intense exercise without hydration → temperature drifts up toward hyperthermia
- Sleep → basal metabolic rate drops → temperature drops 0.3–0.5°C

**Where in code:** `_safe("CoreTemperature")`.

---

## Section 3: AI Insights

### What they are
Text strings generated **by the app itself** (not an external AI API) by running a rule-based function over the simulation results. No LLM is involved.

### Where they come from
`BiogearsTwinContext.tsx → generateInsights(result)`:

```
If has_anomaly → describe each anomaly with severity
If HR > 100 → "Elevated heart rate — consider rest and hydration"
If HR < 55 → "Low HR — normal if trained athlete"
If SpO₂ < 94% → "Below normal — watch for breathlessness"
If glucose > 140 → "Post-simulation glucose elevated"
If glucose < 70 → "Glucose dropped — ensure carbs"
If drug interaction detected → surface the interaction warning
If data gap warning → note it
If nothing flagged → "All vitals in normal range"
```

### How to explain:
> "These aren't ChatGPT — they're medical rule-based alerts. The system checks every vital against clinical thresholds defined by WHO and AHA guidelines, and surfaces the ones that fall outside. It's the same logic a doctor uses in triage — just automated."

---

## Section 4: Organ Health Scores

### What they are
Percentage scores (0–100%) for 6 organ systems, with traffic-light status (green/warning/critical).

### Where they come from
`analytics.py → get_organ_scores(user_id)` — reads the latest simulation CSV and applies the following logic:

| Organ | What's analyzed | Green | Warning | Critical |
|---|---|---|---|---|
| **Heart** | HR deviation from baseline + MAP | 70–90 bpm + MAP 70–100 | HR 91–110 or MAP 60–70 | HR >110 or MAP <60 |
| **Lungs** | SpO₂ + respiration rate | SpO₂ ≥97%, RR 12–16 | SpO₂ 94–96% or RR 17–20 | SpO₂ <94% or RR >20 |
| **Gut** | Glucose + meal timing | Glucose 70–99 | Glucose 100–140 | Glucose >140 or <70 |
| **Brain** | MAP (cerebral perfusion) + stress level | MAP ≥70, no stress | MAP 65–70 or mild stress | MAP <65 or severe stress |
| **Liver** | Glucose metabolism rate | Based on glucose stability | Glucose spike pattern | Severe dysregulation |
| **Legs** | Exercise level achieved + recovery | AchievedExerciseLevel match | Partial mismatch | Full mismatch (overexertion) |

**Score formula:** Each organ starts at 100, deductions applied per deviation from normal range. Score = 100 - sum(deductions).

---

## Section 5: CVD Risk (10-Year Cardiovascular Risk)

### What it is
Estimated probability (%) that you will have a major cardiovascular event (heart attack, stroke) in the next 10 years.

### Where it comes from
`analytics.py → get_cvd_risk(user_id)` uses a simplified **Framingham Risk Score** formula — the same model used by hospitals worldwide:

**Inputs** (from your registration profile + simulation vitals):
- Age
- Sex (Male/Female)
- Total cholesterol (estimated from glucose + body fat + meal patterns)
- HDL cholesterol (estimated)
- Systolic BP from simulation
- Smoker status (from registration)
- Diabetic status (from registration)
- Exercise level (from today's events)

**Categories:**
- Low: < 10%
- Intermediate: 10–20%
- High: > 20%

### How to explain:
> "This is the same 10-year risk calculator used in hospitals like AIIMS and Apollo. Doctors use the Framingham score to decide whether to start statin therapy. We compute it using your simulation vitals + your registration data — so it's personalized, not population-averaged."

---

## Section 6: Recovery Readiness

### What it is
A score (0–100) with a status label (Ready / Caution / Fatigued) indicating how physiologically recovered your body is and whether it's ready for another training session or stress load.

### Where it comes from
`analytics.py → get_recovery_readiness(user_id)` — computed from:

| Factor | Logic |
|---|---|
| Resting HR vs baseline | If simulated HR is within 5 bpm of your baseline → good recovery |
| HRV proxy | Lower heart rate = higher parasympathetic = better recovery |
| Sleep events logged | ≥7h sleep → +recovery points |
| Exercise intensity today | Very high exercise → recovery score drops |
| Glucose stability | Stable glucose post-simulation → good metabolic recovery |

**Status:**
- **Ready** (score ≥ 75): Safe to train again or take on stress
- **Caution** (50–74): Light activity only
- **Fatigued** (< 50): Rest recommended

### How to explain:
> "Think of it like HRV (Heart Rate Variability) on a Garmin — but computed from your actual physiological simulation, not a wrist sensor. It tells you if your body has recovered from today's load. Athletes use this to avoid overtraining."

---

## Section 7: Today's Macros Summary

### What it is
Running totals of calories, carbohydrates, protein, and fat from all **Meal** events you've logged today.

### Where it comes from
Computed entirely on-device in `BiogearsTwinContext.tsx`:

```typescript
todayEvents.reduce((acc, e) => {
  if (e.event_type === 'meal') {
    acc.carbs    += e.carb_g    || 0;
    acc.protein  += e.protein_g || 0;
    acc.fat      += e.fat_g     || 0;
    acc.calories += e.value     || 0;
  }
}, { carbs: 0, protein: 0, fat: 0, calories: 0 });
```

The macro grams are auto-calculated from your meal type:
- **Balanced** (40%C / 30%F / 30%P): 500 kcal → 50g carb, 17g fat, 38g protein
- **Ketogenic** (5%C / 75%F / 20%P): 500 kcal → 6g carb, 42g fat, 25g protein
- **Custom**: You enter exact grams

---

## Section 8: Input Validation (How Every Value Is Protected)

Before *any* event reaches BioGears, `validator.py` checks every field:

| Event Type | Validation Rules |
|---|---|
| **Meal** | Calories must be 50–5,000 kcal. Meal type must be from valid list. Custom meals require carb_g, fat_g, protein_g. |
| **Exercise** | Intensity must be 0.0–1.0. Duration must be 60–14,400 seconds (1 min–4 hrs). |
| **Sleep** | Hours must be 0.25–14. Values outside are clamped with a warning. |
| **Water** | Must be 50–5,000 mL. |
| **Substance** | Substance must exist in the 79-substance registry. Safety dose caps enforced (e.g., Morphine max 30mg). |
| **Stress** | Intensity must be 0.0–1.0. |
| **Alcohol** | Max 10 standard drinks per event (safety cap). |
| **Fasting** | Must be 1–48 hours. |
| **Drug interactions** | Checked across all substances in the batch (e.g., Morphine + Midazolam flagged for respiratory depression). |

If validation fails → HTTP 422 error returned → simulation never starts → no dangerous XML is built.

---

## Section 9: Registration — How Your Body Is Set Up

Before running any simulation, you must register a clinical profile. This tells BioGears what *your specific body* looks like:

| Field | What It Does in BioGears |
|---|---|
| Age | Affects basal metabolism, cardiac output ceiling, vascular stiffness |
| Weight (kg) | Sets metabolic rate, blood volume (70 mL/kg), water intake calculations |
| Height (cm) | Used for BSA (body surface area) and pulmonary volumes |
| Sex | Male/Female — affects cardiac output, hormonal baseline, anemia risk |
| Body Fat % | Adipose tissue distribution, insulin sensitivity |
| Resting HR | Sets heart rate baseline in Patient XML |
| Systolic / Diastolic BP | Sets BP baseline in Patient XML |
| Has Type 1/2 Diabetes | Inserts `DiabetesType1Data` or `DiabetesType2Data` condition into BioGears |
| HbA1c % | Scales diabetes severity (HbA1c < 7 = well-controlled, > 9 = poor control) |
| Is Smoker | Inserts `ChronicObstructivePulmonaryDiseaseData` (COPD bronchitis severity 0.2) |
| Has Anemia | Inserts `ChronicAnemiaData` (reduction factor 0.3 → 30% less O₂-carrying capacity) |

This registration runs BioGears for 30 seconds to **stabilize** the patient model, then saves the engine state as a `.xml` file. Every future simulation *resumes from this state* — so it's always your body, not a generic person.

---

## Section 10: The BioGears Engine Itself

**What is BioGears?**
- Open-source, validated human physiology simulator developed by **TechSolutions** under a DARPA/US Army contract
- Written in C++
- 61,000+ lines of differential equations modeling 26 organ systems
- Used in military medical training, pharmaceutical research, and anesthesia simulators
- Validated against real clinical data (published in PLOS ONE, Journal of Medical Systems, etc.)

**What it is NOT:**
- Not an average or lookup table
- Not AI-generated estimates
- Not based on population statistics

**It IS:**
- A physics engine for human physiology
- Solving Ordinary Differential Equations (ODEs) at each time step
- Same approach as finite element analysis for structural engineering — but for biology

---

## How to Explain Everything in 30 Seconds (Elevator Pitch)

> "VitalHealth doesn't estimate your health from averages. It runs an actual physics simulation of your specific body — your age, weight, diabetes status, blood pressure baseline — using the same engine the US Army uses for medical training. When you log that you had 2 cups of coffee, went for a 30-minute run, and had a 600-calorie dinner, the engine simulates how your heart rate, blood pressure, glucose, and oxygen levels actually respond, second by second. The numbers you see aren't guesses. They're computed from differential equations. That's a Digital Twin."

---

## Quick Reference: Every Value, Its Source, Its Normal Range

| Metric | Source | Normal Range | What Affects It |
|---|---|---|---|
| Heart Rate | BioGears HeartRate output | 60–100 bpm | Exercise ↑, Sleep ↓, Caffeine ↑, Stress ↑ |
| Systolic BP | BioGears SystolicArterialPressure | 90–120 mmHg | Stress ↑, Exercise ↑↓, Alcohol ↓ |
| Diastolic BP | BioGears DiastolicArterialPressure | 60–80 mmHg | Stress ↑, Alcohol ↓ |
| Blood Glucose | BioGears Glucose-BloodConcentration | 70–140 mg/dL | Meals ↑, Exercise ↓, Fasting ↓, Diabetes impairs |
| SpO₂ | BioGears OxygenSaturation × 100 | 94–100% | Anemia ↓, COPD ↓, Exercise slight ↓ |
| Respiration Rate | BioGears RespirationRate | 12–20 br/min | Exercise ↑, Sleep ↓, Stress ↑ |
| MAP | BioGears MeanArterialPressure | 70–100 mmHg | Derived from cardiovascular model |
| Core Temperature | BioGears CoreTemperature | 36.5–37.5°C | Exercise ↑, Sleep ↓, Hot environment ↑ |
| Health Score | Rule-based analytics.py | 0–100 (A/B/C/D) | All vitals combined |
| CVD Risk | Framingham formula | < 10% low | Age, BP, smoking, diabetes |
| Recovery | HRV-proxy analytics | 0–100 | HR, sleep, exercise load |
| Organ Scores | Threshold-based analytics | 0–100% | Organ-specific vitals |
| AI Insights | Rule-based alerts in app | Text | Clinical threshold violations |
| Macros | On-device meal sum | grams / kcal | Your logged meals only |
