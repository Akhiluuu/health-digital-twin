"""
healthbot_v4/apps/brain/core.py
Central Health Brain Subsystem Coordinator for VitalHealth v5.0.
"""

from __future__ import annotations
from typing import Dict, Any, Optional
from healthbot_v4.shared.logger.logger import logger


class HealthBrainSubsystem:
    """Base class for all Health Brain subsystems."""

    def __init__(self, name: str):
        self.name = name
        self.is_active: bool = False

    async def initialize(self) -> None:
        self.is_active = True

    async def shutdown(self) -> None:
        self.is_active = False


class HealthBrainCore:
    """Singleton coordinator managing lifecycles of all Health Brain subsystems."""

    _instance: Optional[HealthBrainCore] = None
    subsystems: Dict[str, HealthBrainSubsystem]
    is_running: bool

    def __new__(cls) -> HealthBrainCore:
        if cls._instance is None:
            inst = super().__new__(cls)
            inst.subsystems = {}
            inst.is_running = False
            cls._instance = inst
        return cls._instance

    def register_subsystem(self, subsystem: HealthBrainSubsystem) -> None:
        self.subsystems[subsystem.name] = subsystem
        logger.info(f"Registered Health Brain Subsystem: {subsystem.name}")

    async def initialize_all(self) -> None:
        logger.info("Initializing all Health Brain Subsystems...")
        for name, sub in self.subsystems.items():
            logger.info(f"Starting {name}...")
            await sub.initialize()
        self.is_running = True
        logger.info("✅ Health Brain Core fully online")

    async def shutdown_all(self) -> None:
        logger.info("Shutting down Health Brain Core...")
        for name, sub in self.subsystems.items():
            await sub.shutdown()
        self.is_running = False
        logger.info("Health Brain Core shut down completed")


def get_health_brain() -> HealthBrainCore:
    return HealthBrainCore()
