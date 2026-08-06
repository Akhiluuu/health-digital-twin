"""
healthbot_v4/apps/brain/graph/health_knowledge_graph.py
Health Knowledge Graph Engine for VitalHealth v6.0 Enterprise.
Manages entity-relationship graph traversals linking Diseases, Medications, Side Effects, Labs, Risks, and Symptoms.
"""

from typing import Dict, Any, List, Set
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


class HealthKnowledgeGraphEngine:
    """
    Health Knowledge Graph Service.
    Enables graph traversal to discover indirect clinical connections and risk paths.
    """

    def __init__(self):
        self._nodes: Dict[str, GraphNode] = {}
        self._edges: List[GraphEdge] = []
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

    def _add_edge(self, source: str, target: str, rel: str):
        if source not in self._nodes:
            label, name = source.split(":", 1) if ":" in source else ("Entity", source)
            self._nodes[source] = GraphNode(source, label, {"name": name})
        if target not in self._nodes:
            label, name = target.split(":", 1) if ":" in target else ("Entity", target)
            self._nodes[target] = GraphNode(target, label, {"name": name})

        self._edges.append(GraphEdge(source, target, rel))

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
