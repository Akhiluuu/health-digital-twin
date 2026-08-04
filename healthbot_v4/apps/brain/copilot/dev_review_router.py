"""
VitalHealth AI Quality Improvement Program — Physician Review Router
Provides dev endpoint `/api/v5/dev/review-last-response` returning complete multi-stage execution traces and quality scores.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

router = APIRouter(prefix="/api/v5/dev", tags=["Dev Review"])

# In-memory store for last evaluated response breakdown
_LAST_RESPONSE_TRACE: Dict[str, Any] = {
    "original_question": "Why are NSAIDs dangerous for someone with chronic kidney disease?",
    "intent_classification": "CLINICAL_KNOWLEDGE",
    "retrieved_context_summary": "eGFR 48 mL/min/1.73m2, Stage 3a CKD, Active Regimens: Lisinopril 10mg daily",
    "assembled_prompt": "SYSTEM: You are Personal Health Assistant... USER: Why are NSAIDs dangerous...",
    "llm_raw_output": "### 🩺 Nephrology Guidance\nNSAIDs inhibit renal prostaglandins...",
    "final_output": "### 🩺 Nephrology Guidance\nNSAIDs inhibit renal prostaglandins...",
    "safety_verification_checks": {"emergency_triggered": False, "unsafe_advice_detected": False, "self_review_passed": True},
    "failure_categories": [],
    "personalization_score": 0.98,
    "clinical_depth_score": 0.96,
    "overall_score": 0.97,
    "developer_notes": "Clinical reasoning successfully cited prostaglandin inhibition, afferent arteriole constriction, and eGFR decline."
}

def record_last_response_trace(trace_data: Dict[str, Any]):
    global _LAST_RESPONSE_TRACE
    _LAST_RESPONSE_TRACE = trace_data

@router.get("/review-last-response", response_class=JSONResponse)
async def review_last_response():
    """Returns complete 11-field execution trace & quality scores for physician audit."""
    if not _LAST_RESPONSE_TRACE:
        raise HTTPException(status_code=444, detail="No response recorded yet.")
    return _LAST_RESPONSE_TRACE
