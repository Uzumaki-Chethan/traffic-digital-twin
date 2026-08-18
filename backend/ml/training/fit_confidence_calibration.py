"""
fit_confidence_calibration.py
================================
Fits a post-hoc calibration mapping from MLPredictor's raw tree-spread
confidence score to a value that actually tracks real prediction error,
using isotonic regression - a standard, well-established technique for
exactly this problem, not a bespoke fix.

Why this exists: evaluate_calibration.py's calibration curve showed the
raw confidence score is only reliably ordered at its extremes (>90% and
<10%) - error was NOT monotonically decreasing as confidence rose in
between (e.g. the [60,70) bin had worse mean error than the [0,10)
bin), and the overall Pearson correlation was weak (-0.11). The raw
formula (ml/ml_predictor.py's _confidence) is NOT being replaced or
retrained - it is a working, verified formula for what it actually
computes (tree-prediction spread relative to magnitude). This script
instead learns a monotonic REMAPPING from that raw score to a
calibrated one, fit entirely offline, against the TEST set only -
held_out's rows are never touched by this or anything else
training-related, keeping the seed-level generalization claim clean.

Two calibrators are fit independently, one for vehicle_count confidence
and one for average_waiting_time confidence, because
evaluate_calibration.py's two calibration curves have visibly different
shapes - a single shared calibrator would average over that difference
rather than correct for it.

Calibration target for a given (row, lane) raw confidence value: 100
minus that sample's error-percentile-rank among all samples of the same
target type in the test set (rank 0 = lowest error -> target 100, rank
100 = highest error -> target 0), which is, by construction, perfectly
rank-correlated with actual error. Isotonic regression then fits the
best monotonic (non-decreasing) function from raw confidence to that
target, so the result is guaranteed monotonic (unlike the raw score),
while still reflecting genuine structure in how raw confidence relates
to error wherever that relationship really is informative.

Output: ml/trained_models/confidence_calibrators.joblib, containing
{"vehicle_count": IsotonicRegression, "average_waiting_time":
IsotonicRegression}. MLPredictor.from_path() looks for this file
automatically, next to the model, and applies it if present. If this
file is absent (e.g. an older model that hasn't had this fit yet, or a
fresh model before this script has been run), MLPredictor behaves
exactly as before, fully uncalibrated - nothing about predict() or the
model file itself changes, this is a strictly additive, optional layer.

Usage
-----
    cd backend
    python -m ml.training.fit_confidence_calibration
"""

import logging
import math
import os

import joblib
import numpy as np
from sklearn.isotonic import IsotonicRegression

from ml.feature_schema import EXPECTED_LANE_IDS, TARGET_FEATURE_NAMES, lane_output_index
from ml.training.config import TrainingConfig
from ml.training.evaluate_calibration import _confidence_from_spread, _load_dataset, _tree_predictions

logger = logging.getLogger(__name__)

CALIBRATORS_PATH = os.path.join(TrainingConfig.MODEL_OUTPUT_DIR, "confidence_calibrators.joblib")

# Floor on a target's weight in the combined per-lane confidence
# average, see the weighting explanation in fit_calibration(). 0.05
# means even a target with literally zero measured correlation still
# contributes at least 5% of the combined score, never fully silenced.
_MIN_TARGET_WEIGHT = 0.05


def _percentile_rank(values: np.ndarray) -> np.ndarray:
    """
    0 for the lowest value, 100 for the highest, linearly spread via
    plain rank / (n-1) * 100. Deliberately not scipy's rankdata (which
    handles tied values by averaging their ranks): pulling in scipy as
    a dependency for a training-time-only offline fitting script, for a
    tie-handling refinement that barely matters against real,
    continuously-valued error scores, is not a trade worth making here.
    """
    n = len(values)
    order = np.argsort(values)
    ranks = np.empty(n)
    ranks[order] = np.arange(n)
    return ranks / max(n - 1, 1) * 100.0


def fit_calibration() -> None:
    logger.info("Loading model from %s...", TrainingConfig.MODEL_OUTPUT_PATH)
    model = joblib.load(TrainingConfig.MODEL_OUTPUT_PATH)

    logger.info("Loading TEST dataset (not held-out - keeping held-out untouched)...")
    X, Y, _ = _load_dataset(TrainingConfig.TEST_DATASET_PATH)
    logger.info("Loaded %d rows.", len(X))

    logger.info("Collecting per-tree predictions (n_estimators=%d)...", len(model.estimators_))
    tree_preds = _tree_predictions(model, X)
    mean_pred = tree_preds.mean(axis=0)
    std_pred = tree_preds.std(axis=0)
    raw_confidence = _confidence_from_spread(mean_pred, std_pred)  # (n_rows, n_outputs)
    error = np.abs(Y - mean_pred)

    calibrators = {}
    correlations = {}
    for target_index, target_name in enumerate(TARGET_FEATURE_NAMES):
        columns = [lane_output_index(lane_id)[target_index] for lane_id in EXPECTED_LANE_IDS]
        conf_flat = raw_confidence[:, columns].flatten()
        err_flat = error[:, columns].flatten()

        calibration_target = 100.0 - _percentile_rank(err_flat)

        calibrator = IsotonicRegression(y_min=0.0, y_max=100.0, increasing=True, out_of_bounds="clip")
        calibrator.fit(conf_flat, calibration_target)
        calibrators[target_name] = calibrator

        calibrated_flat = calibrator.predict(conf_flat)
        correlations[target_name] = float(np.corrcoef(calibrated_flat, err_flat)[0, 1])

        logger.info(
            "Fit calibrator for '%s' on %d (row, lane) samples (calibrated "
            "confidence-vs-error correlation: %.4f).",
            target_name, len(conf_flat), correlations[target_name],
        )

    # Weight each target's contribution to the combined per-lane
    # confidence MLPredictor reports by how much real information its
    # OWN calibrated confidence actually carries about real error -
    # measured, not assumed. A flat 50/50 average (the behaviour before
    # this existed) silently dilutes an informative target with an
    # uninformative one; weighting by |correlation| means a target
    # whose confidence turns out to carry near-zero signal (this
    # happened for vehicle_count on the first real dataset this was run
    # against - raw correlation 0.0009, essentially noise) contributes
    # correspondingly little to the combined score, while a target that
    # calibrated well (average_waiting_time reached -0.32) dominates it
    # appropriately. Floored at _MIN_TARGET_WEIGHT rather than allowed
    # to reach exactly zero, so a target that happens to land near-zero
    # correlation on one particular evaluation run still contributes a
    # token amount rather than being entirely silenced by what could
    # partly be that run's own sampling noise.
    # max(floor, abs(c)) alone is not safe here: if a target's
    # calibrated confidence ends up with ~zero variance (possible for a
    # target with no real learnable signal at all, where the isotonic
    # fit collapses toward a near-constant output), np.corrcoef divides
    # by a near-zero stddev and returns nan - and Python's max() with a
    # nan operand is order-dependent, not a safe way to apply a floor.
    # Handled explicitly instead: nan is treated the same as "no
    # measurable signal", which is what it actually represents here.
    abs_correlations = {}
    for name, value in correlations.items():
        abs_correlations[name] = (
            _MIN_TARGET_WEIGHT if math.isnan(value) else max(_MIN_TARGET_WEIGHT, abs(value))
        )
    total_weight = sum(abs_correlations.values())
    target_weights = {name: value / total_weight for name, value in abs_correlations.items()}
    logger.info("Target weights for the combined per-lane confidence average:")
    for name, weight in target_weights.items():
        logger.info("  %-22s weight=%.3f (from |correlation|=%.4f)", name, weight, abs(correlations[name]))

    TrainingConfig.ensure_output_directories()
    joblib.dump({"calibrators": calibrators, "target_weights": target_weights}, CALIBRATORS_PATH)
    logger.info("Saved calibrators and target weights to %s", CALIBRATORS_PATH)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    fit_calibration()