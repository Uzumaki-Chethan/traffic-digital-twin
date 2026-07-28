"""
feature_engineering package
============================
Exposes FeatureEngineer, the module responsible for converting the
Digital Twin's current SimulationState into a TrafficFeatures object.
This is the only place in the project where SimulationState is
aggregated into numerical features, everything above this layer
(Machine Learning, the Decision Engine, the Dashboard) consumes
TrafficFeatures and never touches SimulationState directly.
"""

from .feature_engineer import FeatureEngineer

__all__ = ["FeatureEngineer"]