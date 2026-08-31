"""
ml_predictor.py
================
MLPredictor, the module responsible for converting a TrafficFeatures
snapshot into a TrafficPrediction using a trained RandomForestRegressor.

MLPredictor performs prediction only. It never communicates with SUMO,
TraCI, or the Digital Twin, never allocates signal timings, never
chooses traffic phases, and contains no rule-based traffic logic. Those
responsibilities belong exclusively to the future Decision Engine.

Training is out of scope for this module and is implemented separately,
in the sibling ml/training package. MLPredictor assumes a trained model
already exists and is designed for inference only.

Column ordering (which feature goes in which position, which lane's
prediction comes out of which output column) is NOT owned by this class,
it is imported from feature_schema, the single shared contract between
this class and the training pipeline that produces the model it loads.
See feature_schema.py for the full column layout documentation.

============================================================
MODEL ARCHITECTURE CONTRACT
============================================================
The model this class loads must be a single, native multi-output
regressor (a scikit-learn RandomForestRegressor fit directly on a 2D y
of shape (n_samples, TARGET_VECTOR_LENGTH)), NOT a MultiOutputRegressor
wrapping several single-output models. This matters because both the
prediction and confidence logic below rely on every entry in
model.estimators_ being an individual tree that itself predicts the
full output vector, a MultiOutputRegressor's estimators_ would instead
be a list of separately fitted single-output sub-models, each with its
own nested estimators_, which would silently break this class.

============================================================
PERFORMANCE NOTE - why this file does not call model.predict()
============================================================
An earlier version of this class called self._model.predict(input_row)
for the mean prediction, then separately looped over
self._model.estimators_ calling tree.predict(input_row) again for the
confidence spread, traversing all 200 trees twice per call.

Profiling traced almost all per-step latency (35-60ms, occasionally
165ms) to that code, not to feature generation, the Digital Twin, or
anything else upstream. Benchmarking scikit-learn's own
RandomForestRegressor.predict() against a manual aggregation loop, on a
model shaped exactly like this project's (200 trees, 77 features, 24
outputs), single-row calls showed:

    model.predict()                          : ~9-10 ms/call
    manual, single tree traversal per tree    : ~0.7-0.8 ms/call
    (both mean and confidence in one pass)

with numerically IDENTICAL results (max difference 0.0 across repeated
trials). The cost is scikit-learn's own joblib-based per-estimator
dispatch machinery inside predict(), which still runs even at n_jobs=1,
and which was being paid TWICE per call (once for the mean, once again
for confidence). It scales almost perfectly linearly with n_estimators,
confirming it is genuine per-tree dispatch overhead, not a fixed cost.

The fix implemented below: a single manual pass over
self._model.estimators_, using each tree's low-level, compiled
tree_.predict() method (bypassing scikit-learn's own Parallel dispatch
and repeated high-level input validation entirely), computing both the
mean prediction and the per-tree standard deviation from the same pass.
This is a measured 10x+ speedup with exactly identical output, not an
approximation or a quality tradeoff.

Because tree_.predict() is a lower-level, semi-internal API rather than
the public tree.predict(), _verify_fast_path() runs once at construction
time, comparing this method's output against the model's own public
predict() on a real feature vector, and raises immediately if scikit-
learn's internal behaviour ever diverges (for example after an
incompatible scikit-learn upgrade), rather than silently returning wrong
numbers from then on. This is a one-time cost paid at startup, not per
prediction.
"""

import logging
import os
from types import MappingProxyType
from typing import Any

import numpy as np

from models import LanePrediction, TrafficFeatures, TrafficPrediction
from ml.feature_schema import (
    EXPECTED_LANE_IDS,
    FEATURE_VECTOR_LENGTH,
    PREDICTION_HORIZON_SECONDS,
    TARGET_VECTOR_LENGTH,
    features_to_vector,
    lane_output_index,
)

logger = logging.getLogger(__name__)


class MLPredictor:
    """
    Loads a trained regression model and converts TrafficFeatures into
    TrafficPrediction.

    Constructed via dependency injection, either directly with an
    already-loaded model object (useful for testing with a fake model),
    or via the from_path() alternate constructor, which loads and
    validates a model from disk, the normal production path.
    """

    def __init__(self, model: Any, confidence_calibrators: Any = None, target_weights: Any = None):
        """
        Parameters
        ----------
        model : Any
            An already loaded, already fitted regressor exposing
            predict(X) and estimators_ (the scikit-learn
            RandomForestRegressor interface). Validated by
            _validate_model() and _verify_fast_path() before being
            accepted, the latter runs one real prediction to confirm
            the fast manual-aggregation path matches the model's own
            public predict() exactly, a one-time cost at construction,
            not per prediction.
        confidence_calibrators : dict | None
            Optional {target_name: IsotonicRegression}, one entry per
            feature_schema.TARGET_FEATURE_NAMES value. Added in the
            second training milestone (see
            ml/training/fit_confidence_calibration.py) after evaluating
            the raw tree-spread confidence score and finding it was
            only reliably ordered at its extremes, not in between.
            When provided, each raw _confidence() output is passed
            through the matching calibrator before being used, so the
            resulting score's ordering actually tracks real error
            across its whole range, not just near 0 and 100. When None
            (the default, and what from_path() falls back to if no
            calibrators file exists next to the model), confidence
            behaves exactly as it always has, uncalibrated - this
            parameter is strictly additive, nothing about predict() or
            the model itself changes because of it.
        target_weights : dict | None
            Optional {target_name: weight}, summing to 1.0, used to
            combine vehicle_count_confidence and
            waiting_time_confidence into one per-lane confidence value
            (see _build_lane_prediction). Added alongside
            confidence_calibrators: fitting calibration against a real
            dataset can reveal that one target's confidence carries
            real information (correlates with actual error) while the
            other's does not, in which case an equal-weight average
            would dilute the informative one for no reason. Falls back
            to an equal 50/50 split (the original, pre-calibration
            behaviour) when not provided.
        """
        self._validate_model(model)
        self._model = model
        self._confidence_calibrators = confidence_calibrators or {}
        self._target_weights = target_weights or {}
        self._verify_fast_path()

    @classmethod
    def from_path(cls, model_path: str) -> "MLPredictor":
        """
        Load a trained model from disk and construct an MLPredictor
        around it.

        Also looks for a confidence_calibrators.joblib file in the same
        directory as model_path (see
        ml/training/fit_confidence_calibration.py) and loads it if
        present. This lookup is best-effort: a missing file is normal
        (not every trained model has been calibrated) and a corrupt or
        unreadable one is logged and skipped rather than raised, since
        the calibrator is an optional refinement, not a requirement for
        MLPredictor to function - failing to load it should never be
        the reason inference itself becomes unavailable.

        Raises
        ------
        FileNotFoundError
            If model_path does not point to an existing file.
        RuntimeError
            If the file exists but could not be deserialized as a model.
        TypeError
            If the deserialized object does not look like a fitted
            multi-output regressor, see _validate_model().
        """
        if not os.path.isfile(model_path):
            raise FileNotFoundError(
                "No trained ML model found at: {}. Training happens in a "
                "separate milestone, this predictor cannot run until a "
                "model has been trained and saved to this path.".format(
                    model_path
                )
            )

        import joblib

        try:
            model = joblib.load(model_path)
        except Exception as exc:
            raise RuntimeError(
                "Failed to load ML model from {}. The file exists but "
                "could not be deserialized, it may be corrupted or not a "
                "valid joblib file.".format(model_path)
            ) from exc

        confidence_calibrators = {}
        target_weights = {}
        calibrators_path = os.path.join(
            os.path.dirname(model_path), "confidence_calibrators.joblib"
        )
        if os.path.isfile(calibrators_path):
            try:
                saved = joblib.load(calibrators_path)
                confidence_calibrators = saved.get("calibrators", {})
                target_weights = saved.get("target_weights", {})
            except Exception:
                logger.warning(
                    "Found %s but could not load it, continuing with "
                    "uncalibrated confidence.", calibrators_path,
                )
                confidence_calibrators = {}
                target_weights = {}

        return cls(
            model,
            confidence_calibrators=confidence_calibrators,
            target_weights=target_weights,
        )

    @staticmethod
    def _validate_model(model: Any) -> None:
        """
        Confirm the given object looks like a fitted, scikit-learn
        compatible multi-output regressor before accepting it.
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
                "equivalent ensemble). See the MODEL ARCHITECTURE "
                "CONTRACT at the top of this module."
            )

    def _verify_fast_path(self) -> None:
        """
        One-time consistency check, run once at construction: confirm
        the fast manual tree-aggregation path used by predict() produces
        the same mean prediction as the model's own public predict(),
        on a real (all-ones) feature vector.

        This guards against the low-level tree_.predict() API this class
        relies on ever changing shape or semantics in a future
        scikit-learn version, if that ever happens, this raises
        immediately and clearly at startup, rather than the fast path
        silently returning wrong numbers on every subsequent prediction.

        Raises
        ------
        RuntimeError
            If the fast path's output does not match the model's own
            predict() within a tight numerical tolerance.
        """
        test_vector = np.ones((1, FEATURE_VECTOR_LENGTH), dtype=np.float64)
        expected = self._model.predict(test_vector)[0]

        test_vector_f32 = np.ascontiguousarray(test_vector, dtype=np.float32)
        tree_predictions = self._collect_tree_predictions(test_vector_f32)
        actual = tree_predictions.mean(axis=0)

        if not np.allclose(expected, actual, atol=1e-6):
            raise RuntimeError(
                "MLPredictor's fast prediction path does not match the "
                "loaded model's own predict() output. This likely means "
                "the installed scikit-learn version's internal tree_."
                "predict() behaviour is incompatible with the version "
                "this optimization was written and verified against. "
                "Falling back is required, do not use this MLPredictor "
                "version until this is investigated."
            )

    def predict(self, features: TrafficFeatures) -> TrafficPrediction:
        """
        Convert a TrafficFeatures snapshot into a TrafficPrediction.

        Traverses every tree in the forest exactly once (see the
        PERFORMANCE NOTE at the top of this module), deriving both the
        mean prediction and the per-lane confidence from that single
        pass, rather than calling the model's own predict() and then
        separately re-traversing every tree again for confidence.

        Raises
        ------
        ValueError
            If the model's output length does not match
            feature_schema.TARGET_VECTOR_LENGTH.

        Returns
        -------
        TrafficPrediction
            One LanePrediction per entry in EXPECTED_LANE_IDS.
        """
        vector = features_to_vector(features)
        # Cast to float32 once, here, ourselves: this is the dtype
        # scikit-learn's compiled tree code requires internally, casting
        # it once up front avoids relying on any internal, possibly
        # per-call, conversion.
        input_row = np.ascontiguousarray([vector], dtype=np.float32)

        tree_predictions = self._collect_tree_predictions(input_row)

        if tree_predictions.shape[1] != TARGET_VECTOR_LENGTH:
            raise ValueError(
                "Loaded model produced {} outputs, expected {} "
                "(feature_schema.TARGET_VECTOR_LENGTH). The loaded model "
                "does not match the current feature_schema contract, it "
                "may have been trained against an older or incompatible "
                "schema version.".format(
                    tree_predictions.shape[1], TARGET_VECTOR_LENGTH
                )
            )

        mean_prediction = tree_predictions.mean(axis=0)
        std_per_output = tree_predictions.std(axis=0)

        lane_predictions = {
            lane_id: self._build_lane_prediction(
                lane_id, mean_prediction, std_per_output
            )
            for lane_id in EXPECTED_LANE_IDS
        }

        return TrafficPrediction(
            reference_time=features.simulation_time,
            prediction_horizon_seconds=PREDICTION_HORIZON_SECONDS,
            lane_predictions=MappingProxyType(lane_predictions),
        )

    def _collect_tree_predictions(self, input_row: np.ndarray) -> np.ndarray:
        """
        Collect every individual tree's prediction for input_row in a
        single pass, using each tree's low-level, compiled tree_.predict()
        directly rather than the higher-level, per-call-validated
        tree.predict() or the ensemble's own joblib-dispatched predict().

        input_row must already be a (1, n_features) np.float32,
        C-contiguous array, see predict() above, this method does not
        re-validate or re-convert it, to avoid paying that cost per tree.

        Returns
        -------
        np.ndarray
            Shape (n_estimators, n_outputs), one row per tree.
        """
        estimators = self._model.estimators_
        predictions = np.empty((len(estimators), TARGET_VECTOR_LENGTH))
        for i, tree in enumerate(estimators):
            # tree_.predict() returns shape (1, n_outputs, 1) on the
            # scikit-learn version this was verified against, .reshape(-1)
            # flattens any trailing singleton dimension safely regardless
            # of minor shape differences across versions, _verify_fast_path
            # (run once at construction) is what actually guards against a
            # genuine semantic change, not this reshape.
            predictions[i] = tree.tree_.predict(input_row)[0].reshape(-1)
        return predictions

    def _build_lane_prediction(
        self,
        lane_id: str,
        mean_prediction: np.ndarray,
        std_per_output: np.ndarray,
    ) -> LanePrediction:
        """
        Extract this lane's two output columns, using the shared
        feature_schema.lane_output_index() rather than re-deriving the
        column arithmetic locally.
        """
        vehicle_count_col, waiting_time_col = lane_output_index(lane_id)

        predicted_vehicle_count = float(mean_prediction[vehicle_count_col])
        predicted_waiting_time = float(mean_prediction[waiting_time_col])

        vehicle_count_confidence = self._calibrated_confidence(
            self._confidence(predicted_vehicle_count, std_per_output[vehicle_count_col]),
            "vehicle_count",
        )
        waiting_time_confidence = self._calibrated_confidence(
            self._confidence(predicted_waiting_time, std_per_output[waiting_time_col]),
            "average_waiting_time",
        )
        vehicle_count_weight = self._target_weights.get("vehicle_count", 0.5)
        waiting_time_weight = self._target_weights.get("average_waiting_time", 0.5)
        confidence = (
            vehicle_count_confidence * vehicle_count_weight
            + waiting_time_confidence * waiting_time_weight
        )

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
        prediction yields higher confidence. The denominator is floored
        at 1.0 to avoid a near-zero mean prediction producing an
        artificially extreme confidence value.

        This is the raw score, unchanged since it was first written.
        See _calibrated_confidence() for the optional post-hoc
        remapping added in the second training milestone - this method
        itself is not being replaced, only optionally adjusted after
        the fact.
        """
        denominator = max(abs(mean_value), 1.0)
        return float(max(0.0, 100.0 - (std_value / denominator) * 100.0))

    def _calibrated_confidence(self, raw_confidence: float, target_name: str) -> float:
        """
        Apply this predictor's fitted calibrator for target_name to a
        raw _confidence() score, if one was loaded (see from_path() and
        ml/training/fit_confidence_calibration.py). Returns
        raw_confidence unchanged if no calibrator is available for this
        target_name - this is the fallback path every MLPredictor used
        before calibration existed, and still the behaviour for any
        model that has not had a calibrator fit for it.
        """
        calibrator = self._confidence_calibrators.get(target_name)
        if calibrator is None:
            return raw_confidence
        return float(calibrator.predict([raw_confidence])[0])