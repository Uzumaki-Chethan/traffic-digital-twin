"""
digital_twin package
=====================
Exposes DigitalTwin, the central source of truth that mirrors the
traffic system using immutable SimulationState snapshots. Every future
module (Feature Engineering, Machine Learning, the Decision Engine) will
read from this class rather than from TrafficAdapter directly.
"""

from .digital_twin import DigitalTwin

__all__ = ["DigitalTwin"]