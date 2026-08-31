"""
config.py (training)
======================
Training-specific configuration. Deliberately a separate module from the
runtime backend/config.py, not an extension of it, training and runtime
serve different audiences (a developer running a training job locally,
versus the always-on runtime app), have different lifecycles (this file
changes every time a scenario is added, runtime config barely changes),
and mixing them would violate the same single-responsibility principle
this project already applies to every other module.

Nothing in this file is imported by app.py or by any runtime module.
"""

import os


class TrainingConfig:
    """Centralised configuration for the training pipeline."""

    # backend/ml/training/config.py -> three levels up is the project root
    PROJECT_ROOT = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )

    # Where the frozen network and per-scenario route/config files live.
    SUMO_NETWORK_PATH = os.path.join(
        PROJECT_ROOT, "sumo", "network", "intersection.net.xml"
    )
    SCENARIO_ROUTES_DIR = os.path.join(PROJECT_ROOT, "sumo", "routes", "scenarios")
    SCENARIO_CONFIGS_DIR = os.path.join(PROJECT_ROOT, "sumo", "config", "scenarios")

    # Where generated datasets live. Gitignored, fully reproducible from
    # the scenario manifest plus this config, so never hand-edited.
    DATASETS_DIR = os.path.join(PROJECT_ROOT, "datasets")
    RAW_RUNS_DIR = os.path.join(DATASETS_DIR, "raw")
    TRAIN_DATASET_PATH = os.path.join(DATASETS_DIR, "master_dataset_train.csv")
    TEST_DATASET_PATH = os.path.join(DATASETS_DIR, "master_dataset_test.csv")
    # Renamed from held_out_extreme.csv in the second training milestone:
    # this file now also holds the seed-level held-out runs from
    # accident and emergency_response (see dataset_builder.py and
    # scenario_manifest.Scenario.held_out_seeds), not only the extreme
    # scenario, so a name implying "extreme only" would be misleading.
    HELD_OUT_DATASET_PATH = os.path.join(DATASETS_DIR, "held_out.csv")

    # Where the trained model and its metadata are written, matching the
    # path runtime Config.ML_MODEL_PATH already expects to find them at.
    MODEL_OUTPUT_DIR = os.path.join(PROJECT_ROOT, "backend", "ml", "trained_models")
    MODEL_OUTPUT_PATH = os.path.join(
        MODEL_OUTPUT_DIR, "random_forest_predictor.joblib"
    )
    MODEL_METADATA_PATH = os.path.join(
        MODEL_OUTPUT_DIR, "random_forest_predictor.metadata.json"
    )

    # How often, in simulated seconds, the data collector samples a
    # feature snapshot. SUMO's own step-length is 0.05s, sampling every
    # step would produce a dataset dominated by near-duplicate rows.
    SAMPLING_INTERVAL_SECONDS = 1.0

    # How much tolerance is allowed between the intended prediction
    # horizon and the actual elapsed simulation time between a paired
    # feature/target snapshot, before the pair is discarded rather than
    # silently mislabeled. See ml.feature_schema.PREDICTION_HORIZON_SECONDS
    # for the intended horizon itself, this module does not redefine it.
    HORIZON_TOLERANCE_SECONDS = 0.1

    # Fraction of each individual run's rows used for training, the
    # remainder used for testing. Applied per run, before concatenation,
    # never applied to the merged dataset directly, see dataset_builder.py.
    CHRONOLOGICAL_SPLIT_RATIO = 0.8

    # Which scenario is fully excluded from both training and the
    # chronological test split, reserved as an out-of-distribution
    # generalization check.
    HELD_OUT_SCENARIO_NAME = "extreme"

    # Fixed random_state for the trained model, for reproducibility.
    MODEL_RANDOM_STATE = 42
    # Raised 200 -> 300 in the second training milestone: more trees
    # means a smoother, more stable tree-spread estimate specifically
    # where confidence was weakest (heavy/extreme) - the confidence
    # score itself is noisier with fewer trees, independent of how much
    # data those trees were trained on.
    MODEL_N_ESTIMATORS = 300

    # Regularization added in the second training milestone. Previously
    # unset (sklearn defaults: max_depth=None, unlimited; max_features=1.0,
    # every feature considered at every split). Both defaults are a real
    # contributor to the low-confidence problem this milestone is fixing:
    # confidence is computed from tree-prediction spread (see
    # MLPredictor._confidence), and unconstrained trees with
    # max_features=1.0 tend toward similar, highly-fit splits in
    # well-sampled regions (light/balanced) but diverge sharply from each
    # other in sparsely-sampled regions (heavy/extreme/directional) where
    # each tree's bootstrap sample barely overlaps - that divergence
    # reads as "low confidence," but some of it is an artifact of
    # insufficiently-decorrelated trees, not only genuine data sparsity.
    #   MODEL_MAX_DEPTH: caps how deep any single tree can grow, so a
    #     tree can't chase noise all the way down to single-sample leaves
    #     in a thinly-covered region. 20 is generous for a 125-feature
    #     input (plenty of room for real structure) while still bounding
    #     worst-case overfit depth.
    #   MODEL_MIN_SAMPLES_LEAF: a leaf must represent at least this many
    #     training rows, a standard, documented RandomForestRegressor
    #     regularization lever, again aimed at the same sparse-region
    #     overfitting.
    #   MODEL_MIN_SAMPLES_SPLIT: an internal node needs at least this
    #     many samples before it's allowed to split at all - a
    #     complementary regularizer to MIN_SAMPLES_LEAF (this one gates
    #     splitting itself, the other gates the resulting leaf size),
    #     standard practice to set both rather than relying on either
    #     alone.
    #   MODEL_MAX_FEATURES: "sqrt" restores genuine per-split feature
    #     subsampling (sklearn's regressor default of 1.0 disables this,
    #     considering every feature at every split - if all trees see all
    #     features, they correlate more than a proper random forest
    #     should, which undermines the whole premise of using
    #     tree-disagreement as a confidence signal).
    MODEL_MAX_DEPTH = 20
    MODEL_MIN_SAMPLES_LEAF = 3
    MODEL_MIN_SAMPLES_SPLIT = 5
    MODEL_MAX_FEATURES = "sqrt"

    @classmethod
    def ensure_output_directories(cls) -> None:
        """
        Create every directory this pipeline writes into, if it does not
        already exist. Called once at the start of dataset generation
        and again before training, so neither step assumes the other has
        already run.
        """
        for directory in (
            cls.RAW_RUNS_DIR,
            cls.DATASETS_DIR,
            cls.MODEL_OUTPUT_DIR,
            cls.SCENARIO_ROUTES_DIR,
            cls.SCENARIO_CONFIGS_DIR,
        ):
            os.makedirs(directory, exist_ok=True)