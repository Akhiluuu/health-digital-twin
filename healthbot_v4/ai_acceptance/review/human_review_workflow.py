"""
VitalHealth AI Acceptance Testing Platform — Human Review Workflow
Generates human clinical review queues and records expert clinical reviewer ratings.
"""

import json
import os
import time
from typing import List, Dict, Any

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REVIEW_QUEUE_PATH = os.path.join(BASE_DIR, "review_queue.json")
REVIEW_FEEDBACK_PATH = os.path.join(BASE_DIR, "reviewer_feedback.json")

class HumanReviewWorkflow:
    """Manages clinical expert review workflow and review item generation."""

    def __init__(self):
        os.makedirs(os.path.dirname(REVIEW_QUEUE_PATH), exist_ok=True)

    def enqueue_for_review(
        self,
        scenario_id: str,
        persona: Dict[str, Any],
        user_query: str,
        expected_behavior: List[str],
        actual_response: str,
        system_prompt: str,
        context_used: str,
        model_reasoning: str
    ):
        queue = self._load_queue()
        item = {
            "review_id": f"rev_{scenario_id}_{int(time.time())}",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "scenario_id": scenario_id,
            "persona_name": persona.get("name", "Unknown"),
            "persona_category": persona.get("category", "General"),
            "user_query": user_query,
            "expected_behavior": expected_behavior,
            "actual_response": actual_response,
            "system_prompt": system_prompt,
            "context_used": context_used,
            "model_reasoning": model_reasoning,
            "status": "pending_review"
        }
        queue.append(item)
        with open(REVIEW_QUEUE_PATH, "w") as f:
            json.dump(queue, f, indent=2)

    def submit_rating(self, review_id: str, reviewer_name: str, rating: str, comments: str):
        """Ratings: Excellent, Good, Acceptable, Poor, Unsafe"""
        assert rating in ["Excellent", "Good", "Acceptable", "Poor", "Unsafe"], "Invalid rating"
        feedback = self._load_feedback()
        feedback.append({
            "review_id": review_id,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "reviewer": reviewer_name,
            "rating": rating,
            "comments": comments
        })
        with open(REVIEW_FEEDBACK_PATH, "w") as f:
            json.dump(feedback, f, indent=2)

        # Update status in queue
        queue = self._load_queue()
        for item in queue:
            if item["review_id"] == review_id:
                item["status"] = f"reviewed ({rating})"
        with open(REVIEW_QUEUE_PATH, "w") as f:
            json.dump(queue, f, indent=2)

    def _load_queue(self) -> List[Dict[str, Any]]:
        if os.path.exists(REVIEW_QUEUE_PATH):
            try:
                with open(REVIEW_QUEUE_PATH, "r") as f:
                    return json.load(f)
            except Exception:
                return []
        return []

    def _load_feedback(self) -> List[Dict[str, Any]]:
        if os.path.exists(REVIEW_FEEDBACK_PATH):
            try:
                with open(REVIEW_FEEDBACK_PATH, "r") as f:
                    return json.load(f)
            except Exception:
                return []
        return []
