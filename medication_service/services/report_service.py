"""
medication_service/services/report_service.py
Generates PDF, CSV, FHIR R4 JSON, and HL7 v2 medication reports.
"""
from __future__ import annotations
import csv
import io
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from medication_service.database.connection import get_conn

logger = logging.getLogger(__name__)


class ReportService:
    @staticmethod
    async def _fetch_report_data(user_id: str, start: date, end: date) -> Dict[str, Any]:
        async with get_conn() as conn:
            meds = await conn.fetch(
                "SELECT * FROM medicines WHERE user_id=$1 AND deleted_at IS NULL", user_id
            )
            history = await conn.fetch(
                "SELECT * FROM medication_history WHERE user_id=$1 AND event_at::date BETWEEN $2 AND $3 ORDER BY event_at DESC",
                user_id, start, end,
            )
            compliance = await conn.fetch(
                "SELECT * FROM compliance_logs WHERE user_id=$1 AND log_date BETWEEN $2 AND $3 ORDER BY log_date",
                user_id, start, end,
            )
            inventory = await conn.fetch(
                "SELECT i.*, m.name FROM inventory i JOIN medicines m ON m.id=i.medicine_id WHERE i.user_id=$1", user_id
            )
            profile = await conn.fetchrow(
                "SELECT * FROM medication_settings WHERE user_id=$1", user_id
            )
        return {
            "medicines": [dict(r) for r in meds],
            "history": [dict(r) for r in history],
            "compliance": [dict(r) for r in compliance],
            "inventory": [dict(r) for r in inventory],
            "settings": dict(profile) if profile else {},
        }

    @staticmethod
    async def generate_csv(user_id: str, start: date, end: date) -> bytes:
        data = await ReportService._fetch_report_data(user_id, start, end)
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["VitalHealth Medication Report", f"Period: {start} to {end}", f"Generated: {datetime.now()}"])
        w.writerow([])
        w.writerow(["=== ACTIVE MEDICATIONS ==="])
        w.writerow(["Name", "Strength", "Frequency", "Dose", "Status", "Priority", "Doctor"])
        for m in data["medicines"]:
            w.writerow([m.get("name"), m.get("strength"), m.get("frequency"), m.get("dose_quantity"),
                        m.get("status"), m.get("priority"), m.get("doctor_name")])
        w.writerow([])
        w.writerow(["=== DOSE HISTORY ==="])
        w.writerow(["Medicine", "Dose", "Status", "Event At", "Reason"])
        for h in data["history"]:
            w.writerow([h.get("medicine_name"), h.get("dose"), h.get("status"),
                        str(h.get("event_at", "")), h.get("reason", "")])
        w.writerow([])
        w.writerow(["=== COMPLIANCE SUMMARY ==="])
        w.writerow(["Date", "Scheduled", "Taken", "Missed", "Adherence%", "Score", "Grade"])
        for c in data["compliance"]:
            w.writerow([c.get("log_date"), c.get("total_scheduled"), c.get("total_taken"),
                        c.get("total_missed"), c.get("adherence_pct"), c.get("score"), c.get("grade")])
        return buf.getvalue().encode("utf-8")

    @staticmethod
    async def generate_fhir(user_id: str, start: date, end: date) -> Dict[str, Any]:
        """Generate FHIR R4 MedicationStatement Bundle."""
        data = await ReportService._fetch_report_data(user_id, start, end)
        entries = []
        for m in data["medicines"]:
            entries.append({
                "fullUrl": f"urn:uuid:{m.get('id')}",
                "resource": {
                    "resourceType": "MedicationStatement",
                    "id": str(m.get("id")),
                    "status": "active" if m.get("status") == "active" else "stopped",
                    "medication": {"concept": {"text": m.get("name", "")}},
                    "subject": {"identifier": {"value": user_id}},
                    "effectivePeriod": {
                        "start": str(m.get("start_date", "")),
                        "end": str(m.get("end_date", "")) if m.get("end_date") else None,
                    },
                    "dosage": [{"text": f"{m.get('dose_quantity')} {m.get('frequency')}"}],
                    "note": [{"text": m.get("purpose", "")}],
                },
            })
        return {
            "resourceType": "Bundle",
            "id": str(uuid4()),
            "type": "collection",
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "total": len(entries),
            "entry": entries,
        }

    @staticmethod
    async def generate_hl7(user_id: str, start: date, end: date) -> str:
        """Generate HL7 v2.5 RDS^O13 (Pharmacy/Treatment Dispense) segments."""
        data = await ReportService._fetch_report_data(user_id, start, end)
        now = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        lines = [
            f"MSH|^~\\&|VitalHealth|MedicationVault|EHR|Hospital|{now}||RDS^O13|{uuid4().hex[:12]}|P|2.5",
            f"PID|1||{user_id}|||||||",
        ]
        for idx, m in enumerate(data["medicines"], 1):
            lines.append(
                f"RXD|{idx}|{m.get('name', '')}^{m.get('generic_name', '')}||"
                f"{m.get('dose_quantity', '')}|{m.get('dose_unit', '')}||"
                f"{m.get('start_date', '')}|||{m.get('refill_count', 0)}"
            )
        return "\r".join(lines)

    @staticmethod
    async def generate_pdf(user_id: str, start: date, end: date) -> bytes:
        """Generate PDF report using reportlab if available, else plain-text bytes."""
        try:
            from reportlab.lib.pagesizes import letter  # type: ignore
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle  # type: ignore
            from reportlab.lib.styles import getSampleStyleSheet  # type: ignore
            from reportlab.lib import colors  # type: ignore

            data = await ReportService._fetch_report_data(user_id, start, end)
            buf = io.BytesIO()
            doc = SimpleDocTemplate(buf, pagesize=letter)
            styles = getSampleStyleSheet()
            story = []

            story.append(Paragraph("VitalHealth Medication Report", styles["Title"]))
            story.append(Paragraph(f"Period: {start} to {end} | User: {user_id}", styles["Normal"]))
            story.append(Spacer(1, 12))

            story.append(Paragraph("Active Medications", styles["Heading2"]))
            table_data = [["Name", "Strength", "Frequency", "Status", "Priority"]]
            for m in data["medicines"]:
                table_data.append([m.get("name",""), m.get("strength",""), m.get("frequency",""),
                                   m.get("status",""), m.get("priority","")])
            t = Table(table_data)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2563eb")),
                ("TEXTCOLOR", (0,0), (-1,0), colors.white),
                ("GRID", (0,0), (-1,-1), 0.5, colors.grey),
            ]))
            story.append(t)
            story.append(Spacer(1, 12))

            # Compliance summary
            if data["compliance"]:
                story.append(Paragraph("Compliance Summary", styles["Heading2"]))
                comp_data = [["Date", "Scheduled", "Taken", "Missed", "Adherence%", "Grade"]]
                for c in data["compliance"][-14:]:
                    comp_data.append([str(c.get("log_date","")), c.get("total_scheduled",0),
                                      c.get("total_taken",0), c.get("total_missed",0),
                                      f"{c.get('adherence_pct',0):.1f}%", c.get("grade","")])
                t2 = Table(comp_data)
                t2.setStyle(TableStyle([("GRID", (0,0), (-1,-1), 0.5, colors.grey)]))
                story.append(t2)

            doc.build(story)
            return buf.getvalue()
        except ImportError:
            # Fallback to CSV bytes if reportlab is not installed
            csv_bytes = await ReportService.generate_csv(user_id, start, end)
            return csv_bytes

    @staticmethod
    async def create_report_record(user_id: str, report_type: str, fmt: str,
                                   start: date, end: date, file_url: str = "") -> Dict:
        async with get_conn() as conn:
            row = await conn.fetchrow(
                """INSERT INTO reports (id, user_id, report_type, format, title, period_start, period_end,
                file_url, status, generated_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',NOW()) RETURNING *""",
                uuid4(), user_id, report_type, fmt,
                f"{report_type.replace('_', ' ').title()} — {start} to {end}",
                start, end, file_url,
            )
        return dict(row)
