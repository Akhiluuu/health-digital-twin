"""
medication_service/services/biogears_sync_service.py
Triggers BioGears simulation on every logged dose and stores the physiological response.
"""
from __future__ import annotations
import logging
import os
import httpx
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from uuid import UUID, uuid4

from medication_service.database.connection import get_conn, get_transaction

logger = logging.getLogger(__name__)

BIOGEARS_BASE = os.environ.get("SERVER_BASE_URL", "http://localhost:8000")
BIOGEARS_API_KEY = os.environ.get("DIGITAL_TWIN_API_KEY", "")

# Substance name mapping: generic drug name → BioGears substance name
DRUG_TO_SUBSTANCE: Dict[str, str] = {
    "metformin": "Metformin",
    "aspirin": "Aspirin",
    "insulin": "Insulin",
    "epinephrine": "Epinephrine",
    "morphine": "Morphine",
    "rocuronium": "Rocuronium",
    "ketamine": "Ketamine",
    "midazolam": "Midazolam",
    "fentanyl": "Fentanyl",
    "propofol": "Propofol",
    "adenosine": "Adenosine",
    "sodium bicarbonate": "SodiumBicarbonate",
}


def resolve_substance(drug_name: str) -> Optional[str]:
    lower = drug_name.lower().strip()
    return DRUG_TO_SUBSTANCE.get(lower) or next(
        (v for k, v in DRUG_TO_SUBSTANCE.items() if k in lower), None
    )


class BiogearsSyncService:
    @staticmethod
    async def trigger_dose_simulation(
        user_id: str,
        medicine_id: UUID,
        dose_id: UUID,
        medicine_name: str,
        dose_quantity: str,
        pre_vitals: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Dispatch a BioGears substance simulation for a logged dose. Returns sim record ID."""
        substance = resolve_substance(medicine_name)
        if not substance:
            logger.info(f"No BioGears substance mapping for '{medicine_name}', skipping simulation")
            return ""

        # Parse numeric dose value
        try:
            value = float("".join(c for c in dose_quantity if c.isdigit() or c == ".") or "1")
        except Exception:
            value = 1.0

        sim_id = uuid4()
        async with get_transaction() as conn:
            await conn.execute(
                """INSERT INTO biogears_medication_simulations
                (id, user_id, medicine_id, dose_id, substance_name, dose_value, dose_unit,
                vitals_pre, status, started_at)
                VALUES ($1,$2,$3,$4,$5,$6,'mg',$7,'queued',$8)""",
                sim_id, user_id, medicine_id, dose_id,
                substance, value,
                __import__("json").dumps(pre_vitals or {}),
                datetime.now(timezone.utc),
            )

        # Dispatch async to BioGears
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{BIOGEARS_BASE}/simulate/async",
                    json={
                        "user_id": user_id,
                        "events": [{
                            "event_type": "substance",
                            "substance_name": substance,
                            "value": value,
                            "unit": "mg",
                            "timestamp": datetime.now(timezone.utc).timestamp(),
                            "notes": f"Medication dose: {medicine_name}",
                        }]
                    },
                    headers={"X-API-Key": BIOGEARS_API_KEY, "Content-Type": "application/json"},
                )
                if resp.status_code == 200:
                    job_data = resp.json()
                    job_id = job_data.get("job_id", "")
                    async with get_conn() as conn:
                        await conn.execute(
                            "UPDATE biogears_medication_simulations SET biogears_job_id=$2, status='running' WHERE id=$1",
                            sim_id, job_id,
                        )
                    logger.info(f"BioGears job dispatched: {job_id} for dose {dose_id}")
                else:
                    logger.warning(f"BioGears dispatch failed: {resp.status_code} — {resp.text[:200]}")
                    async with get_conn() as conn:
                        await conn.execute(
                            "UPDATE biogears_medication_simulations SET status='failed', error_message=$2 WHERE id=$1",
                            sim_id, f"HTTP {resp.status_code}",
                        )
        except Exception as e:
            logger.error(f"BioGears HTTP error: {e}")
            async with get_conn() as conn:
                await conn.execute(
                    "UPDATE biogears_medication_simulations SET status='failed', error_message=$2 WHERE id=$1",
                    sim_id, str(e),
                )

        return str(sim_id)

    @staticmethod
    async def store_simulation_result(sim_id: UUID, job_result: Dict) -> None:
        vitals_post = job_result.get("vitals", {})
        async with get_conn() as conn:
            await conn.execute(
                """UPDATE biogears_medication_simulations
                SET vitals_post=$2, status='completed', completed_at=$3
                WHERE id=$1""",
                sim_id, __import__("json").dumps(vitals_post), datetime.now(timezone.utc),
            )

    @staticmethod
    async def get_simulations_for_user(user_id: str, limit: int = 20) -> list:
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT s.*, m.name as medicine_name FROM biogears_medication_simulations s
                LEFT JOIN medicines m ON m.id = s.medicine_id
                WHERE s.user_id=$1 ORDER BY s.created_at DESC LIMIT $2""",
                user_id, limit,
            )
        return [dict(r) for r in rows]
