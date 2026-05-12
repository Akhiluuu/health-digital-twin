"""
character.py — Dr. Aria's personality, system prompts, and query classifier.

Fixes in this version:
  - classify_intent now checks greeting/farewell on WHOLE WORDS only,
    so "antihistamine", "later" in a sentence, "take care" in a health query
    no longer trigger greeting/farewell incorrectly.
  - Massively expanded _HEALTH_KW to cover metabolism, antihistamine,
    pharmacology terms, and hundreds of other health words that were
    previously falling through to off_topic.
  - All system prompts now enforce well-structured, formatted output.
  - Medicine explain prompt enriched for 2-line richer output.
  - MAX_HISTORY_TURNS kept at 0 for speed.
"""

# ── System prompts ────────────────────────────────────────────────────────────

GENERAL_SYSTEM_PROMPT = """You are Dr. Aria, a warm, knowledgeable AI health assistant.

Your response MUST follow this exact structure — no exceptions:

## [Topic Title]

**What it is:** One clear sentence explaining the concept.

**How it works:** 2–3 sentences explaining the mechanism in simple terms.

**Why it matters for your health:** 1–2 sentences on health relevance.

**Practical tips:**
• Tip one
• Tip two
• Tip three

> ⚕️ *Always consult a qualified doctor for personal medical advice.*

Rules:
- Use **bold** for key medical terms.
- Use simple, friendly language — no unnecessary jargon.
- Bullet points must be specific and actionable, not generic.
- Never diagnose. Never prescribe.
- Total response: 120–180 words. No more.
""".strip()

LAB_SYSTEM_PROMPT = """You are Dr. Aria, an AI health assistant specialising in interpreting lab reports.

Your response MUST follow this exact structure:

## Lab Report Summary

### Results
| Test | Value | Status |
|------|-------|--------|
| [Test Name] | [Value] | ✅ Normal / ⚠️ Borderline / 🔴 Abnormal |

### Key Findings
**[Most important finding]:** One sentence explanation in plain English.

### What This Means
2–3 sentences summarising the overall picture.

### Next Steps
• [Action 1]
• [Action 2]

> ⚕️ *Discuss these results with your doctor before making any changes.*

Rules:
- ONLY use values present in the patient data. Never invent numbers.
- Flag abnormal values clearly with 🔴.
- Do NOT diagnose. Do NOT recommend specific medications.
""".strip()

PRESCRIPTION_SYSTEM_PROMPT = """You are Dr. Aria, an AI health assistant who explains prescriptions clearly.

Your response MUST follow this exact structure:

## Your Prescription

For each medicine, use this exact format:

### 💊 [Medicine Name]
- **Dose:** [dose]
- **Frequency:** [frequency]
- **Purpose:** What this medicine is commonly used for (1 sentence).
- **Take with:** Food / Water / As directed.
- **Common side effects:** [1–2 common ones, brief].

---

### ⚠️ Important Reminders
• Follow your doctor's instructions exactly.
• Do not adjust doses without consulting your doctor.
• Complete the full course even if you feel better.

> ⚕️ *This explanation is for educational purposes only.*

Rules:
- If information is missing (e.g., duration), write "Not specified".
- Do NOT add advice beyond what is in the prescription.
""".strip()

SYMPTOM_SYSTEM_PROMPT = """You are Dr. Aria, a caring AI health assistant helping someone understand their symptoms.

Your response MUST follow this exact structure:

## 🩺 About [Symptom/Condition]

**What it is:** One sentence defining it clearly.

**Common causes:**
• [Cause 1]
• [Cause 2]
• [Cause 3]

**What you can do at home:**
• [Practical tip 1]
• [Practical tip 2]
• [Practical tip 3]

**⚠️ See a doctor immediately if:**
• [Warning sign 1]
• [Warning sign 2]
• [Warning sign 3]

> ⚕️ *If symptoms persist or worsen, please consult a qualified doctor.*

Rules:
- Acknowledge the symptom with empathy before information.
- Be specific and practical — not vague or generic.
- Do NOT speculate on rare or serious diagnoses unless clearly indicated.
- Total response: 130–200 words. No more.
""".strip()

MENTAL_HEALTH_SYSTEM_PROMPT = """You are Dr. Aria, a compassionate AI health assistant who takes mental health seriously.

Your response MUST follow this exact structure:

## 💙 [Topic]

**Understanding this:** 2 sentences of psychoeducation in plain, warm language.

**Coping strategies you can try:**
• [Evidence-based strategy 1]
• [Evidence-based strategy 2]
• [Evidence-based strategy 3]

**When to seek professional help:**
One clear, non-alarming sentence about when to see a therapist or GP.

> 🆘 *If you are in crisis or having thoughts of self-harm, please contact a crisis helpline immediately.*

> ⚕️ *Dr. Aria does not diagnose mental health conditions. A licensed professional can help you properly.*

Rules:
- Always respond with warmth. Never be dismissive.
- Do NOT use clinical labels unless the user introduces them first.
- If self-harm risk is mentioned, provide crisis resources immediately.
""".strip()

MIXED_SYSTEM_PROMPT = """You are Dr. Aria, an AI health assistant.

Your response MUST be well-structured using headers (##), bullet points (•), and **bold** for key terms.

Answer in 120–180 words. Use the information in [PATIENT DATA] and your medical knowledge.
Always end with a recommendation to consult a professional.
""".strip()

# ── Safety text ───────────────────────────────────────────────────────────────

DISCLAIMER = (
    "\n\n---\n"
    "⚕️ *Dr. Aria is an AI assistant, not a licensed doctor. "
    "This information is for educational purposes only. "
    "Always consult a qualified healthcare professional for medical advice, "
    "diagnosis, or treatment.*"
)

URGENT_NOTICE = (
    "\n\n🚨 **URGENT — Please seek immediate medical attention.** "
    "Some of the symptoms or values you mentioned may indicate a medical emergency. "
    "Call emergency services (911 / 999 / 112) or go to the nearest hospital now. "
    "Do not wait."
)

# ── Greetings and farewells ───────────────────────────────────────────────────

# These are EXACT whole-word matches only — checked differently in classifier
_GREETING_EXACT = frozenset([
    "hi", "hello", "hey", "howdy", "greetings", "sup",
    "good morning", "good afternoon", "good evening",
    "what's up", "whats up",
])

_FAREWELL_EXACT = frozenset([
    "bye", "goodbye", "good bye", "see you", "see ya",
    "cya", "farewell", "good night", "goodnight",
    "talk later", "ttyl",
])

GREETING_RESPONSE = (
    "👋 Hello! I'm **Dr. Aria**, your personal health assistant.\n\n"
    "I can help you with:\n"
    "• 🧪 Reading and explaining your **lab reports**\n"
    "• 💊 Understanding your **prescriptions** and medicines\n"
    "• 🤒 Guidance on **symptoms** you're experiencing\n"
    "• 📋 General **medical knowledge** questions\n\n"
    "How may I help you today?"
)
GREETING_MESSAGE = GREETING_RESPONSE

FAREWELL_RESPONSE = (
    "👋 Take care and stay healthy! "
    "Remember to keep up with your health checkups. "
    "Come back anytime you need help — I'm always here! 😊"
)

# ── Context window ────────────────────────────────────────────────────────────

MAX_HISTORY_TURNS = 0

# ── Keyword sets ──────────────────────────────────────────────────────────────

_SYMPTOM_KW = frozenset([
    # Self-report phrases
    "i feel", "i am feeling", "i've been", "i have been feeling", "i'm feeling",
    "i've had", "i have had", "i keep", "i keep getting", "i can't", "i cannot",
    "my body", "my chest", "my head", "my stomach", "my back", "my leg",
    "my arm", "my throat", "my eyes", "my skin", "my joints",
    # Pain & discomfort
    "pain", "ache", "aching", "hurts", "hurting", "sore", "soreness",
    "cramp", "cramping", "throbbing", "stabbing", "burning", "stinging",
    "tingling", "numbness", "numb", "tender", "sensitivity",
    # Fever & temperature
    "fever", "high temperature", "chills", "chilly", "shivering", "sweating",
    "night sweats", "hot flashes", "cold sweats",
    # Respiratory
    "cough", "coughing", "wheezing", "breathless", "shortness of breath",
    "difficulty breathing", "tight chest", "chest tightness", "runny nose",
    "stuffy nose", "congestion", "sneezing", "sore throat", "hoarse",
    # Gastrointestinal
    "nausea", "vomiting", "vomit", "threw up", "diarrhea", "diarrhoea",
    "constipation", "bloating", "bloated", "gas", "indigestion", "heartburn",
    "acid reflux", "stomach ache", "abdominal pain", "loose stools",
    # Neurological / head
    "headache", "migraine", "dizziness", "dizzy", "lightheaded", "fainting",
    "vertigo", "confusion", "forgetfulness", "memory loss", "blurred vision",
    "double vision", "ringing in ears", "tinnitus", "ear pain",
    # Energy & general
    "fatigue", "tired", "tiredness", "exhausted", "exhaustion", "lethargy",
    "weakness", "weak", "low energy", "not sleeping", "insomnia",
    "oversleeping", "loss of appetite", "not eating",
    # Skin
    "rash", "rashes", "hives", "itching", "itch", "itchy", "redness",
    "swelling", "swollen", "bruising", "bruise", "dry skin", "peeling",
    "yellow skin", "jaundice", "pale skin",
    # Bleeding
    "bleeding", "blood in stool", "blood in urine", "blood in mucus",
    "bleeding gums", "nosebleed",
    # Urinary
    "frequent urination", "burning urination", "dark urine", "cloudy urine",
    "no urination", "urine smell",
    # Musculoskeletal
    "joint pain", "knee pain", "back pain", "neck pain", "shoulder pain",
    "muscle pain", "muscle stiffness", "stiff neck", "stiff joints",
    # Mental / emotional symptoms
    "anxious", "anxiety", "panic", "panic attack", "depressed", "depression",
    "mood swings", "irritable", "angry", "crying", "sad", "hopeless",
    "stressed", "overwhelmed",
    # Cardiac
    "palpitations", "heart racing", "heart pounding", "irregular heartbeat",
    "skipped beat", "chest pain",
    # Weight
    "weight loss", "weight gain", "losing weight", "gaining weight",
    "sudden weight",
])

_PRESCRIPTION_KW = frozenset([
    "prescription", "prescriptions", "prescribed", "prescribe",
    "medicine", "medicines", "medication", "medications",
    "tablet", "tablets", "capsule", "capsules", "pill", "pills",
    "drug", "drugs", "syrup", "drops", "patch", "inhaler",
    "injection", "injections", "infusion", "ointment", "cream", "gel",
    "suppository", "nebulizer",
    "dosage", "dose", "doses", "how much to take", "when to take",
    "how to take", "side effects", "interactions", "drug interaction",
    "antibiotic", "antibiotics", "antifungal", "antiviral", "antidepressant",
    "antihypertensive", "diuretic", "painkiller", "pain reliever",
    "blood thinner", "anticoagulant", "statin", "beta blocker",
    "ace inhibitor", "calcium channel", "insulin", "metformin",
    "amlodipine", "lisinopril", "atorvastatin", "omeprazole",
    "pantoprazole", "azithromycin", "amoxicillin", "paracetamol",
    "ibuprofen", "aspirin", "cetirizine", "levocetirizine",
    "montelukast", "salbutamol", "fluticasone", "prednisone",
    "prednisolone", "levothyroxine", "methotrexate", "hydroxychloroquine",
    "antihistamine", "antihistamines", "histamine", "loratadine",
    "diphenhydramine", "fexofenadine", "chlorphenamine", "promethazine",
    "can i take", "should i take", "is it safe to take",
    "take with", "take without", "take before", "take after",
    "what did the doctor", "what was prescribed", "my prescription",
    "my medicine", "my medication",
])

_LAB_KW = frozenset([
    "lab", "laboratory", "report", "result", "results", "test", "tests",
    "blood test", "blood work", "my report", "my results", "my lab",
    "my blood test", "my test", "test report",
    "scan", "mri", "x-ray", "xray", "ultrasound", "ct scan", "pet scan",
    "ecg", "ekg", "echocardiogram", "endoscopy", "colonoscopy", "biopsy",
    "hemoglobin", "haemoglobin", "hgb", "hb",
    "platelet", "platelets", "plt",
    "wbc", "white blood cell", "white blood count",
    "rbc", "red blood cell", "red blood count",
    "hematocrit", "haematocrit", "hct", "mcv", "mch", "mchc", "rdw",
    "neutrophil", "lymphocyte", "monocyte", "eosinophil", "basophil",
    "glucose", "fasting glucose", "blood sugar", "hba1c",
    "cholesterol", "ldl", "hdl", "triglycerides", "vldl",
    "creatinine", "urea", "bun", "uric acid", "gfr", "egfr",
    "sodium", "potassium", "chloride", "bicarbonate", "calcium",
    "magnesium", "phosphorus", "albumin", "total protein",
    "sgpt", "alt", "sgot", "ast", "ggt", "alp", "alkaline phosphatase",
    "bilirubin", "direct bilirubin", "indirect bilirubin", "liver function",
    "lft", "liver enzymes",
    "thyroid", "tsh", "t3", "t4", "free t3", "free t4", "thyroid function",
    "vitamin d", "vitamin b12", "vitamin c", "vitamin a", "vitamin e",
    "folate", "folic acid", "iron", "ferritin", "tibc", "transferrin",
    "zinc", "copper",
    "troponin", "ck-mb", "creatine kinase", "bnp",
    "crp", "c-reactive protein", "esr", "erythrocyte sedimentation",
    "procalcitonin", "widal", "dengue", "malaria", "typhoid",
    "testosterone", "estrogen", "estradiol", "progesterone", "prolactin",
    "cortisol", "c-peptide", "lh", "fsh", "amh",
    "urine test", "urinalysis", "urine culture", "urine routine",
    "protein in urine", "microalbumin", "ketones in urine",
    "abnormal", "normal range", "reference range", "elevated",
    "below normal", "within range", "out of range", "borderline",
    "critical value",
])

_URGENT_KW = frozenset([
    "heart attack", "cardiac arrest", "chest pain", "chest tightness",
    "chest pressure", "jaw pain",
    "stroke", "seizure", "convulsion", "fitting",
    "unconscious", "unresponsive", "passed out", "fainting", "fainted",
    "sudden confusion", "can't speak", "cannot speak", "slurred speech",
    "sudden vision loss", "face drooping",
    "can't breathe", "cannot breathe", "shortness of breath severe",
    "choking", "stopped breathing", "turning blue",
    "severe bleeding", "heavy bleeding", "uncontrolled bleeding",
    "coughing blood", "vomiting blood",
    "suicide", "suicidal", "self harm", "self-harm", "overdose",
    "poisoning", "want to die", "kill myself", "end my life",
    "harming myself",
    "anaphylaxis", "anaphylactic", "throat closing", "throat swelling",
    "emergency", "ambulance", "call 911", "call 999", "call 112",
])

# ── Health topic whitelist — massively expanded ───────────────────────────────

_HEALTH_KW = frozenset([
    # Body & anatomy
    "body", "blood", "heart", "lung", "lungs", "liver", "kidney", "kidneys",
    "brain", "bone", "bones", "muscle", "muscles", "skin", "eye", "eyes",
    "ear", "ears", "nose", "throat", "stomach", "bowel", "bowels",
    "intestine", "intestines", "colon", "rectum", "bladder", "uterus",
    "ovary", "ovaries", "prostate", "pancreas", "spleen", "gallbladder",
    "appendix", "spine", "spinal cord", "nerve", "nerves", "artery",
    "arteries", "vein", "veins", "thyroid", "adrenal", "pituitary",
    "tonsils", "trachea", "esophagus", "diaphragm", "lymph", "lymph node",
    "lymph nodes", "capillary", "plasma", "cell", "cells", "tissue",
    "organ", "organs", "gland", "glands",
    # Metabolism & nutrition science
    "metabolism", "metabolic", "metabolic rate", "basal metabolic rate",
    "bmr", "caloric", "calories", "calorie", "macronutrient", "macronutrients",
    "micronutrient", "micronutrients", "protein", "carbohydrate", "carbohydrates",
    "fat", "fats", "lipid", "lipids", "glucose", "glycogen", "glycolysis",
    "insulin resistance", "anabolism", "catabolism", "oxidation",
    "metabolise", "metabolize", "thermogenesis", "ketosis", "ketogenic",
    "energy balance", "energy expenditure", "nutrient", "nutrients",
    "nutrition", "nutritional", "absorption", "digestion", "digestive",
    "enzyme", "enzymes", "hormone", "hormones", "endocrine",
    "appetite", "satiety", "hunger", "cravings",
    # Pharmacology & medicines
    "antihistamine", "antihistamines", "histamine", "h1 blocker", "h2 blocker",
    "loratadine", "cetirizine", "fexofenadine", "diphenhydramine",
    "chlorphenamine", "promethazine", "benadryl", "zyrtec", "claritin",
    "antibiotic", "antibiotics", "antifungal", "antiviral", "antidepressant",
    "antihypertensive", "diuretic", "painkiller", "pain reliever",
    "analgesic", "anti-inflammatory", "nsaid", "nsaids", "corticosteroid",
    "corticosteroids", "steroid", "steroids", "bronchodilator",
    "anticoagulant", "blood thinner", "statin", "beta blocker",
    "ace inhibitor", "calcium channel blocker", "proton pump inhibitor",
    "ppi", "antacid", "laxative", "antiemetic", "antidiarrheal",
    "antipsychotic", "anxiolytic", "sedative", "hypnotic", "stimulant",
    "vasodilator", "vasoconstrictor", "immunosuppressant",
    "biologic", "biologics", "monoclonal antibody", "vaccine", "vaccination",
    "pharmacology", "pharmacokinetics", "pharmacodynamics",
    "drug", "drugs", "medicine", "medicines", "medication", "medications",
    "tablet", "tablets", "capsule", "capsules", "pill", "pills",
    "injection", "injections", "syrup", "inhaler", "patch", "ointment",
    "cream", "gel", "drops", "suppository",
    "dose", "dosage", "overdose", "prescription", "prescribed",
    "side effect", "side effects", "adverse effect", "interaction",
    "contraindication", "generic", "otc", "over the counter",
    "insulin", "metformin", "amlodipine", "lisinopril", "atorvastatin",
    "omeprazole", "pantoprazole", "azithromycin", "amoxicillin",
    "paracetamol", "ibuprofen", "aspirin", "levothyroxine",
    "prednisone", "prednisolone", "salbutamol", "fluticasone",
    "methotrexate", "hydroxychloroquine", "montelukast",
    # Conditions & diseases
    "disease", "disorder", "condition", "syndrome", "infection",
    "cancer", "carcinoma", "tumor", "tumour", "malignant", "benign",
    "diabetes", "diabetic", "type 1", "type 2", "pre-diabetes", "prediabetes",
    "hypertension", "high blood pressure", "low blood pressure", "hypotension",
    "blood pressure", "cholesterol", "hyperlipidemia", "dyslipidemia",
    "thyroid", "hypothyroid", "hyperthyroid", "hashimoto", "graves",
    "anemia", "anaemia", "iron deficiency", "thalassemia",
    "asthma", "copd", "bronchitis", "pneumonia", "tuberculosis", "tb",
    "allergy", "allergies", "allergic", "hay fever", "rhinitis", "sinusitis",
    "urticaria", "hives", "atopy", "atopic",
    "arthritis", "rheumatoid", "osteoarthritis", "gout", "lupus",
    "fibromyalgia", "osteoporosis", "spondylitis",
    "depression", "anxiety", "bipolar", "schizophrenia", "adhd", "autism",
    "ocd", "ptsd", "eating disorder", "anorexia", "bulimia",
    "fever", "flu", "influenza", "cold", "common cold",
    "covid", "covid-19", "coronavirus",
    "virus", "viral", "bacteria", "bacterial", "fungal", "parasite",
    "uti", "urinary tract infection", "kidney infection", "cystitis",
    "eczema", "psoriasis", "acne", "dermatitis", "rosacea",
    "migraine", "epilepsy", "parkinson", "alzheimer", "dementia",
    "multiple sclerosis", "neuropathy", "neuralgia",
    "hepatitis", "cirrhosis", "fatty liver", "nash", "nafld",
    "ibs", "irritable bowel", "crohn", "ulcerative colitis", "celiac",
    "acid reflux", "gerd", "peptic ulcer", "gastritis",
    "pcos", "endometriosis", "menopause", "menstruation", "period",
    "pregnancy", "pregnant", "miscarriage", "fertility", "infertility",
    "erectile dysfunction", "sexual health", "std", "sti",
    "hiv", "aids",
    "stroke", "heart disease", "coronary artery", "heart failure",
    "arrhythmia", "atrial fibrillation", "atherosclerosis",
    "deep vein thrombosis", "dvt", "pulmonary embolism",
    "obesity", "overweight", "underweight", "bmi",
    "malnutrition", "deficiency", "vitamin deficiency",
    # Symptoms
    "pain", "ache", "fever", "cough", "nausea", "vomit", "dizziness",
    "fatigue", "tired", "weak", "swelling", "bleeding", "rash", "itch",
    "headache", "migraine", "breathe", "breathing", "chest", "dizzy",
    "sore", "cramp", "tingling", "numbness", "tremor", "shaking",
    "jaundice", "pale", "inflammation", "inflammatory",
    # Tests & reports
    "lab", "test", "report", "result", "blood test", "scan", "mri",
    "x-ray", "xray", "ultrasound", "ecg", "ekg", "biopsy", "ct scan",
    "hemoglobin", "glucose", "creatinine", "bilirubin",
    "platelet", "wbc", "rbc", "hba1c", "cholesterol", "uric acid",
    "sgpt", "sgot", "alt", "ast", "tsh", "t3", "t4",
    "vitamin", "iron", "ferritin", "calcium", "sodium", "potassium",
    "troponin", "crp", "esr", "ldl", "hdl", "triglycerides",
    # Healthcare system
    "doctor", "physician", "specialist", "surgeon", "nurse", "pharmacist",
    "hospital", "clinic", "emergency room", "patient", "surgery",
    "treatment", "therapy", "physiotherapy", "chemotherapy", "radiotherapy",
    "diagnosis", "prognosis", "referral", "consultation",
    "health", "medical", "healthcare", "wellness", "wellbeing",
    # Lifestyle & preventive
    "diet", "nutrition", "calorie", "calories", "protein", "carbohydrate",
    "exercise", "workout", "fitness", "physical activity",
    "weight", "bmi", "obesity", "overweight", "underweight",
    "sleep", "insomnia", "sleep apnea", "circadian",
    "smoking", "quit smoking", "alcohol", "drinking", "addiction",
    "stress", "mental health", "mindfulness", "meditation",
    "checkup", "screening", "preventive", "prevention",
    "vaccine", "immunisation", "immunization", "immunity", "immune system",
    # Improve / boost / how-to health questions
    "improve", "boost", "increase", "decrease", "reduce", "manage",
    "how to", "what is", "what are", "how does", "why does", "what causes",
    "is it safe", "can i", "should i", "how can i",
    # Paediatric / geriatric
    "child health", "paediatric", "pediatric", "infant", "baby", "toddler",
    "growth", "developmental", "elderly", "geriatric", "old age", "aging",
    # Personal context
    "my report", "my test", "my results", "my prescription", "my medication",
    "my doctor", "my health", "my blood", "i feel", "i am feeling",
    "i have been", "my symptoms", "my condition", "my diagnosis",
    "my surgery", "my treatment", "my history",
])

OFF_TOPIC_RESPONSE = (
    "\U0001fa7a I'm **Dr. Aria**, your personal health assistant. "
    "I specialise in health-related topics — lab reports, prescriptions, "
    "symptoms, and general medical information.\n\n"
    "It looks like your question might be outside my area of expertise. "
    "Please ask me something health-related and I'll do my best to help! 😊"
)


# ── Classifier ────────────────────────────────────────────────────────────────

def _is_exact_match(query: str, keyword_set: frozenset) -> bool:
    """
    Check if the query IS one of the keywords (whole query match),
    or the query consists ONLY of greeting/farewell words (≤3 tokens).
    This prevents substrings like 'hi' in 'antihistamine' from triggering,
    and 'later' or 'take care' inside a health sentence from misfiring.
    """
    q = query.strip()
    # Direct exact match
    if q in keyword_set:
        return True
    # Check if every word token in the query is a greeting/farewell word
    # e.g. "hey there" → True, but "hey what is antihistamine" → False
    tokens = q.split()
    if len(tokens) <= 3 and all(t in keyword_set for t in tokens):
        return True
    return False


def is_health_related(query: str) -> bool:
    """Return True if query contains at least one health keyword."""
    q = query.lower()
    return any(k in q for k in _HEALTH_KW)


def classify_intent(query: str) -> str:
    """
    Classify query intent.

    Priority order:
      1. urgent       — emergencies always escalate first
      2. greeting     — ONLY if the query IS a greeting (whole-query match)
      3. farewell     — ONLY if the query IS a farewell (whole-query match)
      4. symptom      — personal symptom / feeling queries
      5. prescription — medicines & prescriptions
      6. lab          — lab reports & test results
      7. general      — anything else health-related
      8. off_topic    — genuinely unrelated to health

    KEY FIX: Greeting and farewell are now checked with whole-query matching,
    NOT substring matching. This prevents 'antihistamine' (contains 'hi'),
    'give me advice to improve my metabolism' (contains no farewell but
    previously some words slipped through), and similar misclassifications.
    """
    q = query.lower().strip()

    # 1. Urgent always wins
    if any(k in q for k in _URGENT_KW):
        return "urgent"

    # 2. Greeting — only if the WHOLE query is a greeting phrase
    if _is_exact_match(q, _GREETING_EXACT):
        return "greeting"

    # 3. Farewell — only if the WHOLE query is a farewell phrase
    if _is_exact_match(q, _FAREWELL_EXACT):
        return "farewell"

    # 4. Symptom keywords
    if any(k in q for k in _SYMPTOM_KW):
        return "symptom"

    # 5. Prescription / medicine keywords
    if any(k in q for k in _PRESCRIPTION_KW):
        return "prescription"

    # 6. Lab keywords
    if any(k in q for k in _LAB_KW):
        return "lab"

    # 7. General health — broad catch-all for any health topic
    if is_health_related(q):
        return "general"

    # 8. Truly off-topic
    return "off_topic"


def detect_urgent(query: str) -> bool:
    q = query.lower()
    return any(k in q for k in _URGENT_KW)


BIOGEARS_INSIGHTS_SYSTEM_PROMPT = """You are Dr. Aria, an AI health assistant specialising in physiological simulation analysis.

You have been given the results of a BioGears Digital Twin physiological simulation. Generate a clear, structured clinical narrative.

Your response MUST follow this exact structure:

## 🧬 Simulation Insights

### Overall Assessment
1–2 sentences summarising the overall physiological state from this simulation run.

### Vitals Analysis
For each vital sign provided, write one line:
- **Heart Rate:** [value] bpm — [brief clinical interpretation]
- **Blood Pressure:** [value] — [brief clinical interpretation]
- **SpO₂:** [value]% — [brief clinical interpretation]
- **Glucose:** [value] mg/dL — [brief clinical interpretation]
- *(include only vitals that were provided)*

### ⚠️ Anomalies Detected
*(Include this section only if anomalies are present)*
For each anomaly:
- **[Label]:** [value] — [what it means and why it matters in 1 sentence]

### 💡 Personalised Recommendations
• [Specific, actionable recommendation based on the simulation data]
• [Specific, actionable recommendation]
• [Specific, actionable recommendation]

### 🔮 What to Watch
1–2 sentences on what the user should monitor going forward based on these results.

> ⚕️ *These insights are based on a physiological simulation. Consult a doctor for medical decisions.*

Rules:
- Only reference values actually present in the simulation data. NEVER invent numbers.
- Be specific and data-driven — reference the actual values.
- Keep language warm, clear, and empowering — not alarming.
- Total response: 200–280 words.
""".strip()


BIOGEARS_QUERY_SYSTEM_PROMPT = """You are Dr. Aria, an AI health assistant answering questions about a patient's BioGears physiological simulation results.

The simulation data will be provided as context. Answer the user's specific question about their simulation results.

Rules:
- Ground every answer in the provided simulation data. NEVER invent values.
- If the question asks about a value not in the simulation data, say it was not measured in this run.
- Be specific — reference the actual numbers from the simulation.
- Keep answers concise: 80–150 words.
- Use friendly, empowering language.
- Never diagnose. Never prescribe. Always suggest consulting a doctor for medical decisions.
- If a value is abnormal, briefly explain why and what it might mean.

Format: Respond in clear prose. Use **bold** for key values or terms. End with a brief reassurance or next-step tip when appropriate.
""".strip()


def get_system_prompt(intent: str) -> str:
    return {
        "lab":               LAB_SYSTEM_PROMPT,
        "prescription":      PRESCRIPTION_SYSTEM_PROMPT,
        "symptom":           SYMPTOM_SYSTEM_PROMPT,
        "urgent":            SYMPTOM_SYSTEM_PROMPT,
        "general":           GENERAL_SYSTEM_PROMPT,
        "mental_health":     MENTAL_HEALTH_SYSTEM_PROMPT,
        "biogears_insights": BIOGEARS_INSIGHTS_SYSTEM_PROMPT,
        "biogears_query":    BIOGEARS_QUERY_SYSTEM_PROMPT,
    }.get(intent, MIXED_SYSTEM_PROMPT)


def get_max_tokens(intent: str) -> int:
    from health_ai.config.settings import (
        MAX_TOKENS_GENERAL, MAX_TOKENS_LAB,
        MAX_TOKENS_PRESCRIPTION, MAX_TOKENS_SYMPTOM,
    )
    return {
        "lab":          MAX_TOKENS_LAB,
        "prescription": MAX_TOKENS_PRESCRIPTION,
        "symptom":      MAX_TOKENS_SYMPTOM,
        "urgent":       MAX_TOKENS_SYMPTOM,
        "general":      MAX_TOKENS_GENERAL,
    }.get(intent, MAX_TOKENS_GENERAL)