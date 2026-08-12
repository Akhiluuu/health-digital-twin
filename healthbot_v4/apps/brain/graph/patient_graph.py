"""
healthbot_v4/apps/brain/graph/patient_graph.py
NetworkX Knowledge Graph engine for patient clinical relationships.
"""

import networkx as nx  # type: ignore[import-untyped]
from typing import Dict, Any, List, cast
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger


class PatientGraphEngine(HealthBrainSubsystem):
    """Knowledge Graph Subsystem mapping clinical relationships."""

    _shared_graphs: Dict[str, Any] = {}

    def __init__(self):
        super().__init__("patient_graph")
        self._graphs = PatientGraphEngine._shared_graphs

    async def initialize(self) -> None:
        logger.info("🕸️ Patient Knowledge Graph Engine initialized")

    def _get_graph(self, patient_id: str) -> nx.DiGraph:
        if patient_id not in self._graphs:
            self._graphs[patient_id] = nx.DiGraph()

        G: Any = self._graphs[patient_id]
        if not hasattr(G, "add_node"):
            G = nx.DiGraph()

        has_node_fn = getattr(G, "has_node", None)
        node_exists = bool(has_node_fn(patient_id)) if callable(has_node_fn) else False
        add_node_fn = getattr(G, "add_node", None)
        if not node_exists and callable(add_node_fn):
            add_node_fn(patient_id, type="Patient")

        self._graphs[patient_id] = G
        return cast(nx.DiGraph, G)

    def add_clinical_entity(self, patient_id: str, entity_name: str, entity_type: str, relation: str = "HAS_CONDITION"):
        G = self._get_graph(patient_id)
        G.add_node(entity_name, type=entity_type)
        G.add_edge(patient_id, entity_name, relation=relation)

    def get_patient_subgraph(self, patient_id: str) -> Dict[str, Any]:
        G = self._get_graph(patient_id)
        nodes = [{"id": n, "data": G.nodes[n]} for n in G.nodes]
        edges = [{"source": u, "target": v, "relation": G.edges[u, v].get("relation", "LINK")} for u, v in G.edges]
        return {"patient_id": patient_id, "nodes": nodes, "edges": edges}
