"""
VitalHealth AI Quality Improvement Program — Reasoning Analyzer
Analyzes context assembly efficiency, prompt construction, and reasoning steps.
"""

from typing import Dict, Any, List

class ReasoningAnalyzer:
    """Analyzes execution logs of the multi-stage reasoning pipeline."""

    @staticmethod
    def analyze_reasoning_pipeline(
        user_query: str,
        retrieval_plan: Dict[str, Any],
        context_budget: Any,
        raw_llm_response: str,
        final_response: str
    ) -> Dict[str, Any]:
        analysis = {
            "query_length": len(user_query.split()),
            "subsystems_selected": len(retrieval_plan.get("selected_subsystems", [])),
            "tokens_budgeted": getattr(context_budget, "total_token_estimate", 0),
            "raw_output_words": len(raw_llm_response.split()),
            "final_output_words": len(final_response.split()),
            "contains_citation": "Health Brain Citation" in final_response or "Snapshot ID" in final_response,
            "has_markdown_headings": "###" in final_response,
            "reasoning_depth_indicators": [kw for kw in ["because", "mechanism", "guideline", "baseline", "target", "inhibitor", "risk"] if kw in final_response.lower()]
        }
        return analysis
