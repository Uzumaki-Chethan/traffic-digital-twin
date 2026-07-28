"""
ml_predictor.py
================
MLPredictor, the module responsible for converting a TrafficFeatures
snapshot into a TrafficPrediction using a trained RandomForestRegressor.

MLPredictor performs prediction only. It never communicates with SUMO,
TraCI, or the Digital Twin, never allocates signal timings, never
chooses traffic phases, and contains no rule-based traffic logic. Those
responsibilities belong exclusively to the future Decision Engine.

Training is out of scope for this module and is implemented separately.
MLPredictor assumes a trained model already exists and is designed for
inference only.

============================================================
TRAINING CONTRACT (read this before writing the training script)
============================================================
The model this class loads must be a scikit-learn compatible regressor
(RandomForestRegressor or equivalent) trained with:

  X : shape (n_samples, 64)
      Built by _build_feature_vector(), in this fixed order:
        [0]      total_vehicle_count
        [1]      average_speed
        [2]      average_waiting_time
        [3]      stopped_vehicle_count
        [4:64]   12 lanes, in EXPECTED_LANE_IDS order, 5 features each:
                 vehicle_count, average_speed, average_waiting_time,
                 max_waiting_time, stopped_vehicle_count

  y : shape (n_samples, 24)
      12 lanes, in EXPECTED_LANE_IDS order, 2 targets each:
        predicted_vehicle_count, predicted_average_waiting_time

Any future training script MUST reproduce this exact ordering, since
MLPredictor has no way to detect a silently mismatched column order at
inference time, only a mismatched output length (checked below).
"""

import os
from types import MappingProxyType
from typing import Any, List, Tuple

import numpy as np

from models import LanePrediction, TrafficFeatures, TrafficPrediction

# Canonical, ordered list of lane IDs this model is trained against. This
# is a deliberate coupling to the frozen network's channelization design
# (one dedicated lane per movement), not to volatile geometry, the set of
# lanes will not change unless the network's connections are redesigned.
EXPECTED_LANE_IDS: Tuple[str, ...] = (
    "N_in_0", "N_in_1", "N_in_2",
    "S_in_0", "S_in_1", "S_in_2",
    "E_in_0", "E_in_1", "E_in_2",
    "W_in_0", "W_in_1", "W_in_2",
)

# Number of prediction targets produced per lane: predicted_vehicle_count
# and predicted_average_waiting_time.
TARGETS_PER_LANE = 2

# How far into the future this model predicts. This is currently a code
# constant rather than metadata stored with the trained model itself,
# a known, documented limitation, see the design review for why.
PREDICTION_HORIZON_SECONDS = 5.0


class MLPredictor:
    """
    Loads a trained regression model and converts TrafficFeatures into
    TrafficPrediction.

    Constructed via dependency injection, either directly with an
    already-loaded model object (useful for testing with a fake model),
    or via the from_path() alternate constructor, which loads and
    validates a model from disk, the normal production path.
    """

    def __init__(self, model: Any):
        """
        Parameters
        ----------
        model : Any
            An already loaded, already fitted regressor exposing both
            predict(X) and estimators_ (the scikit-learn
            RandomForestRegressor interface). Validated by
            _validate_model() before being accepted.
        """
        self._validate_model(model)
        self._model = model

    @classmethod
    def from_path(cls, model_path: str) -> "MLPredictor":
        """
        Load a trained model from disk and construct an MLPredictor
        around it.

        Parameters
        ----------
        model_path : str
            Path to a joblib-serialized scikit-learn regressor.

        Raises
        ------
        FileNotFoundError
            If model_path does not point to an existing file, with a
            message identifying exactly which path was checked.
        RuntimeError
            If the file exists but could not be deserialized as a
            model, for example a corrupted or non-joblib file.
        TypeError
            If the deserialized object does not look like a fitted
            regressor, see _validate_model().
        """
        if not os.path.isfile(model_path):
            raise FileNotFoundError(
                "No trained ML model found at: {}. Training happens in a "
                "separate milestone, this predictor cannot run until a "
                "model has been trained and saved to this path.".format(
                    model_path
                )
            )

        try:
            import joblib

            model = joblib.load(model_path)
        except Exception as exc:
            raise RuntimeError(
                "Failed to load ML model from {}. The file exists but "
                "could not be deserialized, it may be corrupted or not a "
                "valid joblib file.".format(model_path)
            ) from exc

        return cls(model)

    @staticmethod
    def _validate_model(model: Any) -> None:
        """
        Confirm the given object looks like a fitted, scikit-learn
        compatible multi-output regressor before accepting it.

        Raises
        ------
        TypeError
            If the model is missing predict() or estimators_, the two
            attributes this class relies on for inference and for the
            tree-spread confidence calculation.
        """
        if not hasattr(model, "predict"):
            raise TypeError(
                "The provided model does not expose a predict() method, "
                "MLPredictor requires a fitted scikit-learn compatible "
                "regressor."
            )
        if not hasattr(model, "estimators_"):
            raise TypeError(
                "The provided model does not expose estimators_, "
                "MLPredictor requires a fitted RandomForestRegressor (or "
                "equivalent ensemble) to compute per-lane confidence "
                "scores from tree prediction spread."
            )

    def predict(self, features: TrafficFeatures) -> TrafficPrediction:
        """
        Convert a TrafficFeatures snapshot into a TrafficPrediction.

        Parameters
        ----------
        features : TrafficFeatures
            The current engineered features to predict from.

        Raises
        ------
        ValueError
            If the model's output length does not match what this class
            expects (len(EXPECTED_LANE_IDS) * TARGETS_PER_LANE), which
            would indicate the loaded model was trained against a
            different feature or target contract than documented above.

        Returns
        -------
        TrafficPrediction
            One LanePrediction per entry in EXPECTED_LANE_IDS.
        """
        vector = self._build_feature_vector(features)
        input_row = np.array([vector])

        mean_prediction = self._model.predict(input_row)[0]

        expected_length = len(EXPECTED_LANE_IDS) * TARGETS_PER_LANE
        if len(mean_prediction) != expected_length:
            raise ValueError(
                "Loaded model produced {} outputs, expected {} ({} lanes "
                "x {} targets per lane). The loaded model does not match "
                "the training contract documented in this module.".format(
                    len(mean_prediction), expected_length,
                    len(EXPECTED_LANE_IDS), TARGETS_PER_LANE,
                )
            )

        tree_predictions = np.array(
            [tree.predict(input_row)[0] for tree in self._model.estimators_]
        )
        std_per_output = tree_predictions.std(axis=0)

        lane_predictions = {
            lane_id: self._build_lane_prediction(
                lane_id, lane_index, mean_prediction, std_per_output
            )
            for lane_index, lane_id in enumerate(EXPECTED_LANE_IDS)
        }

        return TrafficPrediction(
            reference_time=features.simulation_time,
            prediction_horizon_seconds=PREDICTION_HORIZON_SECONDS,
            lane_predictions=MappingProxyType(lane_predictions),
        )

    def _build_lane_prediction(
        self,
        lane_id: str,
        lane_index: int,
        mean_prediction: np.ndarray,
        std_per_output: np.ndarray,
    ) -> LanePrediction:
        """
        Extract this lane's two output columns from the flattened
        prediction and standard-deviation arrays, and combine them into
        one LanePrediction.
        """
        vehicle_count_col = lane_index * TARGETS_PER_LANE
        waiting_time_col = vehicle_count_col + 1

        predicted_vehicle_count = float(mean_prediction[vehicle_count_col])
        predicted_waiting_time = float(mean_prediction[waiting_time_col])

        vehicle_count_confidence = self._confidence(
            predicted_vehicle_count, std_per_output[vehicle_count_col]
        )
        waiting_time_confidence = self._confidence(
            predicted_waiting_time, std_per_output[waiting_time_col]
        )
        # A single blended confidence per lane, rather than exposing both
        # target confidences separately, keeps LanePrediction from
        # fragmenting into a field per target per metric.
        confidence = (vehicle_count_confidence + waiting_time_confidence) / 2.0

        return LanePrediction(
            lane_id=lane_id,
            predicted_vehicle_count=predicted_vehicle_count,
            predicted_average_waiting_time=predicted_waiting_time,
            confidence=confidence,
        )

    @staticmethod
    def _confidence(mean_value: float, std_value: float) -> float:
        """
        Convert a Random Forest tree-spread standard deviation into a 0
        to 100 confidence score. Lower spread relative to the mean
        prediction yields higher confidence.

        The denominator is floored at 1.0 to avoid dividing by a
        near-zero mean prediction producing an artificially extreme
        confidence value.
        """
        denominator = max(abs(mean_value), 1.0)
        return float(max(0.0, 100.0 - (std_value / denominator) * 100.0))

    def _build_feature_vector(self, features: TrafficFeatures) -> List[float]:
        """
        Flatten a TrafficFeatures snapshot into the fixed-order feature
        vector this model expects, see the TRAINING CONTRACT docstring
        at the top of this module for the exact column layout.

        Lanes with no vehicles currently present are not included in
        TrafficFeatures.lane_features at all (FeatureEngineer only
        creates entries for lanes with at least one vehicle), so any
        lane missing from features.lane_features is filled with zeros
        here, consistent with FeatureEngineer's own "no vehicles means
        0.0" convention.
        """
        vector: List[float] = [
            float(features.total_vehicle_count),
            float(features.average_speed),
            float(features.average_waiting_time),
            float(features.stopped_vehicle_count),
        ]

        for lane_id in EXPECTED_LANE_IDS:
            lane = features.lane_features.get(lane_id)
            if lane is None:
                vector.extend([0.0, 0.0, 0.0, 0.0, 0.0])
            else:
                vector.extend([
                    float(lane.vehicle_count),
                    float(lane.average_speed),
                    float(lane.average_waiting_time),
                    float(lane.max_waiting_time),
                    float(lane.stopped_vehicle_count),
                ])

        return vector