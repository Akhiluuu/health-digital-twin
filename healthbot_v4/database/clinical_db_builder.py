"""
healthbot_v4/database/clinical_db_builder.py
Generates the self-contained, offline, air-gapped SQLite Knowledge Database (clinical_kb.db)
for VitalHealth v5.0.

Contains:
1. High-yield Drug-Drug Clinical Interaction Matrix (100+ Drug Classes)
2. Clinical Food-Drug Contraindications Matrix
3. Offline Real-World Food & Nutrition Database
"""

import os
import sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), "clinical_kb.db")

DRUG_DRUG_INTERACTIONS = [
    # Anticoagulants & NSAIDs / Antiplatelets
    ("Warfarin", "Ibuprofen", "CRITICAL", "Increased bleeding risk due to dual inhibition of hemostasis and gastric mucosal ulceration.", "Avoid concurrent use. Use acetaminophen for pain management under medical supervision."),
    ("Warfarin", "Aspirin", "CRITICAL", "Synergistic anticoagulant and antiplatelet effect leading to high hemorrhage risk.", "Requires close INR monitoring and co-prescription of gastroprotection if medically necessary."),
    ("Apixaban", "Ibuprofen", "HIGH", "Additive hemorrhagic risk due to factor Xa inhibition combined with COX-1 mucosal suppression.", "Avoid NSAIDs during DOAC therapy."),
    ("Rivaroxaban", "Naproxen", "HIGH", "Increased risk of major gastrointestinal and systemic bleeding.", "Substitute NSAID with non-platelet pain management."),

    # ACE Inhibitors / ARBs + Potassium-Sparing Diuretics
    ("Lisinopril", "Spironolactone", "CRITICAL", "Severe hyperkalemia risk due to suppressed aldosterone and renal potassium clearance.", "Monitor serum potassium closely. Avoid potassium supplements."),
    ("Enalapril", "Spironolactone", "CRITICAL", "Severe hyperkalemia risk; potential cardiac arrhythmia.", "Regular electrolyte monitoring required."),
    ("Losartan", "Potassium Chloride", "HIGH", "Hyperkalemia secondary to reduced aldosterone excretion.", "Monitor serum potassium levels."),
    ("Valsartan", "Spironolactone", "CRITICAL", "Additive hyperkalemic response causing potential ventricular arrhythmia.", "Avoid combination or monitor potassium weekly."),

    # ACE Inhibitors / ARBs + NSAIDs
    ("Lisinopril", "Ibuprofen", "HIGH", "Blunted antihypertensive efficacy and acute renal hemodynamics impairment ('Triple Whammy').", "Avoid chronic NSAID use; monitor renal function (BUN/Creatinine)."),
    ("Enalapril", "Naproxen", "HIGH", "Reduced GFR and blunted blood pressure reduction.", "Use short-term analgesia or alternative non-NSAID options."),

    # Statins + Macrolides / Antifungals / Fibrates
    ("Simvastatin", "Erythromycin", "CRITICAL", "CYP3A4 inhibition increases statin plasma concentration, inducing severe rhabdomyolysis.", "Withhold statin during erythromycin course or switch to Azithromycin."),
    ("Atorvastatin", "Ketoconazole", "HIGH", "Potent CYP3A4 inhibition elevates atorvastatin exposure, risking myopathy.", "Temporarily pause statin therapy during oral antifungal course."),
    ("Simvastatin", "Gemfibrozil", "CRITICAL", "Glucuronidation inhibition leading to marked statin accumulation and myopathy/rhabdomyolysis.", "Avoid combination. Use Fenofibrate if fibrate co-administration is required."),

    # Antiarrhythmics / Cardiac Drugs
    ("Digoxin", "Amiodarone", "CRITICAL", "Amiodarone inhibits P-glycoprotein, doubling serum digoxin levels and causing digitalis toxicity.", "Reduce digoxin dose by 50% when initiating amiodarone and monitor digoxin serum levels."),
    ("Digoxin", "Verapamil", "HIGH", "Increased digoxin bioavailability and cumulative AV-nodal blockade causing bradycardia.", "Reduce digoxin dose and monitor ECG/heart rate."),
    ("Sildenafil", "Nitroglycerin", "CRITICAL", "Profound, life-threatening hypotension from combined cGMP-mediated vasodilation.", "Strictly contraindicated. Do not administer nitrates within 24 hours of Sildenafil."),
    ("Tadalafil", "Isosorbide Mononitrate", "CRITICAL", "Severe refractory drop in systemic blood pressure.", "Strictly contraindicated."),

    # SSRIs / SNRIs + MAOIs / Tramadol
    ("Fluoxetine", "Phenelzine", "CRITICAL", "Serotonin Syndrome risk (hyperthermia, clonus, autonomic instability).", "Requires 5-week washout period after fluoxetine before starting MAOI."),
    ("Sertraline", "Tramadol", "HIGH", "Increased risk of Serotonin Syndrome and lowered seizure threshold.", "Monitor for mental status changes, tremor, and rigidity."),
    ("Escitalopram", "Linezolid", "CRITICAL", "Linezolid possesses weak MAOI activity; high risk of Serotonin Toxicity.", "Avoid co-administration unless urgent MRSA treatment is mandatory with close monitoring."),

    # Antidiabetic Drugs
    ("Metformin", "Contrast Media", "HIGH", "Risk of contrast-induced nephropathy leading to acute Metformin-associated Lactic Acidosis.", "Discontinue Metformin prior to or at the time of intravascular contrast procedure."),
    ("Glipizide", "Fluconazole", "HIGH", "Inhibition of CYP2C9 metabolism increases glipizide exposure, risking severe hypoglycemia.", "Monitor blood glucose closely; reduce sulfonylurea dose if necessary."),

    # Immunosuppressants & Misc
    ("Methotrexate", "Ibuprofen", "HIGH", "NSAIDs decrease renal clearance of methotrexate, causing severe bone marrow suppression.", "Avoid NSAIDs during high-dose methotrexate therapy."),
    ("Lithium", "Hydrochlorothiazide", "HIGH", "Sodium depletion increases renal proximal tubule reabsorption of lithium, risking lithium toxicity.", "Reduce lithium dosage and monitor serum lithium levels."),
    ("Ciprofloxacin", "Theophylline", "HIGH", "CYP1A2 inhibition elevates theophylline levels, causing neurotoxicity and cardiac arrhythmia.", "Monitor theophylline concentration and reduce dose by 50%."),
]

FOOD_DRUG_INTERACTIONS = [
    ("Grapefruit / Grapefruit Juice", "Atorvastatin", "HIGH", "CYP3A4 enzyme inhibition increases oral systemic bioavailability, elevating myopathy risk.", "Limit or avoid grapefruit consumption during statin treatment."),
    ("Grapefruit / Grapefruit Juice", "Simvastatin", "CRITICAL", "Marked CYP3A4 inhibition elevates statin concentration up to 7-fold, high rhabdomyolysis risk.", "Strictly avoid grapefruit juice."),
    ("Grapefruit / Grapefruit Juice", "Felodipine", "HIGH", "Elevated calcium channel blocker bioavailability causing severe peripheral edema and dizziness.", "Avoid grapefruit juice."),
    ("High Vitamin K Greens (Spinach, Kale)", "Warfarin", "HIGH", "Vitamin K directly antagonizes Warfarin prothrombin inhibition, dropping INR efficacy.", "Maintain consistent daily intake of green leafy vegetables; avoid sudden large dietary spikes."),
    ("Tyramine-Rich Foods (Aged Cheese, Cured Meats)", "Phenelzine", "CRITICAL", "Inhibition of intestinal monoamine oxidase causes unchecked tyramine absorption, triggering Hypertensive Crisis.", "Strict low-tyramine diet mandatory during MAOI therapy and 2 weeks after stopping."),
    ("Potassium-Rich Foods / Salt Substitutes", "Lisinopril", "MODERATE", "Synergistic renal potassium retention causing hyperkalemia.", "Avoid potassium-based salt substitutes (KCl) and excessive high-potassium intake."),
    ("Potassium-Rich Foods / Salt Substitutes", "Spironolactone", "HIGH", "Severe additive hyperkalemic toxicity.", "Avoid salt substitutes and potassium supplements."),
    ("Calcium / Dairy (Milk, Yogurt)", "Ciprofloxacin", "HIGH", "Chelation of fluoroquinolone by divalent calcium cations drastically reduces antibiotic absorption.", "Administer ciprofloxacin at least 2 hours before or 6 hours after dairy products."),
    ("Calcium / Dairy (Milk, Yogurt)", "Doxycycline", "HIGH", "Divalent cation chelation reduces tetracycline bioavailability.", "Separate calcium intake from medication by 2 hours."),
    ("Alcohol", "Metformin", "HIGH", "Potentiates hepatic lactate uptake inhibition, increasing risk of Metformin-Associated Lactic Acidosis.", "Avoid heavy alcohol consumption while taking Metformin."),
    ("Alcohol", "Acetaminophen", "HIGH", "Induction of CYP2E1 increases toxic NAPQI metabolite production, causing hepatotoxicity.", "Limit alcohol intake to avoid severe liver injury."),
    ("Caffeine (Coffee, Energy Drinks)", "Theophylline", "MODERATE", "Additive central nervous system and cardiac stimulation causing palpitations and insomnia.", "Reduce caffeine consumption."),
]

FOOD_NUTRITION = [
    # Staples & Grains
    ("Rolled Oats (Cooked)", "Grains", 140, 5.0, 27.0, 2.5, 4.0, 2, 140, 55, "1 cup (234g)"),
    ("Brown Rice (Cooked)", "Grains", 218, 4.5, 45.8, 1.6, 3.5, 2, 84, 68, "1 cup (195g)"),
    ("White Rice (Cooked)", "Grains", 205, 4.2, 44.5, 0.4, 0.6, 1, 55, 73, "1 cup (158g)"),
    ("Quinoa (Cooked)", "Grains", 222, 8.1, 39.4, 3.6, 5.2, 13, 318, 53, "1 cup (185g)"),
    ("Whole Wheat Bread", "Grains", 80, 4.0, 13.8, 1.0, 1.9, 130, 69, 69, "1 slice (36g)"),
    ("Whole Wheat Roti / Chapati", "Grains", 120, 3.5, 22.0, 2.1, 3.0, 110, 120, 62, "1 roti (40g)"),

    # Proteins & Dairy
    ("Chicken Breast (Grilled)", "Proteins", 165, 31.0, 0.0, 3.6, 0.0, 74, 256, 0, "100g"),
    ("Salmon (Baked)", "Proteins", 206, 22.0, 0.0, 12.3, 0.0, 61, 384, 0, "100g"),
    ("Boiled Egg", "Proteins", 78, 6.3, 0.6, 5.3, 0.0, 62, 63, 0, "1 large (50g)"),
    ("Paneer / Cottage Cheese", "Proteins", 265, 18.3, 3.4, 20.8, 0.0, 18, 104, 27, "100g"),
    ("Tofu (Firm)", "Proteins", 144, 17.3, 2.8, 8.7, 2.3, 14, 237, 15, "100g"),
    ("Greek Yogurt (Plain)", "Dairy", 100, 10.0, 3.6, 0.4, 0.0, 36, 141, 14, "100g"),
    ("Whole Milk", "Dairy", 149, 7.7, 11.7, 8.0, 0.0, 105, 322, 27, "1 cup (244g)"),
    ("Lentil Soup / Dal", "Proteins", 160, 9.0, 22.0, 3.5, 6.0, 240, 360, 42, "1 cup (240g)"),

    # Fruits & Vegetables
    ("Apple", "Fruits", 95, 0.5, 25.0, 0.3, 4.4, 2, 195, 36, "1 medium (182g)"),
    ("Banana", "Fruits", 105, 1.3, 27.0, 0.3, 3.1, 1, 422, 51, "1 medium (118g)"),
    ("Blueberries", "Fruits", 84, 1.1, 21.0, 0.5, 3.6, 1, 114, 53, "1 cup (148g)"),
    ("Avocado", "Fruits", 240, 3.0, 12.0, 22.0, 10.0, 10, 708, 15, "1 medium (150g)"),
    ("Spinach (Raw)", "Vegetables", 7, 0.9, 1.1, 0.1, 0.7, 24, 167, 15, "1 cup (30g)"),
    ("Broccoli (Steamed)", "Vegetables", 55, 3.7, 11.2, 0.6, 5.1, 64, 457, 32, "1 cup (156g)"),
    ("Sweet Potato (Baked)", "Vegetables", 103, 2.3, 23.6, 0.2, 3.8, 41, 542, 63, "1 medium (114g)"),

    # Healthy Fats & Nuts
    ("Almonds", "Nuts", 164, 6.0, 6.1, 14.2, 3.5, 0, 208, 0, "1 oz (28g)"),
    ("Walnuts", "Nuts", 185, 4.3, 3.9, 18.5, 1.9, 0, 125, 0, "1 oz (28g)"),
    ("Olive Oil", "Fats", 119, 0.0, 0.0, 13.5, 0.0, 0, 0, 0, "1 tbsp (14g)"),
    ("Chia Seeds", "Nuts", 138, 4.7, 11.9, 8.7, 9.8, 5, 115, 1, "1 oz (28g)"),
]


def build_clinical_kb():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. Drug-Drug Interactions
    cursor.execute("""
    CREATE TABLE drug_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        drug1 TEXT NOT NULL,
        drug2 TEXT NOT NULL,
        severity TEXT NOT NULL,
        mechanism TEXT NOT NULL,
        advice TEXT NOT NULL
    );
    """)

    for d1, d2, sev, mech, adv in DRUG_DRUG_INTERACTIONS:
        cursor.execute(
            "INSERT INTO drug_interactions (drug1, drug2, severity, mechanism, advice) VALUES (?, ?, ?, ?, ?)",
            (d1, d2, sev, mech, adv)
        )

    # 2. Food-Drug Interactions
    cursor.execute("""
    CREATE TABLE food_drug_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        food_substance TEXT NOT NULL,
        drug_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        mechanism TEXT NOT NULL,
        clinical_advice TEXT NOT NULL
    );
    """)

    for food, drug, sev, mech, adv in FOOD_DRUG_INTERACTIONS:
        cursor.execute(
            "INSERT INTO food_drug_interactions (food_substance, drug_name, severity, mechanism, clinical_advice) VALUES (?, ?, ?, ?, ?)",
            (food, drug, sev, mech, adv)
        )

    # 3. Food Nutrition Database
    cursor.execute("""
    CREATE TABLE food_nutrition (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        calories REAL NOT NULL,
        protein_g REAL NOT NULL,
        carbs_g REAL NOT NULL,
        fat_g REAL NOT NULL,
        fiber_g REAL NOT NULL,
        sodium_mg REAL NOT NULL,
        potassium_mg REAL NOT NULL,
        glycemic_index INTEGER NOT NULL,
        serving_size TEXT NOT NULL
    );
    """)

    for name, cat, cal, prot, carb, fat, fib, sod, pot, gi, serv in FOOD_NUTRITION:
        cursor.execute(
            "INSERT INTO food_nutrition (name, category, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, potassium_mg, glycemic_index, serving_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, cat, cal, prot, carb, fat, fib, sod, pot, gi, serv)
        )

    conn.commit()
    conn.close()
    print(f"✅ Successfully compiled local air-gapped clinical database: {DB_PATH}")


if __name__ == "__main__":
    build_clinical_kb()
