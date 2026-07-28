"""
ml package
==========
Exposes MLPredictor, the module responsible for converting a
TrafficFeatures snapshot into a TrafficPrediction using a trained
regression model. This is the only place in the project that performs
ML inference, it never communicates with SUMO, TraCI, or the Digital
Twin, and never makes signal timing or phase decisions, those belong to
the future Decision Engine.
"""

from .ml_predictor import MLPredictor

__all__ = ["MLPredictor"]