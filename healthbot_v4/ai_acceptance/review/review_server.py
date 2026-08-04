"""
VitalHealth AI Acceptance Testing Platform — Visual Dashboard & Human Review Server
FastAPI Web Application serving interactive reports and clinical expert review UI.
"""

import json
import os
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any

from healthbot_v4.ai_acceptance.review.human_review_workflow import HumanReviewWorkflow, REVIEW_QUEUE_PATH, REVIEW_FEEDBACK_PATH

app = FastAPI(
    title="VitalHealth AI Acceptance Dashboard & Review Portal",
    description="Interactive visual dashboard and clinical expert review portal.",
    version="5.0.0"
)

workflow = HumanReviewWorkflow()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPORTS_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "reports"))

class RatingSubmission(BaseModel):
    review_id: str
    reviewer: str
    rating: str  # Excellent, Good, Acceptable, Poor, Unsafe
    comments: str

@app.get("/acceptance/dashboard", response_class=HTMLResponse)
async def get_visual_dashboard():
    """Serves the main interactive visual HTML dashboard."""
    html_file = os.path.join(REPORTS_PATH, "AI_ACCEPTANCE_REPORT.html")
    if not os.path.exists(html_file):
        raise HTTPException(status_code=404, detail="AI Acceptance Report HTML not generated yet.")
    with open(html_file, "r") as f:
        return f.read()

@app.get("/acceptance/metrics", response_class=JSONResponse)
async def get_metrics_json():
    """Returns machine-readable acceptance score JSON metrics."""
    json_file = os.path.join(REPORTS_PATH, "AI_ACCEPTANCE_REPORT.json")
    if not os.path.exists(json_file):
        raise HTTPException(status_code=404, detail="AI Acceptance Report JSON not found.")
    with open(json_file, "r") as f:
        return json.load(f)

@app.get("/acceptance/review/queue", response_class=JSONResponse)
async def get_review_queue():
    """Returns all items in the clinical review queue."""
    if os.path.exists(REVIEW_QUEUE_PATH):
        with open(REVIEW_QUEUE_PATH, "r") as f:
            return json.load(f)
    return []

@app.get("/acceptance/review/ui", response_class=HTMLResponse)
async def get_review_ui():
    """Serves the dark-mode interactive Human Clinical Review Portal UI."""
    queue = []
    if os.path.exists(REVIEW_QUEUE_PATH):
        with open(REVIEW_QUEUE_PATH, "r") as f:
            queue = json.load(f)

    pending_items = [q for q in queue if q.get("status") == "pending_review"]

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>VitalHealth Clinical Expert Review Portal</title>
    <style>
        body {{ font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 30px; }}
        .header {{ background: #1e293b; padding: 25px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 25px; }}
        .card {{ background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 20px; }}
        .query {{ font-size: 1.1em; color: #38bdf8; font-weight: bold; margin-bottom: 10px; }}
        .response-box {{ background: #0f172a; padding: 15px; border-radius: 8px; border: 1px solid #334155; font-family: monospace; white-space: pre-wrap; margin-bottom: 15px; }}
        .btn {{ padding: 8px 16px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; margin-right: 8px; }}
        .btn-excellent {{ background: #059669; color: white; }}
        .btn-good {{ background: #0284c7; color: white; }}
        .btn-acceptable {{ background: #d97706; color: white; }}
        .btn-poor {{ background: #ea580c; color: white; }}
        .btn-unsafe {{ background: #dc2626; color: white; }}
        textarea {{ width: 100%; height: 60px; background: #0f172a; border: 1px solid #334155; color: white; border-radius: 6px; padding: 8px; margin-bottom: 10px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🩺 VitalHealth Human Clinical Review Portal</h1>
        <p>Pending Clinical Cases Needing Expert MD / Pharmacist Verification: <strong>{len(pending_items)}</strong></p>
    </div>
"""
    if not pending_items:
        html += "<div class='card'><h3>🟢 No pending clinical reviews in queue! All evaluated responses pass safety and accuracy SLAs.</h3></div>"
    else:
        for item in pending_items:
            html += f"""
    <div class="card" id="card_{item['review_id']}">
        <div class="query">Scenario: {item['scenario_id']} | Persona: {item['persona_name']} ({item['persona_category']})</div>
        <p><strong>Patient Query:</strong> <em>"{item['user_query']}"</em></p>
        <p><strong>Expected Behavior:</strong> {', '.join(item['expected_behavior'])}</p>
        <div><strong>AI Physician Response:</strong></div>
        <div class="response-box">{item['actual_response']}</div>
        
        <textarea id="comments_{item['review_id']}" placeholder="Enter clinical expert review comments..."></textarea>
        <div>
            <button class="btn btn-excellent" onclick="submitRating('{item['review_id']}', 'Excellent')">Excellent</button>
            <button class="btn btn-good" onclick="submitRating('{item['review_id']}', 'Good')">Good</button>
            <button class="btn btn-acceptable" onclick="submitRating('{item['review_id']}', 'Acceptable')">Acceptable</button>
            <button class="btn btn-poor" onclick="submitRating('{item['review_id']}', 'Poor')">Poor</button>
            <button class="btn btn-unsafe" onclick="submitRating('{item['review_id']}', 'Unsafe')">Unsafe</button>
        </div>
    </div>
"""

    html += """
    <script>
        async function submitRating(reviewId, rating) {
            const comments = document.getElementById('comments_' + reviewId).value;
            const res = await fetch('/acceptance/review/submit', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    review_id: reviewId,
                    reviewer: 'Dr. Expert Reviewer',
                    rating: rating,
                    comments: comments
                })
            });
            if (res.ok) {
                alert('Review submitted successfully!');
                document.getElementById('card_' + reviewId).remove();
            } else {
                alert('Failed to submit review.');
            }
        }
    </script>
</body>
</html>
"""
    return html

@app.post("/acceptance/review/submit", response_class=JSONResponse)
async def submit_review_rating(payload: RatingSubmission):
    """Submits expert reviewer rating into reviewer_feedback.json."""
    try:
        workflow.submit_rating(
            review_id=payload.review_id,
            reviewer_name=payload.reviewer,
            rating=payload.rating,
            comments=payload.comments
        )
        return {"status": "success", "message": f"Rating {payload.rating} recorded."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
