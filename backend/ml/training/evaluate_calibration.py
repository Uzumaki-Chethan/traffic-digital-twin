"""
evaluate_calibration.py
=========================
Answers a different question than train.py's MAE metrics: not "how
accurate is the model" but "is the model's own confidence score
trustworthy" - does a high confidence prediction actually tend to be
more accurate than a low confidence one, or is confidence just a
number that happens to be high on familiar scenarios and low on
unfamiliar ones regardless of whether the prediction itself is any
worse?

Replicates MLPredictor's exact, real confidence formula (see
MLPredictor._confidence and _build_lane_prediction) against the
trained model's own estimators_, rather than approximating it, so this
evaluates the actual signal the system will show a user, not a proxy
for it. Read-only: loads an already-trained model and already-built
datasets, computes nothing that changes either.

If ml/trained_models/confidence_calibrators.joblib exists (see
ml/training/fit_confidence_calibration.py), this script automatically
shows the calibration curve BOTH before and after calibration is
applied, so the effect of calibration is directly visible in one run
rather than requiring two separate before/after invocations. If that
file does not exist, only the raw (uncalibrated) view is shown, exactly
as this script behaved before calibration existed.

Three views when calibration is available (two otherwise), all
requested explicitly because a high average confidence number is not
the same claim as a trustworthy one:

1. Calibration curve: bin every (row, lane, target) confidence value
   into deciles, report the mean actual absolute error within each
   bin. A trustworthy confidence score produces a monotonically
   decreasing error as confidence rises - if the 90-100% confidence
   bin has worse error than the 40-50% bin, the score is actively
   misleading, not just imprecise.
2. Per-scenario summary: mean confidence vs. mean MAE for every
   scenario present in the evaluation set (light, balanced, heavy,
   every directional-heavy variant, normal_traffic, rush_hour,
   accident, rain, emergency_response, extreme), so a low-confidence
   scenario can be checked against whether its error is actually
   higher, confirming the low confidence is earned, not just an
   artifact of that scenario being less-sampled.

Usage
-----
    cd backend
    python -m ml.training.evaluate_calibration
    python -m ml.training.evaluate_calibration --dataset held_out
"""

import argparse
import csv
import logging
import os
from typing import Dict, List, Tuple

import joblib
import numpy as np

from ml.feature_schema import (
    EXPECTED_LANE_IDS,
    FEATURE_VECTOR_LENGTH,
    TARGET_VECTOR_LENGTH,
    lane_output_index,
)
from ml.training.config import TrainingConfig

logger = logging.getLogger(__name__)

_CONFIDENCE_BIN_EDGES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]


def _load_dataset(path: str) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """Same column-discovery logic as train.py._load_dataset, kept
    independent (not imported) since this module intentionally has no
    dependency on train.py - it only needs a fitted model and a
    dataset, not the training entry point itself."""
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise ValueError("Dataset at {} has no rows.".format(path))

    feature_columns = [
        name for name in rows[0].keys()
        if name not in ("run_id", "scenario_name", "seed", "simulation_time", "target_time")
        and "__target__" not in name
    ]
    target_columns = [name for name in rows[0].keys() if "__target__" in name]

    if len(feature_columns) != FEATURE_VECTOR_LENGTH or len(target_columns) != TARGET_VECTOR_LENGTH:
        raise ValueError(
            "Dataset at {} does not match the current feature_schema "
            "({} feature cols, {} target cols found; expected {} and {}).".format(
                path, len(feature_columns), len(target_columns),
                FEATURE_VECTOR_LENGTH, TARGET_VECTOR_LENGTH,
            )
        )

    X = np.array([[float(row[col]) for col in feature_columns] for row in rows])
    Y = np.array([[float(row[col]) for col in target_columns] for row in rows])
    scenario_names = [row["scenario_name"] for row in rows]
    return X, Y, scenario_names


def _tree_predictions(model, X: np.ndarray) -> np.ndarray:
    """
    Shape (n_estimators, n_rows, n_outputs). Uses each tree's ordinary
    .predict(), not MLPredictor's low-level tree_.predict() fast path -
    that optimization exists for per-request production latency, this
    is a one-time offline evaluation over a whole dataset at once,
    where the ordinary API is simpler and the performance difference is
    irrelevant.
    """
    return np.stack([tree.predict(X) for tree in model.estimators_], axis=0)


def _confidence_from_spread(mean_value: np.ndarray, std_value: np.ndarray) -> np.ndarray:
    """
    Exact reproduction of MLPredictor._confidence, vectorized. Kept
    numerically identical on purpose - this must evaluate the real
    formula the running system uses, not a stand-in for it.
    """
    denominator = np.maximum(np.abs(mean_value), 1.0)
    return np.maximum(0.0, 100.0 - (std_value / denominator) * 100.0)


def _per_lane_confidence(confidence_per_output: np.ndarray, target_weights=None) -> np.ndarray:
    """
    confidence_per_output: (n_rows, TARGET_VECTOR_LENGTH). Returns
    (n_rows, len(EXPECTED_LANE_IDS)): weighted combination of the
    vehicle_count and waiting_time confidence for each lane, matching
    MLPredictor._build_lane_prediction's own combination exactly - a
    plain 50/50 average when target_weights is None (matching
    MLPredictor's own fallback when no weights were fit), or the
    measured, correlation-based weights when provided.
    """
    weights = target_weights or {}
    vehicle_count_weight = weights.get("vehicle_count", 0.5)
    waiting_time_weight = weights.get("average_waiting_time", 0.5)

    n_rows = confidence_per_output.shape[0]
    lane_confidence = np.empty((n_rows, len(EXPECTED_LANE_IDS)))
    for lane_index, lane_id in enumerate(EXPECTED_LANE_IDS):
        vehicle_count_col, waiting_time_col = lane_output_index(lane_id)
        lane_confidence[:, lane_index] = (
            confidence_per_output[:, vehicle_count_col] * vehicle_count_weight
            + confidence_per_output[:, waiting_time_col] * waiting_time_weight
        )
    return lane_confidence


def _calibration_table(confidence_flat: np.ndarray, error_flat: np.ndarray) -> List[Dict[str, float]]:
    """
    Bin (confidence, error) pairs into deciles and report mean error and
    row count per bin, plus whether the trend is monotonically
    decreasing (higher confidence -> lower error) as an explicit,
    easy-to-check boolean rather than something the reader has to infer
    from a table.
    """
    table = []
    for low, high in zip(_CONFIDENCE_BIN_EDGES[:-1], _CONFIDENCE_BIN_EDGES[1:]):
        is_last_bin = high == _CONFIDENCE_BIN_EDGES[-1]
        mask = (confidence_flat >= low) & (
            (confidence_flat <= high) if is_last_bin else (confidence_flat < high)
        )
        count = int(mask.sum())
        mean_error = float(error_flat[mask].mean()) if count > 0 else float("nan")
        table.append({
            "confidence_bin": "[{}, {}{}".format(low, high, "]" if is_last_bin else ")"),
            "row_count": count,
            "mean_absolute_error": mean_error,
        })
    return table


def _is_monotonically_decreasing(table: List[Dict[str, float]]) -> bool:
    errors = [row["mean_absolute_error"] for row in table if row["row_count"] > 0]
    return all(errors[i] >= errors[i + 1] for i in range(len(errors) - 1))


def _load_calibrators():
    calibrators_path = os.path.join(TrainingConfig.MODEL_OUTPUT_DIR, "confidence_calibrators.joblib")
    if not os.path.isfile(calibrators_path):
        return None, None
    try:
        saved = joblib.load(calibrators_path)
        return saved.get("calibrators", {}), saved.get("target_weights", {})
    except Exception:
        logger.warning("Found %s but could not load it, showing raw confidence only.", calibrators_path)
        return None, None


def evaluate_calibration(dataset_path: str) -> None:
    logger.info("Loading model from %s...", TrainingConfig.MODEL_OUTPUT_PATH)
    model = joblib.load(TrainingConfig.MODEL_OUTPUT_PATH)

    calibrators, target_weights = _load_calibrators()
    if calibrators is not None:
        logger.info("Found confidence_calibrators.joblib - showing raw AND calibrated views.")
        if target_weights:
            logger.info("Target weights for combined confidence: %s", target_weights)
    else:
        logger.info("No confidence_calibrators.joblib found - showing raw (uncalibrated) view only.")

    logger.info("Loading dataset from %s...", dataset_path)
    X, Y, scenario_names = _load_dataset(dataset_path)
    logger.info("Loaded %d rows across %d scenario(s).", len(X), len(set(scenario_names)))

    logger.info("Collecting per-tree predictions (n_estimators=%d)...", len(model.estimators_))
    tree_preds = _tree_predictions(model, X)  # (n_estimators, n_rows, n_outputs)
    mean_pred = tree_preds.mean(axis=0)        # (n_rows, n_outputs)
    std_pred = tree_preds.std(axis=0)          # (n_rows, n_outputs)

    confidence_per_output = _confidence_from_spread(mean_pred, std_pred)  # (n_rows, n_outputs)
    error_per_output = np.abs(Y - mean_pred)                              # (n_rows, n_outputs)

    # If calibrators are available, this becomes the CALIBRATED
    # confidence, per output column - matching exactly what a live
    # MLPredictor loaded from the same model directory would actually
    # return, not just the raw formula in isolation.
    display_confidence_per_output = confidence_per_output.copy()

    # ===== Overall calibration curve, per output-column type, raw then calibrated =====
    for target_index, target_name in enumerate(("vehicle_count", "average_waiting_time")):
        columns = [lane_output_index(lane_id)[target_index] for lane_id in EXPECTED_LANE_IDS]
        conf_flat = confidence_per_output[:, columns].flatten()
        err_flat = error_per_output[:, columns].flatten()
        table = _calibration_table(conf_flat, err_flat)

        logger.info("")
        logger.info("=== Calibration curve (RAW): %s ===", target_name)
        logger.info("%-14s %10s %20s", "confidence", "n rows", "mean abs error")
        for row in table:
            logger.info("%-14s %10d %20.4f", row["confidence_bin"], row["row_count"], row["mean_absolute_error"])
        monotonic = _is_monotonically_decreasing(table)
        correlation_raw = float(np.corrcoef(conf_flat, err_flat)[0, 1])
        logger.info(
            "Monotonically decreasing error as confidence rises: %s%s",
            monotonic,
            "" if monotonic else "  <-- confidence is NOT reliably trustworthy for this target",
        )
        logger.info("Pearson correlation (raw): %.4f", correlation_raw)

        if calibrators is not None and target_name in calibrators:
            calibrated_flat = calibrators[target_name].predict(conf_flat)
            display_confidence_per_output[:, columns] = calibrated_flat.reshape(
                confidence_per_output[:, columns].shape
            )

            table_calibrated = _calibration_table(calibrated_flat, err_flat)
            logger.info("")
            logger.info("=== Calibration curve (CALIBRATED): %s ===", target_name)
            logger.info("%-14s %10s %20s", "confidence", "n rows", "mean abs error")
            for row in table_calibrated:
                logger.info("%-14s %10d %20.4f", row["confidence_bin"], row["row_count"], row["mean_absolute_error"])
            monotonic_calibrated = _is_monotonically_decreasing(table_calibrated)
            correlation_calibrated = float(np.corrcoef(calibrated_flat, err_flat)[0, 1])
            logger.info(
                "Monotonically decreasing error as confidence rises: %s%s",
                monotonic_calibrated,
                "" if monotonic_calibrated else "  <-- still not reliably trustworthy after calibration",
            )
            logger.info("Pearson correlation (calibrated): %.4f", correlation_calibrated)

    lane_confidence = _per_lane_confidence(display_confidence_per_output, target_weights)  # (n_rows, n_lanes)

    # ===== Per-scenario: mean confidence vs mean error =====
    logger.info("")
    logger.info(
        "=== Per-scenario: mean lane confidence (%s) vs mean lane error ===",
        "calibrated" if calibrators is not None else "raw",
    )
    logger.info("%-22s %10s %14s %16s", "scenario", "n rows", "mean conf.", "mean abs err.")
    scenario_array = np.array(scenario_names)
    # Lane-level error: mean of vehicle_count and waiting_time absolute
    # error per lane, matching how lane_confidence itself is averaged.
    lane_error = np.empty_like(lane_confidence)
    for lane_index, lane_id in enumerate(EXPECTED_LANE_IDS):
        vehicle_count_col, waiting_time_col = lane_output_index(lane_id)
        lane_error[:, lane_index] = (
            error_per_output[:, vehicle_count_col] + error_per_output[:, waiting_time_col]
        ) / 2.0

    for scenario_name in sorted(set(scenario_names)):
        mask = scenario_array == scenario_name
        mean_conf = float(lane_confidence[mask].mean())
        mean_err = float(lane_error[mask].mean())
        logger.info("%-22s %10d %14.2f %16.4f", scenario_name, int(mask.sum()), mean_conf, mean_err)

    # ===== Overall correlation: does higher confidence predict lower error? =====
    conf_flat_all = lane_confidence.flatten()
    err_flat_all = lane_error.flatten()
    correlation = float(np.corrcoef(conf_flat_all, err_flat_all)[0, 1])
    logger.info("")
    logger.info(
        "Overall Pearson correlation between lane confidence and lane error: %.4f "
        "(expect clearly negative for a trustworthy confidence score - "
        "higher confidence should coincide with lower error)",
        correlation,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Evaluate whether the trained model's confidence score "
                     "actually tracks real prediction error."
    )
    parser.add_argument(
        "--dataset", choices=("test", "held_out"), default="test",
        help="Which built dataset to evaluate against (default: test).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    path = (
        TrainingConfig.TEST_DATASET_PATH if args.dataset == "test"
        else TrainingConfig.HELD_OUT_DATASET_PATH
    )
    evaluate_calibration(path)