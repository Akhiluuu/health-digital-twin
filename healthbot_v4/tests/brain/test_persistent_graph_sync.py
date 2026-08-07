"""
healthbot_v4/tests/brain/test_persistent_graph_sync.py
Automated test suite verifying the L1 In-Memory Cache + L2 Persistent Graph Store adapter for PHKG.
"""

import time
import pytest
from healthbot_v4.apps.brain.graph.health_knowledge_graph import HealthKnowledgeGraphEngine
from healthbot_v4.apps.brain.graph.persistent_graph_adapter import PersistentGraphAdapter, PersistentGraphTriple


def test_persistent_graph_triple_opencypher():
    triple = PersistentGraphTriple(
        source_id="Condition:T2D",
        source_label="Condition",
        target_id="Medication:Metformin",
        target_label="Medication",
        relationship="TREATED_BY",
        properties={"dosage": "500mg"},
        patient_id="patient-123"
    )
    cypher = triple.to_cypher()
    assert "MERGE (a:Condition {id: 'Condition:T2D'})" in cypher
    assert "MERGE (b:Medication {id: 'Medication:Metformin'})" in cypher
    assert "MERGE (a)-[r:TREATED_BY {dosage: '500mg'}]->(b)" in cypher
    assert "r.patientId = 'patient-123'" in cypher


def test_persistent_graph_adapter_queuing_and_batch_flush():
    adapter = PersistentGraphAdapter(max_buffer_size=100)
    adapter.queue_triple("Condition:Hypertension", "Condition", "Medication:Lisinopril", "Medication", "TREATED_BY")
    adapter.queue_triple("Medication:Lisinopril", "Medication", "Lab:Potassium", "Lab", "MONITORED_BY")

    status = adapter.get_sync_status()
    assert status["pendingBufferDepth"] == 2
    assert status["totalTriplesQueued"] == 2

    statements = adapter.flush_batch(batch_size=10)
    assert len(statements) == 2
    assert "MERGE (a)-[r:TREATED_BY" in statements[0]

    post_status = adapter.get_sync_status()
    assert post_status["pendingBufferDepth"] == 0
    assert post_status["totalStatementsExported"] == 2


def test_health_knowledge_graph_l1_submillisecond_performance():
    graph_engine = HealthKnowledgeGraphEngine()
    
    start_time = time.time()
    # Ingest 100 evidence items into L1 in-memory graph
    for i in range(100):
        graph_engine._add_edge(f"Patient:px_{i}", f"Observation:obs_{i}", "HAS_OBSERVATION")
    
    latency_ms = (time.time() - start_time) * 1000
    # Guarantee sub-millisecond per-item ingestion speed
    assert (latency_ms / 100) < 1.0

    sync_status = graph_engine.persistent_adapter.get_sync_status()
    assert sync_status["totalTriplesQueued"] >= 100
