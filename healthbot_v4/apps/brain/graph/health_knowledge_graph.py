"""
healthbot_v4/apps/brain/graph/health_knowledge_graph.py
Health Knowledge Graph Engine for VitalHealth v6.0 Enterprise.
Manages entity-relationship graph traversals linking Diseases, Medications, Side Effects, Labs, Risks, and Symptoms.
"""

from typing import Dict, Any, List, Set, Optional
from healthbot_v4.apps.patient.models.patient_state import UnifiedPatientState
from healthbot_v4.shared.logger.logger import logger


class GraphNode:
    def __init__(self, node_id: str, label: str, properties: Dict[str, Any]):
        self.node_id = node_id
        self.label = label  # Patient, Condition, Medication, Lab, Symptom, Risk
        self.properties = properties


class GraphEdge:
    def __init__(self, source_id: str, target_id: str, relationship: str):
        self.source_id = source_id
        self.target_id = target_id
        self.relationship = relationship  # HAS_CONDITION, TREATED_BY, MONITORED_BY, CAUSES_SIDE_EFFECT, ELEVATES_RISK


from healthbot_v4.apps.brain.graph.persistent_graph_adapter import PersistentGraphAdapter


class HealthKnowledgeGraphEngine:
    """
    Health Knowledge Graph Service.
    Enables dual-layer graph traversal:
    - L1: In-memory query cache (< 1ms traversal for real-time inference)
    - L2: Persistent Graph Adapter (asynchronous OpenCypher export)
    """

    def __init__(self):
        self._nodes: Dict[str, GraphNode] = {}
        self._edges: List[GraphEdge] = []
        self.persistent_adapter = PersistentGraphAdapter()
        self._initialize_seed_knowledge()

    def _initialize_seed_knowledge(self):
        """Populates baseline clinical ontology knowledge graph edges."""
        # 1. Type 2 Diabetes Graph Nodes & Edges
        self._add_edge("Condition:Type 2 Diabetes", "Medication:Metformin", "TREATED_BY")
        self._add_edge("Medication:Metformin", "Lab:HbA1c", "MONITORED_BY")
        self._add_edge("Medication:Metformin", "Lab:eGFR", "MONITORED_BY")
        self._add_edge("Condition:Type 2 Diabetes", "Risk:Microvascular Disease", "ELEVATES_RISK")

        # 2. Chronic Kidney Disease Graph
        self._add_edge("Condition:CKD", "Lab:eGFR", "MONITORED_BY")
        self._add_edge("Condition:CKD", "Lab:Serum Creatinine", "MONITORED_BY")
        self._add_edge("Condition:CKD", "Medication:Ibuprofen", "CONTRAINDICATED_WITH")

        # 3. Hypertension Graph
        self._add_edge("Condition:Hypertension", "Medication:Lisinopril", "TREATED_BY")
        self._add_edge("Medication:Lisinopril", "Lab:Serum Potassium", "MONITORED_BY")
        self._add_edge("Medication:Lisinopril", "Symptom:Dry Cough", "CAUSES_SIDE_EFFECT")

    def _add_edge(self, source: str, target: str, rel: str, patient_id: str = "global", props: Optional[Dict[str, Any]] = None):
        src_label, src_name = source.split(":", 1) if ":" in source else ("Entity", source)
        tgt_label, tgt_name = target.split(":", 1) if ":" in target else ("Entity", target)

        if source not in self._nodes:
            self._nodes[source] = GraphNode(source, src_label, {"name": src_name})
        if target not in self._nodes:
            self._nodes[target] = GraphNode(target, tgt_label, {"name": tgt_name})

        self._edges.append(GraphEdge(source, target, rel))

        # Asynchronously queue to L2 persistent store (non-blocking)
        self.persistent_adapter.queue_triple(
            source_id=source,
            source_label=src_label,
            target_id=target,
            target_label=tgt_label,
            relationship=rel,
            properties=props or {"name": tgt_name},
            patient_id=patient_id
        )

    def build_patient_subgraph(self, state: UnifiedPatientState) -> Dict[str, Any]:
        """
        Traverses the graph starting from patient active conditions and medications.
        Returns a clinical sub-graph summary.
        """
        patient_node_id = f"Patient:{state.patient_id}"
        paths = []

        for condition in state.conditions:
            cond_node = f"Condition:{condition.name}"
            paths.append(f"({patient_node_id}) ──[HAS_CONDITION]──► ({cond_node})")

            # Find relationships from condition
            for edge in self._edges:
                if edge.source_id.lower() in cond_node.lower() or cond_node.lower() in edge.source_id.lower():
                    paths.append(f"  └──[{edge.relationship}]──► ({edge.target_id})")

        for med in state.active_regimen:
            med_node = f"Medication:{med.name}"
            for edge in self._edges:
                if edge.source_id.lower() in med_node.lower() or med_node.lower() in edge.source_id.lower():
                    paths.append(f"({med_node}) ──[{edge.relationship}]──► ({edge.target_id})")

        logger.info(f"🕸️ Built Health Knowledge Subgraph for patient {state.patient_id} ({len(paths)} traversal paths)")
        return {
            "patient_id": state.patient_id,
            "traversal_paths": paths,
            "connected_nodes_count": len(set(paths))
        }

    def get_patient_subgraph(self, patient_id: str) -> Dict[str, Any]:
        """Returns patient subgraph nodes and edges for API endpoint compatibility."""
        patient_node = f"Patient:{patient_id}"
        nodes = []
        edges = []

        for node_id, node in self._nodes.items():
            nodes.append({"id": node_id, "label": node.label, "properties": node.properties})

        for edge in self._edges:
            edges.append({"source": edge.source_id, "target": edge.target_id, "relation": edge.relationship})

        return {"patient_id": patient_id, "nodes": nodes, "edges": edges}

    def add_clinical_entity(self, patient_id: str, entity_name: str, entity_type: str, relation: str = "HAS_CONDITION"):
        """Adds a clinical entity and connects it to the patient node in the graph."""
        patient_node = f"Patient:{patient_id}"
        target_node = f"{entity_type}:{entity_name}"
        self._add_edge(patient_node, target_node, relation, patient_id=patient_id)

    def ingest_evidence_item(self, patient_id: str, item: Any) -> str:
        """Dynamic ingestion of EvidenceItem into PHKG with temporal attribution."""
        patient_node = f"Patient:{patient_id}"
        item_id = getattr(item, "itemId", "item")
        data_type = getattr(item, "dataType", "Observation").capitalize()
        node_id = f"{data_type}:{item_id}"

        self._nodes[node_id] = GraphNode(
            node_id=node_id,
            label=data_type,
            properties={
                "value": getattr(item, "value", None),
                "unit": getattr(item, "unit", None),
                "timestamp": str(getattr(item, "timestamp", "")),
                "confidence": getattr(item, "confidence", 0.9),
                "is_abnormal": getattr(item, "is_abnormal", False),
            }
        )

        rel = "HAS_OBSERVATION"
        if data_type.lower() == "symptom":
            rel = "RECORDED_SYMPTOM"
        elif data_type.lower() == "medication":
            rel = "TOOK_MEDICATION"
        elif data_type.lower() == "condition":
            rel = "HAS_DIAGNOSIS"

        self._add_edge(patient_node, node_id, rel)
        return node_id
