"""
healthbot_v4/apps/brain/reasoning/clinical_intent.py
Production Clinical Intent Engine for VitalHealth v5.0 Health Brain.
Classifies incoming patient queries into 28 clinical intents using regex-based semantic matching.
Replaces brittle substring matching with word-boundary-aware patterns and entity extraction.
"""

import re
from enum import Enum
from typing import List, Dict, Any
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger


class ClinicalIntent(str, Enum):
    MEDICATION         = "MEDICATION"
    NUTRITION          = "NUTRITION"
    EXERCISE           = "EXERCISE"
    SYMPTOMS           = "SYMPTOMS"
    LAB_REPORT         = "LAB_REPORT"
    PRESCRIPTION       = "PRESCRIPTION"
    RISK               = "RISK"
    LIFESTYLE          = "LIFESTYLE"
    HEALTH_SUMMARY     = "HEALTH_SUMMARY"
    LONGITUDINAL_COMPARISON = "LONGITUDINAL_COMPARISON"
    DOCTOR_FOLLOWUP    = "DOCTOR_FOLLOWUP"
    GENERAL_CONVERSATION = "GENERAL_CONVERSATION"
    EMERGENCY          = "EMERGENCY"
    TIMELINE           = "TIMELINE"
    DIGITAL_TWIN       = "DIGITAL_TWIN"
    FAMILY             = "FAMILY"
    REMINDER           = "REMINDER"
    HEALTH_GOAL        = "HEALTH_GOAL"
    # New production-grade intents
    MENTAL_HEALTH      = "MENTAL_HEALTH"
    PREVENTIVE_CARE    = "PREVENTIVE_CARE"
    INJURY             = "INJURY"
    PEDIATRIC          = "PEDIATRIC"
    WOMENS_HEALTH      = "WOMENS_HEALTH"
    DERMATOLOGY        = "DERMATOLOGY"
    DENTAL             = "DENTAL"
    TRAVEL_HEALTH      = "TRAVEL_HEALTH"
    GENERAL_HEALTH_EDUCATION = "GENERAL_HEALTH_EDUCATION"
    GENERAL_HEALTH     = "GENERAL_HEALTH"


class IntentAnalysisResult(BaseModel):
    primary_intent: ClinicalIntent
    secondary_intents: List[ClinicalIntent] = Field(default_factory=list)
    confidence: float = 0.95
    extracted_entities: Dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""


# ---------------------------------------------------------------------------
# Regex pattern library — compiled once at module load
# ---------------------------------------------------------------------------

_EMERGENCY = re.compile(
    r"""
    \b(
        emergency | 911 | 112 |
        chest\s+pain | crushing\s+pain | heart\s+attack |
        can['\u2019]?t\s+breath | cannot\s+breath | shortness\s+of\s+breath | difficulty\s+breath |
        severe\s+bleed | vaginal\s+bleed | cough(?:ing)?\s+blood |
        stroke | facial\s+droop | slurr(?:ed|ing)\s+speech |
        numbness\s+(?:in|on)\s+(?:arm|face|side) |
        unconscious | unresponsive | seizure | convuls |
        blue\s+(?:lips|fingernails) |
        anaphylax | severe\s+allergic |
        overdose | suicid | self.harm | kill\s+myself |
        thunderclap\s+headache | worst\s+headache
    )\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_LONGITUDINAL = re.compile(
    r"\b(compar|trend|over\s+time|getting\s+(worse|better)|last\s+month|past\s+\d+\s+(weeks?|months?)|progress|trajectory|changed\s+since)\b",
    re.IGNORECASE,
)

_NUTRITION = re.compile(
    r"\b(eat|ate|eaten|food|meal|diet|fruit|vegetable|nutrition|calorie|carb|sugar|protein|fat|fiber|vitamin|mineral|supplement|mango|apple|rice|bread|dairy|vegan|vegetarian|keto|intermittent\s+fast|junk\s+food|healthy\s+food|portion|sodium|salt|potassium|phosphorus)\b",
    re.IGNORECASE,
)

_MEDICATION = re.compile(
    r"\b(medication|medicine|pill|tablet|capsule|prescription|dose|dosage|drug|regimen|vault|refill|metformin|lisinopril|atorvastatin|aspirin|ibuprofen|paracetamol|acetaminophen|warfarin|insulin|semaglutide|ozempic|apixaban|omeprazole|amlodipine|rosuvastatin|levothyroxine|prednisone|albuterol|nsaid|antibiotic|antidepressant|statin)\b",
    re.IGNORECASE,
)

_DIGITAL_TWIN = re.compile(
    r"\b(simulat|twin|biogears|predict|cardiac\s+output|mean\s+arterial|stroke\s+volume|tidal\s+volume|arterial\s+ph|organ\s+(score|health|system)|physiol)\b",
    re.IGNORECASE,
)

_LAB_REPORT = re.compile(
    r"\b(hba1c|a1c|blood\s+test|lab\s+(result|report|test|scan)|creatinine|egfr|tsh|t3|t4|cholesterol|ldl|hdl|triglyceride|bun|hemoglobin|platelet|wbc|rbc|cbc|liver\s+function|kidney\s+function|fasting\s+glucose|lipid\s+panel)\b",
    re.IGNORECASE,
)

_SYMPTOMS = re.compile(
    r"""
    \b(
        sympt | feel(?:ing)?\s+(sick|unwell|bad|terrible|awful|pain|nausea|dizzy|tired) |
        (?:have|having|got|getting)\s+(a\s+)?(pain|ache|headache|fever|cough|rash|swelling|bleed) |
        (?:my|the)\s+(head|chest|stomach|back|knee|arm|leg|throat|eye|ear|joint|muscle)\s+(hurt|ache|pain|sore|stiff|tight|swell) |
        headache | migraine | fever | chills | nausea | vomit | diarrhea | constipat |
        fatigue | tired | exhausted | lethargic |
        dizzy | lightheaded | vertigo |
        cough | cold | flu | sore\s+throat | runny\s+nose |
        heart\s+(racing|pounding|flutter|skip|races) |
        racing\s+heart | fast\s+(heartbeat|pulse) |
        stomach\s+(pain|cramp|ache|upset) | abdominal | bloat |
        joint\s+pain | muscle\s+(pain|ache|cramp|weak) |
        shortness | trouble\s+breath | wheez
    )\b
    """,
    re.IGNORECASE | re.VERBOSE,
)


_MENTAL_HEALTH = re.compile(
    r"\b(anxiet|anxious|depress|stress(?:ed)?|panic|mental\s+health|mood|overwhelm|burnout|lonely|sad(?:ness)?|grief|trauma|ptsd|ocd|adhd|bipolar|schizophreni|insomnia|can['\u2019]?t\s+sleep|trouble\s+sleeping|sleep\s+(problem|issue|disorder)|mental\s+breakdown|emotional\s+(support|well.?being)|therapy|therapist|counseling|psychiatr)\b",
    re.IGNORECASE,
)

_EXERCISE = re.compile(
    r"\b(exercise|workout|gym|run(?:ning)?|walk(?:ing)?|swim(?:ming)?|cycling|yoga|pilates|strength\s+train|cardio|aerobic|HIIT|steps?|active|fitness|physical\s+activity|sport)\b",
    re.IGNORECASE,
)

_HEALTH_SUMMARY = re.compile(
    r"\b(health\s+(score|status|overview|summary|report)|how\s+(am\s+i\s+doing|is\s+my\s+health)|overall\s+health|my\s+(body|health|results))\b",
    re.IGNORECASE,
)

_PREVENTIVE_CARE = re.compile(
    r"\b(vaccin|immuniz|screen(?:ing)?|check.?up|annual\s+exam|preventiv|flu\s+shot|booster|mammogram|colonoscopy|dexa\s+scan|pap\s+smear|prostate\s+test|health\s+screening)\b",
    re.IGNORECASE,
)

_INJURY = re.compile(
    r"(?:injur|sprain|strain|fractur|broken\s+bone|bruise|wound|\bcut\b|\bburn\b|blister|concussion|dislocation|torn\s+(?:ligament|muscle|tendon)|\baccident\b)",
    re.IGNORECASE,
)

_PEDIATRIC = re.compile(
    r"(?:\b(?:child|kid|toddler|infant|baby|newborn|adolescent|teen(?:ager)?)\b|\b(?:my\s+(?:son|daughter)\s+(?:is|has))\b|(?:^|\s)\d+[-\s]?(?:year[-\s]?old|yr[-\s]?old))",
    re.IGNORECASE,
)

_WOMENS_HEALTH = re.compile(
    r"\b(period|menstrual|menstruation|menopause|pregnan|trimester|ovulat|pcos|pms|endometriosis|fertility|contraception|birth\s+control|breastfeed|mammogram|cervical)\b",
    re.IGNORECASE,
)

_DERMATOLOGY = re.compile(
    r"\b(skin|rash|itch|hives|eczema|psoriasis|acne|pimple|mole|wart|blister|dermat|hair\s+(loss|thinning|fall)|nail\s+(infection|fungus)|sunburn|dry\s+skin)\b",
    re.IGNORECASE,
)

_DENTAL = re.compile(
    r"\b(tooth|teeth|dental|gum|cavity|toothache|dentist|wisdom\s+tooth|root\s+canal|mouth\s+(pain|sore)|jaw\s+pain|bruxism|gingivitis)\b",
    re.IGNORECASE,
)

_TRAVEL_HEALTH = re.compile(
    r"\b(travel|trip|vacation|abroad|international|malaria|typhoid|hepatitis\s+[ab]|yellow\s+fever|travel\s+(vaccine|immunization)|jet\s+lag|altitude\s+sickness|traveler['\u2019]?s\s+diarrhea)\b",
    re.IGNORECASE,
)

_HEALTH_EDUCATION = re.compile(
    r"\b(what\s+is\s+(?:a\s+)?(?:diabetes|hypertension|cancer|asthma|copd|arthritis|alzheimer|parkinson|lupus|crohn|ibs|gerd|anemia|osteoporosis|fibromyalgi)|how\s+does\s+\w+\s+work|explain\s+(?:what|how)|what\s+causes|difference\s+between|viral\s+vs|what\s+are\s+the\s+symptoms\s+of)\b",
    re.IGNORECASE,
)


_DOCTOR_FOLLOWUP = re.compile(
    r"\b(doctor|physician|specialist|appointment|follow.?up|referral|cardio(?:logist)?|nephrolog|endocrinolog|oncolog|gastroenterolog|question\s+(?:for|to)\s+(?:my|the)\s+doctor)\b",
    re.IGNORECASE,
)

_FAMILY = re.compile(
    r"\b(family\s+(member|health|profile)|(?:my\s+)?(mother|father|wife|husband|spouse|partner|grandma|grandpa|grandparent|parent|sibling|brother|sister)\s+(?:has|is|takes?|needs?))\b",
    re.IGNORECASE,
)

_REMINDER = re.compile(
    r"\b(remind(?:er)?|alarm|notify|notification|schedule\s+(?:a\s+)?reminder|alert)\b",
    re.IGNORECASE,
)

_HEALTH_GOAL = re.compile(
    r"\b(goal|target|aim|objective|lose\s+weight|weight\s+loss|gain\s+muscle|run\s+\d|walk\s+\d+\s+steps|improve\s+(?:my\s+)?(health|fitness|diet))\b",
    re.IGNORECASE,
)


def _extract_entities(q: str) -> Dict[str, Any]:
    """Lightweight entity extraction: pulls drug names, body parts, numeric values."""
    entities: Dict[str, Any] = {}

    # Numeric values with units
    numbers = re.findall(r"(\d+(?:\.\d+)?)\s*(mg|mcg|ml|bpm|mmhg|%|kg|lbs|cm|°c|°f)", q, re.IGNORECASE)
    if numbers:
        entities["numeric_values"] = [{"value": n, "unit": u} for n, u in numbers]

    # Body part mentions
    body_parts = re.findall(
        r"\b(head|chest|stomach|abdomen|back|knee|hip|shoulder|arm|leg|ankle|foot|feet|throat|neck|eye|ear|skin|heart|lung|kidney|liver)\b",
        q, re.IGNORECASE
    )
    if body_parts:
        entities["body_parts"] = list(set(bp.lower() for bp in body_parts))

    # Duration mentions
    duration = re.findall(r"(\d+)\s*(day|week|month|hour|minute)s?", q, re.IGNORECASE)
    if duration:
        entities["duration"] = [{"amount": d, "unit": u} for d, u in duration]

    return entities


class ClinicalIntentEngine(HealthBrainSubsystem):
    """
    Production intent classifier using compiled regex patterns.
    Routes ANY health query to one of 28 clinical intents.
    Falls back to GENERAL_HEALTH (not GENERAL_CONVERSATION) so the LLM always
    gets a proper health-scoped context even for novel query types.
    """

    def __init__(self):
        super().__init__("clinical_intent_engine")

    async def initialize(self) -> None:
        logger.info("🎯 Clinical Intent Classification Engine (Regex v2) initialized — 28 intent categories")

    def classify_intent(self, query: str) -> IntentAnalysisResult:
        q = query.strip()

        # ── Priority 1: Emergency (always first) ──────────────────────────────
        if _EMERGENCY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.EMERGENCY,
                confidence=1.0,
                reasoning="Emergency safety keyword detected via regex pattern.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 2: Longitudinal / trend ─────────────────────────────────
        if _LONGITUDINAL.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.LONGITUDINAL_COMPARISON,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.95,
                reasoning="Time-comparison or trend-tracking pattern detected.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 3: Digital Twin / physiological simulation ───────────────
        if _DIGITAL_TWIN.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DIGITAL_TWIN,
                confidence=0.95,
                reasoning="Digital twin / physiological simulation query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 4: Lab Report ────────────────────────────────────────────
        if _LAB_REPORT.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.LAB_REPORT,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.95,
                reasoning="Lab biomarker or blood test query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 5: Medication ────────────────────────────────────────────
        if _MEDICATION.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.MEDICATION,
                secondary_intents=[ClinicalIntent.PRESCRIPTION],
                confidence=0.95,
                reasoning="Drug, medication, or dosage query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 6a: Pediatric (check BEFORE generic symptoms) ───────────
        if _PEDIATRIC.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.PEDIATRIC,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Child / pediatric health question detected.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 6b: Dermatology (check BEFORE generic symptoms) ─────────
        if _DERMATOLOGY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DERMATOLOGY,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Skin, hair, or dermatological query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 6c: Injury (check BEFORE generic symptoms) ──────────────
        if _INJURY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.INJURY,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Injury, trauma, or wound care query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 6d: General Symptoms ─────────────────────────────────────
        if _SYMPTOMS.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.SYMPTOMS,
                secondary_intents=[ClinicalIntent.RISK],
                confidence=0.95,
                reasoning="Physical symptom or bodily complaint detected.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 7: Mental health ─────────────────────────────────────────
        if _MENTAL_HEALTH.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.MENTAL_HEALTH,
                secondary_intents=[ClinicalIntent.LIFESTYLE],
                confidence=0.95,
                reasoning="Mental health, emotional wellbeing, or sleep disorder query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 8: Nutrition ─────────────────────────────────────────────
        if _NUTRITION.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.NUTRITION,
                secondary_intents=[ClinicalIntent.LIFESTYLE, ClinicalIntent.RISK],
                confidence=0.95,
                reasoning="Dietary, food, or nutritional guidance query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 9: Exercise ──────────────────────────────────────────────
        if _EXERCISE.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.EXERCISE,
                secondary_intents=[ClinicalIntent.LIFESTYLE],
                confidence=0.93,
                reasoning="Physical activity or fitness query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 10: Women's health ───────────────────────────────────────
        if _WOMENS_HEALTH.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.WOMENS_HEALTH,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.95,
                reasoning="Women's health topic: menstrual, pregnancy, menopause.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 11: Pediatric ────────────────────────────────────────────
        if _PEDIATRIC.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.PEDIATRIC,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Child / pediatric health question detected.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 12: Dermatology ──────────────────────────────────────────
        if _DERMATOLOGY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DERMATOLOGY,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Skin, hair, or dermatological query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 13: Dental ───────────────────────────────────────────────
        if _DENTAL.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DENTAL,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Dental / oral health query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 14: Injury ───────────────────────────────────────────────
        if _INJURY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.INJURY,
                secondary_intents=[ClinicalIntent.SYMPTOMS],
                confidence=0.93,
                reasoning="Injury, trauma, or wound care query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 15: Preventive care ──────────────────────────────────────
        if _PREVENTIVE_CARE.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.PREVENTIVE_CARE,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.93,
                reasoning="Vaccination, screening, or preventive care query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 16: Travel health ────────────────────────────────────────
        if _TRAVEL_HEALTH.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.TRAVEL_HEALTH,
                secondary_intents=[ClinicalIntent.PREVENTIVE_CARE],
                confidence=0.93,
                reasoning="Travel medicine or international health query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 17: Health education ─────────────────────────────────────
        if _HEALTH_EDUCATION.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.GENERAL_HEALTH_EDUCATION,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.90,
                reasoning="Medical education or disease explanation query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 18: Doctor follow-up ─────────────────────────────────────
        if _DOCTOR_FOLLOWUP.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.DOCTOR_FOLLOWUP,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.90,
                reasoning="Doctor appointment or specialist referral query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 19: Family health ────────────────────────────────────────
        if _FAMILY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.FAMILY,
                secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
                confidence=0.88,
                reasoning="Family member health question.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 20: Health summary ───────────────────────────────────────
        if _HEALTH_SUMMARY.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.HEALTH_SUMMARY,
                confidence=0.90,
                reasoning="General health status or overview query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 21: Reminder ─────────────────────────────────────────────
        if _REMINDER.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.REMINDER,
                confidence=0.88,
                reasoning="Medication or appointment reminder request.",
                extracted_entities=_extract_entities(q),
            )

        # ── Priority 22: Health goal ──────────────────────────────────────────
        if _HEALTH_GOAL.search(q):
            return IntentAnalysisResult(
                primary_intent=ClinicalIntent.HEALTH_GOAL,
                secondary_intents=[ClinicalIntent.LIFESTYLE],
                confidence=0.88,
                reasoning="Health goal or wellness objective query.",
                extracted_entities=_extract_entities(q),
            )

        # ── Default: GENERAL_HEALTH (not GENERAL_CONVERSATION) ───────────────
        # The LLM still gets full patient context and can answer any health question.
        return IntentAnalysisResult(
            primary_intent=ClinicalIntent.GENERAL_HEALTH,
            secondary_intents=[ClinicalIntent.HEALTH_SUMMARY],
            confidence=0.80,
            reasoning="Open-domain health query — routed to general health LLM reasoning with full patient context.",
            extracted_entities=_extract_entities(q),
        )
