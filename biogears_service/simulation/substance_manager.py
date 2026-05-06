"""substance_manager.py — Dynamic BioGears substance file indexer.

Scans the substance XML files in the BioGears runtime directory and builds
a registry keyed by the internal BioGears name. Used by server.py to expose
the /substances endpoint.

Note: The primary dose routing for simulations is in substance_registry.py
(hard-coded). This module is only used for the substances discovery endpoint.
"""

import os
import logging
import xml.etree.ElementTree as ET

logger = logging.getLogger("DigitalTwin.SubstanceManager")


class SubstanceManager:
    def __init__(self, substance_dir: str):
        self.substance_dir = substance_dir
        self.registry: dict = {}
        self.ns = {'bg': 'uri:/mil/tatrc/physiology/datamodel'}
        self._index_substances()

    def _index_substances(self):
        """Scans the folder and identifies if a file is a Compound or a Substance."""
        if not os.path.isdir(self.substance_dir):
            logger.warning(
                f"SubstanceManager: substances directory not found: '{self.substance_dir}'. "
                "Substance registry will be empty."
            )
            return

        for file in os.listdir(self.substance_dir):
            if not file.endswith(".xml"):
                continue
            path = os.path.join(self.substance_dir, file)
            try:
                tree = ET.parse(path)
                root = tree.getroot()

                # Determine tag name without namespace
                tag = root.tag.split('}')[-1]

                # Find the internal BioGears Name
                name_node = root.find(".//bg:Name", self.ns)
                bg_name = name_node.text if name_node is not None else file[:-4]

                # Check State (Liquid/Gas/Solid)
                state_node = root.find(".//bg:State", self.ns)
                state = state_node.text if state_node is not None else "Liquid"

                self.registry[bg_name.lower()] = {
                    "name": bg_name,
                    "type": "Compound" if tag == "SubstanceCompound" else "Substance",
                    "state": state,
                    "file": file,
                }
            except ET.ParseError as xml_err:
                logger.debug(f"SubstanceManager: skipping '{file}' (XML parse error: {xml_err})")
            except Exception as e:
                logger.debug(f"SubstanceManager: skipping '{file}' ({e})")

    def get_substance(self, name: str):
        return self.registry.get(name.lower())