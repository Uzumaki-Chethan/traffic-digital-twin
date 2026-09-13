"""
train.py
=========
Loads the built train/test/held-out datasets, fits a single native
multi-output RandomForestRegressor (see the MODEL ARCHITECTURE CONTRACT
in ml/ml_predictor.py for why it must be native multi-output, not a
MultiOutputRegressor wrapper), evaluates it on both the chronological
test set and the fully held-out scenario, and writes the trained model
plus a metadata JSON file MLPredictor can eventually use to validate
schema compatibility.

The model is trained in RESIDUAL mode (feature_schema.TARGET_MODE_RESIDUAL):
the label a tree fits is (target - the same field's current value on
the same lane), and every evaluation here adds that current value back
and clips at zero before computing MAE, so the numbers reported are for
the prediction the Decision Engine actually receives. See the
TARGET_MODE_* note in ml/feature_schema.py for the measured reason.

The only module in this package that imports scikit-learn's training
APIs and joblib for saving (as opposed to ml_predictor.py, which only
ever loads).
"""

import csv
import json
import logging
import platform
from datetime import datetime, timezone
from typing import Dict, List, Tuple

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

from ml.feature_schema import (
    EXPECTED_LANE_IDS,
    FEATURE_VECTOR_LENGTH,
    PREDICTION_HORIZON_SECONDS,
    TARGET_FEATURE_NAMES,
    TARGET_MODE_RESIDUAL,
    TARGET_VECTOR_LENGTH,
    lane_output_index,
)
from ml.training.config import TrainingConfig
from ml.training.scenario_manifest import SCENARIOS

logger = logging.getLogger(__name__)


def _load_dataset(path: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[str]]:
    """
    Read a built dataset CSV and split it into an X matrix, a Y matrix,
    a B matrix (the persistence base: each target field's CURRENT value
    on the same lane, in target-vector order - what a residual-mode
    model's output is added to), and the list of scenario_name values
    per row (used for per-scenario evaluation breakdowns).

    Feature and target columns are located by the naming convention
    dataset_generator._row_header() writes them with, rather than by
    fixed column position, so this stays correct even if identity/timing
    columns are ever reordered or added to.
    """
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    if not rows:
        raise ValueError("Dataset at {} has no rows.".format(path))

    feature_columns = [
        name for name in rows[0].keys()
        if name not in ("run_id", "scenario_name", "seed", "simulation_time", "target_time")
        and "__target__" not in name
    ]
    target_columns = [name for name in rows[0].keys() if "__target__" in name]

    if len(feature_columns) != FEATURE_VECTOR_LENGTH:
        raise ValueError(
            "Dataset at {} has {} feature columns, expected {} "
            "(feature_schema.FEATURE_VECTOR_LENGTH). The dataset does not "
            "match the current feature_schema.".format(
                path, len(feature_columns), FEATURE_VECTOR_LENGTH
            )
        )
    if len(target_columns) != TARGET_VECTOR_LENGTH:
        raise ValueError(
            "Dataset at {} has {} target columns, expected {} "
            "(feature_schema.TARGET_VECTOR_LENGTH).".format(
                path, len(target_columns), TARGET_VECTOR_LENGTH
            )
        )

    X = np.array([[float(row[col]) for col in feature_columns] for row in rows])
    Y = np.array([[float(row[col]) for col in target_columns] for row in rows])
    scenario_names = [row["scenario_name"] for row in rows]

    # The CSV column "<lane>__<field>" is the current value of the same
    # field "<lane>__target__<field>" is the future value of. Same
    # alignment feature_schema.current_values_as_target_vector() gives
    # MLPredictor from a live TrafficFeatures snapshot.
    base_columns = [
        "{}__{}".format(lane_id, target_name)
        for lane_id in EXPECTED_LANE_IDS
        for target_name in TARGET_FEATURE_NAMES
    ]
    B = np.array([[float(row[col]) for col in base_columns] for row in rows])

    return X, Y, B, scenario_names


def _predict_absolute(model, X: np.ndarray, B: np.ndarray) -> np.ndarray:
    """
    The prediction as the Decision Engine will see it: the model's
    residual output plus the persistence base, clipped at zero (a lane
    cannot hold a negative number of vehicles or a negative wait).
    Every MAE in this module is computed on this, never on the raw
    residual, so the reported numbers mean what they appear to mean.
    """
    return np.clip(model.predict(X) + B, 0.0, None)


def _evaluate(model, X: np.ndarray, Y: np.ndarray, B: np.ndarray) -> Dict[str, float]:
    """
    Compute mean absolute error, overall and broken down per target type
    (vehicle count vs waiting time) across all lanes, and per lane. A
    single global MAE can hide a model that is excellent on straight
    lanes and poor on right-turn lanes (which see less green time and
    therefore fewer training examples), reporting the breakdown makes
    that kind of failure visible instead of averaging it away.
    """
    predictions = _predict_absolute(model, X, B)

    metrics: Dict[str, float] = {
        "overall_mae": float(mean_absolute_error(Y, predictions)),
    }

    for target_index, target_name in enumerate(TARGET_FEATURE_NAMES):
        columns = [
            lane_output_index(lane_id)[target_index] for lane_id in EXPECTED_LANE_IDS
        ]
        metrics["{}_mae".format(target_name)] = float(
            mean_absolute_error(Y[:, columns], predictions[:, columns])
        )

    for lane_id in EXPECTED_LANE_IDS:
        vehicle_count_col, waiting_time_col = lane_output_index(lane_id)
        metrics["{}_mae".format(lane_id)] = float(
            mean_absolute_error(
                Y[:, [vehicle_count_col, waiting_time_col]],
                predictions[:, [vehicle_count_col, waiting_time_col]],
            )
        )

    return metrics


def _evaluate_per_scenario(model, X: np.ndarray, Y: np.ndarray, B: np.ndarray, scenario_names: List[str]) -> Dict[str, float]:
    """
    Overall MAE broken down per scenario present in the given dataset,
    so a model that performs well on average but poorly on, for example,
    the directional-heavy scenarios, is visible rather than hidden.
    """
    metrics: Dict[str, float] = {}
    unique_scenarios = sorted(set(scenario_names))
    scenario_array = np.array(scenario_names)

    for scenario_name in unique_scenarios:
        mask = scenario_array == scenario_name
        predictions = _predict_absolute(model, X[mask], B[mask])
        metrics["{}_mae".format(scenario_name)] = float(
            mean_absolute_error(Y[mask], predictions)
        )

    return metrics


def _compute_sample_weights(scenario_names: List[str]) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    Inverse-frequency sample weights, one per training row, so every
    scenario contributes proportionally to what the ensemble learns
    regardless of how many rows it happens to have.

    Added in the second training milestone specifically because the
    features_to_vector empty-lane bugfix (see feature_schema.py) meant
    repairing the raw datasets by dropping malformed rows - and that
    drop rate varies a lot by scenario (a scenario with more idle lanes
    for more of its run, e.g. a directional-heavy scenario where 9 of
    12 lanes sit at light demand the whole time, loses proportionally
    more rows than one with almost always-active lanes, e.g. rain,
    where slower-moving traffic keeps lanes occupied longer). Left
    uncorrected, RandomForestRegressor would fit best to whatever
    scenario happens to have the most surviving rows, which has nothing
    to do with which scenario matters most to learn.

    A row's weight is (mean row count across all scenarios) / (that
    row's own scenario's row count), so an average-sized scenario gets
    weight ~1.0, an underrepresented one gets weight > 1.0, and an
    overrepresented one gets weight < 1.0 - capped at
    _SAMPLE_WEIGHT_CAP so a pathologically small scenario can't end up
    dominating the loss function instead of just being fairly
    represented in it.
    """
    scenario_array = np.array(scenario_names)
    unique_scenarios, counts = np.unique(scenario_array, return_counts=True)
    counts_by_scenario = dict(zip(unique_scenarios, counts))
    mean_count = float(np.mean(counts))

    weight_by_scenario = {
        name: min(_SAMPLE_WEIGHT_CAP, mean_count / count)
        for name, count in counts_by_scenario.items()
    }
    weights = np.array([weight_by_scenario[name] for name in scenario_names])
    return weights, weight_by_scenario


# Ceiling on any single scenario's inverse-frequency weight multiplier,
# see _compute_sample_weights. 3.0 is generous headroom above the
# largest actual imbalance seen so far (~2.4x, emergency_response vs
# heavy) without being so high that a future, much smaller scenario
# could dominate the loss on row count alone.
_SAMPLE_WEIGHT_CAP = 3.0


def train_and_evaluate() -> None:
    """
    The full training entry point: load data, fit the model, evaluate on
    both the chronological test set and the held-out scenario, and
    persist the model plus metadata.
    """
    TrainingConfig.ensure_output_directories()

    logger.info("Loading training dataset...")
    X_train, Y_train, B_train, train_scenarios = _load_dataset(TrainingConfig.TRAIN_DATASET_PATH)
    logger.info("Loaded %d training rows.", len(X_train))

    sample_weights, weight_by_scenario = _compute_sample_weights(train_scenarios)
    logger.info("Per-scenario sample weights (inverse-frequency, capped at %.1fx):", _SAMPLE_WEIGHT_CAP)
    for name, weight in sorted(weight_by_scenario.items(), key=lambda kv: -kv[1]):
        logger.info("  %-22s weight=%.3f", name, weight)

    logger.info("Loading chronological test dataset...")
    X_test, Y_test, B_test, test_scenarios = _load_dataset(TrainingConfig.TEST_DATASET_PATH)
    logger.info("Loaded %d test rows.", len(X_test))

    logger.info("Loading held-out scenario dataset...")
    X_held_out, Y_held_out, B_held_out, held_out_scenarios = _load_dataset(
        TrainingConfig.HELD_OUT_DATASET_PATH
    )
    logger.info("Loaded %d held-out rows.", len(X_held_out))

    logger.info(
        "Fitting RandomForestRegressor (n_estimators=%d, random_state=%d)...",
        TrainingConfig.MODEL_N_ESTIMATORS, TrainingConfig.MODEL_RANDOM_STATE,
    )
    # A single native multi-output regressor, fit directly on a 2D Y.
    # Deliberately NOT wrapped in MultiOutputRegressor, see the MODEL
    # ARCHITECTURE CONTRACT in ml/ml_predictor.py for why that would
    # silently break the confidence calculation at inference time.
    model = RandomForestRegressor(
        n_estimators=TrainingConfig.MODEL_N_ESTIMATORS,
        max_depth=TrainingConfig.MODEL_MAX_DEPTH,
        min_samples_leaf=TrainingConfig.MODEL_MIN_SAMPLES_LEAF,
        min_samples_split=TrainingConfig.MODEL_MIN_SAMPLES_SPLIT,
        max_features=TrainingConfig.MODEL_MAX_FEATURES,
        random_state=TrainingConfig.MODEL_RANDOM_STATE,
        n_jobs=-1,
    )
    # Residual labels: what changes over the horizon, not the level.
    model.fit(X_train, Y_train - B_train, sample_weight=sample_weights)

    logger.info("Evaluating on chronological test set...")
    test_metrics = _evaluate(model, X_test, Y_test, B_test)
    test_metrics_per_scenario = _evaluate_per_scenario(model, X_test, Y_test, B_test, test_scenarios)

    logger.info("Evaluating on held-out scenario...")
    held_out_metrics = _evaluate(model, X_held_out, Y_held_out, B_held_out)
    held_out_metrics_per_scenario = _evaluate_per_scenario(
        model, X_held_out, Y_held_out, B_held_out, held_out_scenarios
    )

    # Reference point for the reader of the metadata: the MAE of doing
    # nothing at all (persistence), on the same rows. A model that does
    # not beat this is not predicting.
    persistence_test_mae = float(mean_absolute_error(Y_test, B_test))
    persistence_held_out_mae = float(mean_absolute_error(Y_held_out, B_held_out))
    logger.info("Persistence baseline MAE: test %.4f, held-out %.4f",
                persistence_test_mae, persistence_held_out_mae)

    logger.info("Test set overall MAE: %.4f", test_metrics["overall_mae"])
    logger.info("Held-out scenario overall MAE: %.4f", held_out_metrics["overall_mae"])

    # compress=3: a 300-tree forest on ~28k rows is ~630 MB raw and
    # ~250 MB compressed, with byte-identical predictions. The file is
    # tracked through Git LFS (1 GB free storage / month, and every
    # teammate's clone downloads it), so size is not cosmetic here.
    # Load time is a one-off at startup; MLPredictor is unaffected.
    joblib.dump(model, TrainingConfig.MODEL_OUTPUT_PATH, compress=3)
    logger.info("Model saved to %s", TrainingConfig.MODEL_OUTPUT_PATH)

    metadata = {
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "sklearn_version": sklearn.__version__,
        "python_version": platform.python_version(),
        "model_type": type(model).__name__,
        "n_estimators": TrainingConfig.MODEL_N_ESTIMATORS,
        "random_state": TrainingConfig.MODEL_RANDOM_STATE,
        "target_mode": TARGET_MODE_RESIDUAL,
        "prediction_horizon_seconds": PREDICTION_HORIZON_SECONDS,
        "sampling_interval_seconds": TrainingConfig.SAMPLING_INTERVAL_SECONDS,
        "feature_vector_length": FEATURE_VECTOR_LENGTH,
        "target_vector_length": TARGET_VECTOR_LENGTH,
        "expected_lane_ids": list(EXPECTED_LANE_IDS),
        "scenarios_used": [s.name for s in SCENARIOS if s.name != TrainingConfig.HELD_OUT_SCENARIO_NAME],
        "held_out_scenario": TrainingConfig.HELD_OUT_SCENARIO_NAME,
        "training_row_count": len(X_train),
        "test_row_count": len(X_test),
        "held_out_row_count": len(X_held_out),
        "sample_weight_cap": _SAMPLE_WEIGHT_CAP,
        "sample_weight_by_scenario": weight_by_scenario,
        "persistence_baseline": {
            "test_mae": persistence_test_mae,
            "held_out_mae": persistence_held_out_mae,
        },
        "test_metrics": test_metrics,
        "test_metrics_per_scenario": test_metrics_per_scenario,
        "held_out_metrics": held_out_metrics,
        "held_out_metrics_per_scenario": held_out_metrics_per_scenario,
    }
    with open(TrainingConfig.MODEL_METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    logger.info("Metadata saved to %s", TrainingConfig.MODEL_METADATA_PATH)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    train_and_evaluate()