# PROJECT ARCHITECTURE REPORT

Analysis-only report generated from repository inspection on 2026-08-06.
No files were modified, deleted, or generated beyond this report document.

---

## SECTION 1 — Project folder tree

```text
traffic-digital-twin/
├── .gitignore
├── README.md
├── requirements.txt
├── backend/
│   ├── app.py
│   ├── config.py
│   ├── requirements.txt
│   ├── database/
│   ├── decision_engine/
│   ├── digital_twin/
│   │   ├── __init__.py
│   │   └── digital_twin.py
│   ├── feature_engineering/
│   │   ├── __init__.py
│   │   └── feature_engineer.py
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── feature_schema.py
│   │   ├── ml_predictor.py
│   │   ├── trained_models/
│   │   └── training/
│   │       ├── config.py
│   │       ├── data_collector.py
│   │       ├── dataset_builder.py
│   │       ├── dataset_generator.py
│   │       ├── generate_scenario_files.py
│   │       ├── scenario_manifest.py
│   │       └── train.py
│   ├── models/
│   │   ├── __init__.py
│   │   ├── feature_models.py
│   │   ├── prediction_models.py
│   │   └── state_models.py
│   ├── performance/
│   ├── routes/
│   ├── services/
│   ├── signal_controller/
│   ├── traffic/
│   │   └── traci_manager.py
│   ├── traffic_adapter/
│   │   └── adapter.py
│   └── utils/
├── configs/
├── data/
├── datasets/
│   └── raw/
│       ├── balanced_seed1.csv
│       ├── balanced_seed2.csv
│       ├── balanced_seed3.csv
│       ├── heavy_seed1.csv
│       ├── light_seed1.csv
│       ├── light_seed2.csv
│       ├── light_seed3.csv
├── docs/
├── firmware/
├── frontend/
├── models/
├── scripts/
├── sumo/
│   ├── README.md
│   ├── config/
│   │   ├── intersection.sumocfg
│   │   ├── demo/
│   │   │   └── rush_hour.sumocfg
│   │   └── scenarios/
│   │       ├── balanced_seed1.sumocfg
│   │       ├── balanced_seed2.sumocfg
│   │       ├── balanced_seed3.sumocfg
│   │       ├── east_heavy_seed1.sumocfg
│   │       ├── east_heavy_seed2.sumocfg
│   │       ├── east_heavy_seed3.sumocfg
│   │       ├── extreme_seed1.sumocfg
│   │       ├── extreme_seed2.sumocfg
│   │       ├── heavy_seed1.sumocfg
│   │       ├── heavy_seed2.sumocfg
│   │       ├── heavy_seed3.sumocfg
│   │       ├── light_seed1.sumocfg
│   │       ├── light_seed2.sumocfg
│   │       ├── light_seed3.sumocfg
│   │       ├── north_heavy_seed1.sumocfg
│   │       ├── north_heavy_seed2.sumocfg
│   │       ├── north_heavy_seed3.sumocfg
│   │       ├── south_heavy_seed1.sumocfg
│   │       ├── south_heavy_seed2.sumocfg
│   │       ├── south_heavy_seed3.sumocfg
│   │       ├── west_heavy_seed1.sumocfg
│   │       ├── west_heavy_seed2.sumocfg
│   │       └── west_heavy_seed3.sumocfg
│   ├── environment/
│   │   ├── buildings.add.xml
│   │   └── roadside.add.xml
│   ├── gui/
│   │   ├── default_view.xml
│   │   └── demo_view.xml
│   ├── network/
│   │   ├── intersection.con.xml
│   │   ├── intersection.edg.xml
│   │   ├── intersection.net.xml
│   │   ├── intersection.nod.xml
│   │   ├── intersection.tll.xml
│   │   └── intersection.type.xml
│   ├── routes/
│   │   ├── intersection.rou.xml
│   │   └── scenarios/
│   │       ├── balanced.rou.xml
│   │       ├── east_heavy.rou.xml
│   │       ├── extreme.rou.xml
│   │       ├── heavy.rou.xml
│   │       ├── light.rou.xml
│   │       ├── north_heavy.rou.xml
│   │       ├── south_heavy.rou.xml
│   │       └── west_heavy.rou.xml
│   ├── scenarios/
│   │   └── demo/
│   │       └── rush_hour.rou.xml
│   └── vehicles/
│       └── vehicle_types.add.xml
└── tests/
    └── test_backend.py
```

---

## SECTION 2 — Source file inventory

### 1) backend/app.py
- Full path: backend/app.py
- Approximate size: 3,525 bytes
- Purpose: Runtime entry point that wires the simulation pipeline together and runs the SUMO/TraCI loop.
- Classes: none
- Functions: main()
- What imports it: tests reference it indirectly; runtime uses it as the main executable entry point.
- What it imports: Config, TraCIManager, TrafficAdapter, DigitalTwin, FeatureEngineer, MLPredictor
- Currently used: Yes, as the main runtime orchestration module.
- Appears unused: No, though it is not a web app and may not match the test expectations.
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: Mildly, because it contains temporary logging and graceful fallback behavior around missing models.

### 2) backend/config.py
- Full path: backend/config.py
- Approximate size: 3,520 bytes
- Purpose: Central runtime configuration and SUMO path resolution.
- Classes: Config
- Functions: get_sumo_binary(), validate()
- What imports it: backend/app.py
- What it imports: os, sumolib
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No, but it is conceptually similar to training config.
- Should probably remain: Yes
- Looks experimental: No

### 3) backend/traffic_adapter/adapter.py
- Full path: backend/traffic_adapter/adapter.py
- Approximate size: 6,320 bytes
- Purpose: Reads live SUMO state from TraCI and converts it into immutable dataclasses.
- Classes: TrafficAdapter
- Functions: get_current_state(), _extract_vehicle(), _extract_signal(), _build_lane_states()
- What imports it: backend/app.py, backend/ml/training/dataset_generator.py
- What it imports: logging, MappingProxyType, Dict, List, traci, models
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No, though it is tightly coupled to one TLS and current network topology.

### 4) backend/traffic/traci_manager.py
- Full path: backend/traffic/traci_manager.py
- Approximate size: 3,724 bytes
- Purpose: Owns the TraCI connection lifecycle and simulation stepping.
- Classes: TraCIManager
- Functions: __init__(), is_connected property, start(), run(), close()
- What imports it: backend/app.py, backend/ml/training/dataset_generator.py
- What it imports: logging, traci, FatalTraCIError
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: Low, but the runtime is intentionally minimal and future-proof.

### 5) backend/digital_twin/__init__.py
- Full path: backend/digital_twin/__init__.py
- Approximate size: 400 bytes
- Purpose: Package export for the DigitalTwin class.
- Classes: none
- Functions: none
- What imports it: backend/app.py, backend/ml/training/dataset_generator.py, backend/feature_engineering/feature_engineer.py
- What it imports: DigitalTwin from .digital_twin
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 6) backend/digital_twin/digital_twin.py
- Full path: backend/digital_twin/digital_twin.py
- Approximate size: 4,670 bytes
- Purpose: Stores the latest simulation snapshot and a rolling history of previous states.
- Classes: DigitalTwin
- Functions: __init__(), update(), current_state property, history property, history_size property
- What imports it: backend/app.py, backend/ml/training/dataset_generator.py, backend/feature_engineering/feature_engineer.py
- What it imports: deque, Optional, Tuple, SimulationState from models
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 7) backend/feature_engineering/__init__.py
- Full path: backend/feature_engineering/__init__.py
- Approximate size: 543 bytes
- Purpose: Package export for FeatureEngineer.
- Classes: none
- Functions: none
- What imports it: backend/app.py
- What it imports: FeatureEngineer from .feature_engineer
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 8) backend/feature_engineering/feature_engineer.py
- Full path: backend/feature_engineering/feature_engineer.py
- Approximate size: 14,515 bytes
- Purpose: Converts DigitalTwin state into engineered traffic features for downstream ML or decision logic.
- Classes: FeatureEngineer
- Functions: generate_features(), _find_lookback_state(), _build_features(), _build_signal_features(), _build_lane_features(), _group_by_lane(), _aggregate_lane(), _compute_flow_rates(), _compute_trend(), _mean(), _count_stopped()
- What imports it: backend/app.py, backend/ml/training/dataset_generator.py
- What it imports: MappingProxyType, typing helpers, DigitalTwin, models
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No major duplication; the trend logic is intentionally centralized.
- Should probably remain: Yes
- Looks experimental: Somewhat, because it includes a purposely hand-maintained trend lookback constant and is clearly a milestone stage.

### 9) backend/ml/__init__.py
- Full path: backend/ml/__init__.py
- Approximate size: 474 bytes
- Purpose: Package export for the predictor.
- Classes: none
- Functions: none
- What imports it: backend/app.py
- What it imports: MLPredictor from .ml_predictor
- Currently used: Yes (for runtime inference path when a model exists)
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 10) backend/ml/feature_schema.py
- Full path: backend/ml/feature_schema.py
- Approximate size: 9,055 bytes
- Purpose: Defines the shared feature vector and target vector contract for training and inference.
- Classes: none
- Functions: features_to_vector(), targets_to_vector(), lane_output_index()
- What imports it: backend/ml/ml_predictor.py, backend/ml/training/train.py, backend/ml/training/data_collector.py, backend/ml/training/dataset_generator.py
- What it imports: typing helpers, TrafficFeatures from models
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No, it is intentionally the single shared contract.
- Should probably remain: Yes
- Looks experimental: No, though it is tightly tied to current lane topology.

### 11) backend/ml/ml_predictor.py
- Full path: backend/ml/ml_predictor.py
- Approximate size: 15,222 bytes
- Purpose: Loads a trained model and converts engineered traffic features into traffic predictions.
- Classes: MLPredictor
- Functions: __init__(), from_path(), _validate_model(), _verify_fast_path(), predict(), _collect_tree_predictions(), _build_lane_prediction(), _confidence()
- What imports it: backend/app.py
- What it imports: os, MappingProxyType, numpy, models, feature_schema
- Currently used: Yes, when a trained model exists.
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: Yes, especially due to the performance-oriented fast-path implementation and verification logic.

### 12) backend/ml/training/config.py
- Full path: backend/ml/training/config.py
- Approximate size: 4,092 bytes
- Purpose: Training-specific configuration for datasets, scenarios, and output artifacts.
- Classes: TrainingConfig
- Functions: ensure_output_directories()
- What imports it: backend/ml/training/train.py, backend/ml/training/dataset_generator.py, backend/ml/training/data_collector.py, backend/ml/training/dataset_builder.py, backend/ml/training/generate_scenario_files.py
- What it imports: os
- Currently used: Yes, by the training pipeline.
- Appears unused: No
- Looks duplicated: Some overlap with runtime Config; intentional separation.
- Should probably remain: Yes
- Looks experimental: No, but it is clearly training-oriented and not runtime-critical.

### 13) backend/ml/training/data_collector.py
- Full path: backend/ml/training/data_collector.py
- Approximate size: 5,254 bytes
- Purpose: Buffers feature snapshots and emits labeled training rows when the prediction horizon is reached.
- Classes: Row (NamedTuple), DataCollector
- Functions: __init__(), observe(), _should_sample(), _try_emit_row(), rows property
- What imports it: backend/ml/training/dataset_generator.py
- What it imports: deque, typing helpers, TrafficFeatures, feature_schema, TrainingConfig
- Currently used: Yes, by dataset generation.
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: Mildly, because it is a training-data construction utility rather than production logic.

### 14) backend/ml/training/dataset_builder.py
- Full path: backend/ml/training/dataset_builder.py
- Approximate size: 4,217 bytes
- Purpose: Reads raw per-run CSVs and builds the final train/test/held-out datasets.
- Classes: none
- Functions: _read_csv_rows(), _write_csv_rows(), _split_run_rows(), build_datasets()
- What imports it: none in the repository currently
- What it imports: csv, glob, logging, os, typing, TrainingConfig
- Currently used: Probably not directly by runtime, but it is meant to be part of the training workflow.
- Appears unused: Somewhat, because there is no visible orchestrator calling it right now.
- Looks duplicated: No
- Should probably remain: Yes, as it is the canonical dataset assembly step.
- Looks experimental: Mildly, because it is a data-pipeline utility rather than a core runtime component.

### 15) backend/ml/training/dataset_generator.py
- Full path: backend/ml/training/dataset_generator.py
- Approximate size: 6,447 bytes
- Purpose: Runs the full simulation pipeline against scenarios and writes raw labeled CSVs.
- Classes: _ScenarioConfig
- Functions: _row_header(), _run_single(), _write_rows_csv(), generate_all()
- What imports it: none in the repository currently
- What it imports: csv, logging, os, feature_schema, TrainingConfig, DataCollector, SCENARIOS, Scenario
- Currently used: Yes, as a training-data generation script.
- Appears unused: No, though it is not wired into runtime.
- Looks duplicated: Somewhat, because it reproduces the same runtime orchestration chain as app.py.
- Should probably remain: Yes
- Looks experimental: Yes, because it is an offline data-generation path using the same runtime infrastructure with a different callback.

### 16) backend/ml/training/generate_scenario_files.py
- Full path: backend/ml/training/generate_scenario_files.py
- Approximate size: 5,786 bytes
- Purpose: Generates SUMO route and configuration files from the scenario manifest.
- Classes: none
- Functions: _run_id(), _build_route_xml(), _build_sumocfg_xml(), generate_all()
- What imports it: none in the repository currently
- What it imports: os, TrainingConfig, SCENARIOS, Scenario
- Currently used: Yes, as a training artifact generator.
- Appears unused: No
- Looks duplicated: Somewhat, because it shares scenario knowledge and route-schema knowledge with scenario_manifest.py.
- Should probably remain: Yes
- Looks experimental: Mildly, because it produces generated training assets rather than runtime logic.

### 17) backend/ml/training/scenario_manifest.py
- Full path: backend/ml/training/scenario_manifest.py
- Approximate size: 7,100 bytes
- Purpose: Declares the set of traffic scenarios used for dataset generation and model evaluation.
- Classes: Scenario
- Functions: _uniform(), _directional_heavy(), get_scenario_by_name()
- What imports it: backend/ml/training/dataset_generator.py, backend/ml/training/generate_scenario_files.py, backend/ml/training/train.py
- What it imports: dataclass, typing helpers
- Currently used: Yes
- Appears unused: No
- Looks duplicated: Somewhat, because the route-edge mapping is also encoded in generate_scenario_files.py.
- Should probably remain: Yes
- Looks experimental: No, but it is still training-centric.

### 18) backend/ml/training/train.py
- Full path: backend/ml/training/train.py
- Approximate size: 9,286 bytes
- Purpose: Trains the ML model, evaluates it, and writes the model plus metadata.
- Classes: none
- Functions: _load_dataset(), _evaluate(), _evaluate_per_scenario(), train_and_evaluate()
- What imports it: none in the repository currently
- What it imports: csv, json, logging, platform, datetime, joblib, numpy, sklearn, RandomForestRegressor, mean_absolute_error, feature_schema, TrainingConfig, SCENARIOS
- Currently used: Yes, as a training entry point.
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: Somewhat, because it is a model-training pipeline for a proof-of-concept system.

### 19) backend/models/__init__.py
- Full path: backend/models/__init__.py
- Approximate size: 720 bytes
- Purpose: Central export surface for all core dataclasses.
- Classes: none
- Functions: none
- What imports it: backend/traffic_adapter/adapter.py, backend/digital_twin/digital_twin.py, backend/feature_engineering/feature_engineer.py, backend/ml/ml_predictor.py
- What it imports: state_models, feature_models, prediction_models
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 20) backend/models/feature_models.py
- Full path: backend/models/feature_models.py
- Approximate size: 9,166 bytes
- Purpose: Defines the engineered feature dataclasses used by feature engineering and ML.
- Classes: LaneFeatures, SignalFeatures, TrafficFeatures
- Functions: empty_lane_mapping()
- What imports it: backend/feature_engineering/feature_engineer.py, backend/ml/feature_schema.py
- What it imports: dataclass, MappingProxyType, typing
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 21) backend/models/prediction_models.py
- Full path: backend/models/prediction_models.py
- Approximate size: 3,286 bytes
- Purpose: Defines the prediction dataclasses used by MLPredictor and future controller logic.
- Classes: LanePrediction, TrafficPrediction
- Functions: predicted_time property
- What imports it: backend/ml/ml_predictor.py
- What it imports: dataclass, typing
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 22) backend/models/state_models.py
- Full path: backend/models/state_models.py
- Approximate size: 4,736 bytes
- Purpose: Defines raw, immutable dataclasses for simulation state and signal state.
- Classes: VehicleState, SignalState, SimulationState
- Functions: none
- What imports it: backend/traffic_adapter/adapter.py, backend/digital_twin/digital_twin.py, backend/feature_engineering/feature_engineer.py
- What it imports: dataclass, typing
- Currently used: Yes
- Appears unused: No
- Looks duplicated: No
- Should probably remain: Yes
- Looks experimental: No

### 23) tests/test_backend.py
- Full path: tests/test_backend.py
- Approximate size: 568 bytes
- Purpose: Basic smoke tests for endpoints.
- Classes: none
- Functions: test_health_endpoint(), test_root_endpoint()
- What imports it: none in the repository; it imports backend.app as a test target.
- What it imports: backend.app
- Currently used: Yes, as a test entry point.
- Appears unused: No
- Looks duplicated: Somewhat, because it seems to assume a Flask-style web app but the current runtime is a console-based TraCI loop.
- Should probably remain: Yes, but it needs alignment with the current architecture.
- Looks experimental: Mildly, because it appears to be a placeholder from an earlier backend shape.

---

## SECTION 3 — Architecture overview

The current architecture is a layered, event-driven simulation pipeline that transforms raw SUMO state into structured features and, optionally, ML predictions.

```text
app.py
↓
Traffic Adapter
↓
Digital Twin
↓
Feature Engineering
↓
Machine Learning
↓
Decision Engine (future)
↓
Dashboard (future)
```

### Runtime flow

1. app.py starts the process.
   - It resolves configuration via backend/config.py.
   - It creates a TraCIManager.
   - It starts SUMO and establishes the connection.
   - It then creates the adapter, digital twin, feature engineer, and optional predictor.

2. TrafficAdapter reads live state from SUMO.
   - It is the only module that directly touches TraCI.
   - It collects vehicle-level and signal-level state and wraps them in immutable dataclasses.
   - This is the boundary between simulation and application logic.

3. DigitalTwin stores the latest simulation snapshot.
   - It keeps a bounded history of previous snapshots.
   - This is the central state store for all downstream consumers.

4. FeatureEngineer converts raw state into engineered features.
   - It aggregates current and historical state into network-wide and per-lane metrics.
   - It produces TrafficFeatures for ML and future decision-making modules.

5. MLPredictor optionally converts features into TrafficPrediction.
   - It loads a trained scikit-learn random forest model.
   - It uses the shared feature schema to ensure features and targets are aligned.

### Dependency explanation

- app.py depends on Config, TraCIManager, TrafficAdapter, DigitalTwin, FeatureEngineer, and MLPredictor.
  - This is the orchestration layer.
  - It has the strongest runtime coupling to the rest of the system.

- TrafficAdapter depends on TraCIManager and the models package.
  - It is the translation boundary from external runtime into the project’s internal domain objects.

- DigitalTwin depends on the models package.
  - It does not know about TraCI or ML.
  - It is a pure state repository.

- FeatureEngineer depends on DigitalTwin and the models package.
  - It is upstream of ML and downstream of raw simulation state.
  - It does not depend on TraCI directly.

- MLPredictor depends on the models package and feature_schema.
  - It is inferential-only.
  - It does not manipulate the simulation or the signal logic.

- The training pipeline depends on the same core modules but runs offline.
  - It uses the same feature engineering and feature schema logic to build datasets.
  - It is not part of the runtime path but shares the same domain contracts.

- The current architecture is intentionally modular, but the future decision layer is still missing.
  - The project is currently a sensing-and-prediction skeleton rather than a fully closed-loop traffic control system.

---

## SECTION 4 — Models and dataclasses

### Raw simulation state

#### VehicleState
- Purpose: One immutable snapshot of a single vehicle at one simulation step.
- Fields: id, lane_id, speed, waiting_time, position.
- Relationship: Used by TrafficAdapter to represent raw vehicle state; then consumed by FeatureEngineer and DigitalTwin.

#### SignalState
- Purpose: One immutable snapshot of the traffic signal state for one step.
- Fields: tls_id, raw_state, current_phase_index, seconds_until_next_switch, lane_states.
- Relationship: Used by TrafficAdapter and converted into engineered signal features later.

#### SimulationState
- Purpose: An immutable snapshot of the full intersection at a single simulation time.
- Fields: simulation_time, vehicles, signal.
- Relationship: The core unit stored by DigitalTwin and consumed by FeatureEngineer.

### Engineered features

#### LaneFeatures
- Purpose: Per-lane aggregation of vehicle behavior and traffic conditions.
- Fields: lane_id, vehicle_count, average_speed, average_waiting_time, max_waiting_time, stopped_vehicle_count, arrival_rate, departure_rate, stopped_vehicle_count_trend, waiting_time_trend.
- Relationship: Produced by FeatureEngineer and consumed by feature_schema and downstream ML logic.

#### SignalFeatures
- Purpose: Engineered, ML-friendly signal representation.
- Fields: seconds_until_next_switch, lane_signal_states.
- Relationship: Composes into TrafficFeatures and provides a simplified signal view to the model.

#### TrafficFeatures
- Purpose: Complete engineered snapshot of network-wide traffic state.
- Fields: simulation_time, total_vehicle_count, average_speed, average_waiting_time, stopped_vehicle_count, lane_features, signal.
- Relationship: The main input object for MLPredictor and the training pipeline.

### ML predictions

#### LanePrediction
- Purpose: One prediction object for one lane.
- Fields: lane_id, predicted_vehicle_count, predicted_average_waiting_time, confidence.
- Relationship: Produced by MLPredictor and intended for future controller logic.

#### TrafficPrediction
- Purpose: Complete prediction object for all lanes.
- Fields: reference_time, prediction_horizon_seconds, lane_predictions.
- Relationship: The output contract from the ML layer to future decision-making.

### Relationship chain

```text
VehicleState + SignalState + SimulationTime
→ SimulationState
→ DigitalTwin
→ FeatureEngineer
→ LaneFeatures + SignalFeatures + TrafficFeatures
→ MLPredictor
→ LanePrediction + TrafficPrediction
```

---

## SECTION 5 — SUMO assets

### Network assets
- Purpose: Define the intersection topology, geometry, connections, traffic light program, and lane types.
- Files:
  - sumo/network/intersection.con.xml
  - sumo/network/intersection.edg.xml
  - sumo/network/intersection.net.xml
  - sumo/network/intersection.nod.xml
  - sumo/network/intersection.tll.xml
  - sumo/network/intersection.type.xml
- Classification: Production
- Notes: These are the frozen, foundational assets for the project.

### Route assets
- Purpose: Define vehicle routes and movement patterns.
- Files:
  - sumo/routes/intersection.rou.xml
  - sumo/routes/scenarios/balanced.rou.xml
  - sumo/routes/scenarios/east_heavy.rou.xml
  - sumo/routes/scenarios/extreme.rou.xml
  - sumo/routes/scenarios/heavy.rou.xml
  - sumo/routes/scenarios/light.rou.xml
  - sumo/routes/scenarios/north_heavy.rou.xml
  - sumo/routes/scenarios/south_heavy.rou.xml
  - sumo/routes/scenarios/west_heavy.rou.xml
  - sumo/scenarios/demo/rush_hour.rou.xml
- Classification:
  - Production: sumo/routes/intersection.rou.xml
  - Training: the scenario-specific route files under sumo/routes/scenarios
  - Demo: sumo/scenarios/demo/rush_hour.rou.xml

### Configuration assets
- Purpose: Bind the network and route files into runnable SUMO configurations.
- Files:
  - sumo/config/intersection.sumocfg
  - sumo/config/demo/rush_hour.sumocfg
  - sumo/config/scenarios/*.sumocfg
- Classification:
  - Production: sumo/config/intersection.sumocfg
  - Demo: sumo/config/demo/rush_hour.sumocfg
  - Training: the scenario-specific files under sumo/config/scenarios

### Vehicle type assets
- File: sumo/vehicles/vehicle_types.add.xml
- Purpose: Defines the vehicle type used by the simulation.
- Classification: Production

### GUI assets
- Files:
  - sumo/gui/default_view.xml
  - sumo/gui/demo_view.xml
- Purpose: Defines the SUMO GUI view for development and demo use.
- Classification: Demo / development

### Environment / decoration assets
- Files:
  - sumo/environment/buildings.add.xml
  - sumo/environment/roadside.add.xml
- Purpose: Adds visual environment context to the simulation.
- Classification: Production / visual context

### Scenario assets
- Purpose: Training and evaluation scenario definitions generated or used by the ML pipeline.
- Files: the scenario-specific route and config files under the scenario directories.
- Classification: Training

### Notes on asset role
- The project currently has a strong split between:
  - a frozen production network,
  - a set of generated training scenarios,
  - and a demo-oriented route/config pair.
- The architecture is more mature on the training-data side than on the runtime control side.

---

## SECTION 6 — Machine learning architecture

### Training pipeline

The ML pipeline is organized as a multi-step workflow:

1. Scenario manifest defines demand patterns.
2. Scenario generator writes SUMO scenario route and configuration files.
3. Dataset generator launches SUMO via the runtime stack and collects training rows.
4. Data collector pairs feature snapshots and future target snapshots into labeled rows.
5. Dataset builder merges per-run CSVs into train/test/held-out datasets.
6. Train script fits a random forest regressor and writes a model and metadata.

### Dataset generation

- The dataset generation path is intentionally based on the same runtime infrastructure as app.py.
- It uses TraCIManager + TrafficAdapter + DigitalTwin + FeatureEngineer plus a DataCollector callback.
- This reduces drift between training-time and runtime-time feature generation.

### Feature schema

- The shared contract is defined in backend/ml/feature_schema.py.
- It defines:
  - expected lane IDs,
  - network-wide feature names,
  - per-lane feature names,
  - target feature names,
  - prediction horizon,
  - feature vector length and target vector length.
- This is the single source of truth for the number and order of columns used by both training and inference.

### Trained model

- The expected trained artifact is:
  - backend/ml/trained_models/random_forest_predictor.joblib
- The runtime path checks for this file and skips prediction if it is missing.
- The training path writes the model plus metadata JSON.

### Metadata

- The training script writes a metadata JSON file:
  - backend/ml/trained_models/random_forest_predictor.metadata.json
- Metadata includes:
  - trained timestamp,
  - sklearn version,
  - python version,
  - model type,
  - number of estimators,
  - random state,
  - prediction horizon,
  - dataset sizes,
  - metric summaries.

### Predictor

- backend/ml/ml_predictor.py uses a fitted, native multi-output RandomForestRegressor.
- It validates the model shape and uses a low-level tree traversal path for speed.
- It converts TrafficFeatures into TrafficPrediction.

### Evaluation

- Training evaluates both:
  - a chronological test split,
  - a held-out scenario.
- Metrics include overall MAE and per-target/per-lane MAE.
- This is a strong and thoughtful evaluation design for a proof-of-concept system.

### Confidence calculation

- Confidence is derived from the spread of individual tree predictions.
- The logic converts the standard deviation of tree outputs into a 0–100 confidence score.
- Lower spread relative to the mean yields higher confidence.

---

## SECTION 7 — Scenarios

The scenarios are declared in backend/ml/training/scenario_manifest.py.

### 1) light
- Purpose: Low, uniform demand on every approach.
- Traffic pattern: Gentle flow, low congestion.
- Files involved: sumo/routes/scenarios/light.rou.xml, sumo/config/scenarios/light_seed1.sumocfg, light_seed2.sumocfg, light_seed3.sumocfg.
- Currently used: Yes, as part of training data generation.

### 2) balanced
- Purpose: Moderate, uniform demand across the network.
- Traffic pattern: Baseline scenario, representative of the original project baseline.
- Files involved: sumo/routes/scenarios/balanced.rou.xml, sumo/config/scenarios/balanced_seed1.sumocfg, balanced_seed2.sumocfg, balanced_seed3.sumocfg.
- Currently used: Yes, as part of training data generation.

### 3) heavy
- Purpose: Uniform high demand across all approaches.
- Traffic pattern: Significant congestion and queueing pressure.
- Files involved: sumo/routes/scenarios/heavy.rou.xml, sumo/config/scenarios/heavy_seed1.sumocfg, heavy_seed2.sumocfg, heavy_seed3.sumocfg.
- Currently used: Yes.

### 4) extreme
- Purpose: Very high demand; reserved as an out-of-distribution evaluation scenario.
- Traffic pattern: Severe congestion.
- Files involved: sumo/routes/scenarios/extreme.rou.xml, sumo/config/scenarios/extreme_seed1.sumocfg, extreme_seed2.sumocfg.
- Currently used: Yes, but as held-out data rather than training data.

### 5) north_heavy
- Purpose: North approach is heavily loaded; other directions are lighter.
- Traffic pattern: Strong directional imbalance.
- Files involved: sumo/routes/scenarios/north_heavy.rou.xml, sumo/config/scenarios/north_heavy_seed1.sumocfg, north_heavy_seed2.sumocfg, north_heavy_seed3.sumocfg.
- Currently used: Yes.

### 6) south_heavy
- Purpose: South approach is heavily loaded.
- Traffic pattern: Strong directional imbalance in the opposite direction.
- Files involved: sumo/routes/scenarios/south_heavy.rou.xml, sumo/config/scenarios/south_heavy_seed1.sumocfg, south_heavy_seed2.sumocfg, south_heavy_seed3.sumocfg.
- Currently used: Yes.

### 7) east_heavy
- Purpose: East approach is heavily loaded.
- Traffic pattern: Strong directional imbalance.
- Files involved: sumo/routes/scenarios/east_heavy.rou.xml, sumo/config/scenarios/east_heavy_seed1.sumocfg, east_heavy_seed2.sumocfg, east_heavy_seed3.sumocfg.
- Currently used: Yes.

### 8) west_heavy
- Purpose: West approach is heavily loaded.
- Traffic pattern: Strong directional imbalance.
- Files involved: sumo/routes/scenarios/west_heavy.rou.xml, sumo/config/scenarios/west_heavy_seed1.sumocfg, west_heavy_seed2.sumocfg, west_heavy_seed3.sumocfg.
- Currently used: Yes.

### Demo scenario
- File: sumo/config/demo/rush_hour.sumocfg and sumo/scenarios/demo/rush_hour.rou.xml
- Purpose: A visual demo scenario for showcase or manual inspection.
- Currently used: Yes, as the current open SUMO demo scenario.

---

## SECTION 8 — Temporary modifications currently present

The repository contains some signs of development-era scaffolding and temporary logic, but it is not flooded with obvious debug statements.

### Temporary or transitional notes
- backend/app.py contains comments explaining that prediction logging is temporary and that the decision engine will eventually consume predictions.
- backend/ml/ml_predictor.py contains a large performance note explaining a benchmarking-based optimization. This is not a bug, but it shows an earlier performance investigation was folded into the implementation.
- The runtime app has a graceful fallback when no trained model exists, which is a temporary-quality behavior in the sense that it keeps the app alive but leaves prediction disabled.
- The tests in tests/test_backend.py appear to reflect an earlier or different application structure and may be stale.

### Debug or development leftovers
- There are no obvious print-debug statements in the core runtime modules.
- There is no obvious disabled-code block in the examined source files.
- There is no obvious profiling hook embedded in the runtime path beyond the ML fast-path implementation.

### Overall assessment
- The codebase is relatively clean for a prototype.
- The strongest temporary artifacts are the explanatory comments about future replacement and the performance-oriented ML predictor implementation.

---

## SECTION 9 — Files that appear redundant or overlapping

These are not automatically recommended for deletion; they are simply files or patterns that look overlapping from an architectural standpoint.

### 1) backend/ml/training/generate_scenario_files.py and backend/ml/training/scenario_manifest.py
- Why it looks overlapping: both encode scenario structure and route knowledge.
- Why it may be acceptable: one is data declaration, the other is generation logic.
- Architectural interpretation: the separation is sensible, but there is still a conceptual overlap in the route-edge mapping.

### 2) backend/app.py and backend/ml/training/dataset_generator.py
- Why it looks overlapping: both orchestrate the same runtime chain of TraCIManager → TrafficAdapter → DigitalTwin → FeatureEngineer.
- Why it may be acceptable: one is runtime execution, the other is offline data generation.
- Architectural interpretation: this duplication is intentional but could be reduced by using a shared orchestration component later.

### 3) sumo/routes/intersection.rou.xml and sumo/routes/scenarios/*.rou.xml
- Why it looks overlapping: the scenario route files are clearly variations on the same route topology.
- Why it may be acceptable: they are scenario-specific files for training and evaluation.
- Architectural interpretation: the design is reasonable because the base and scenario routes serve different purposes.

### 4) sumo/config/intersection.sumocfg and the generated scenario sumocfg files
- Why it looks overlapping: they all point to the same network and similar runtime configuration.
- Why it may be acceptable: the scenario configs are per-run variants for training and evaluation.
- Architectural interpretation: this is a normal asset-management pattern for simulation experiments.

### 5) tests/test_backend.py
- Why it looks overlapping or stale: it tests a health endpoint pattern that does not match the current console-based TraCI-oriented architecture.
- Why it may be acceptable: it could still be useful as a generic backend smoke test if the project later exposes a service endpoint.
- Architectural interpretation: it appears to be an older test scaffold that has not been adapted to the current structure.

---

## SECTION 10 — Missing modules planned but not implemented

The repository contains empty or placeholder directories for several planned modules.

### Decision Engine
- Path: backend/decision_engine/
- Status: Not implemented.
- Expected role: Consume predictions and select signal timings or control actions.
- Current evidence: the directory exists but contains no implementation files.

### Dashboard
- Path: frontend/ and maybe future API integration
- Status: Not implemented.
- Expected role: Visualize traffic, predictions, and state.
- Current evidence: the frontend directory exists but is empty.

### Performance Evaluation
- Path: backend/performance/
- Status: Not implemented.
- Expected role: Compare prediction quality, runtime cost, and simulation behavior.
- Current evidence: the directory exists but contains no implementation files.

### Database / persistence layer
- Path: backend/database/
- Status: Not implemented.
- Expected role: Persist state, metrics, or model artifacts.
- Current evidence: the directory exists but has no implementation.

### Services / routes / API layer
- Path: backend/routes/, backend/services/
- Status: Partially conceptual; no concrete service implementation is visible.
- Expected role: Expose simulation state or control endpoints.
- Current evidence: the directories exist but are empty.

### Signal controller
- Path: backend/signal_controller/
- Status: Not implemented.
- Expected role: Translate control decisions into actual signal timing changes.
- Current evidence: the directory exists but no implementation is visible.

---

## SECTION 11 — Dependency graph

```text
backend/app.py
├── backend/config.py
├── backend/traffic/traci_manager.py
│   └── SUMO / TraCI
├── backend/traffic_adapter/adapter.py
│   └── backend/models/state_models.py
├── backend/digital_twin/digital_twin.py
│   └── backend/models/state_models.py
├── backend/feature_engineering/feature_engineer.py
│   ├── backend/digital_twin/digital_twin.py
│   └── backend/models/feature_models.py
└── backend/ml/ml_predictor.py
    ├── backend/ml/feature_schema.py
    ├── backend/models/prediction_models.py
    └── backend/models/feature_models.py
```

Training-side graph:

```text
backend/ml/training/scenario_manifest.py
↓
backend/ml/training/generate_scenario_files.py
↓
sumo/routes/scenarios/*.rou.xml
+ sumo/config/scenarios/*.sumocfg
↓
backend/ml/training/dataset_generator.py
├── backend/ml/training/data_collector.py
├── backend/traffic/traci_manager.py
├── backend/traffic_adapter/adapter.py
├── backend/digital_twin/digital_twin.py
├── backend/feature_engineering/feature_engineer.py
└── backend/ml/feature_schema.py
↓
backend/ml/training/dataset_builder.py
↓
datasets/raw/*.csv
↓
backend/ml/training/train.py
↓
backend/ml/trained_models/*.joblib + *.metadata.json
```

---

## SECTION 12 — Cleaner final folder structure (suggested, non-modifying)

A cleaner structure would separate runtime, training, and asset management more explicitly.

```text
traffic-digital-twin/
├── backend/
│   ├── runtime/
│   │   ├── app.py
│   │   ├── config.py
│   │   ├── traffic/
│   │   ├── adapter/
│   │   ├── twin/
│   │   └── features/
│   ├── ml/
│   │   ├── predictor.py
│   │   ├── schema.py
│   │   ├── training/
│   │   └── artifacts/
│   ├── control/
│   │   ├── decision_engine/
│   │   ├── signal_controller/
│   │   └── services/
│   ├── models/
│   └── api/
├── sumo/
│   ├── network/
│   ├── routes/
│   │   ├── base/
│   │   └── scenarios/
│   ├── config/
│   │   ├── base/
│   │   └── scenarios/
│   ├── gui/
│   ├── environment/
│   └── vehicles/
├── data/
├── datasets/
├── tests/
└── docs/
```

This would reduce the current mix of runtime code, training code, and asset-generation logic in a single backend root and make the project easier to evolve.

---

## SECTION 13 — Risks

### 1) Dead or placeholder code
- The decision engine, dashboard, performance evaluation, database, and service layers are not implemented.
- These are not harmful today, but they are missing the core “control” layer the project claims to target.

### 2) Duplicated logic or structure
- Runtime coordination and dataset generation both implement a similar orchestration path.
- Scenario knowledge is split between manifest and generator code.
- The route topology is partly represented in both the scenario manifest and the generation script.

### 3) Unused or under-used files
- The frontend directory is empty.
- The backend/routes and backend/services directories are empty.
- The backend/performance directory is empty.
- The tests appear to reference an older architecture.

### 4) Temporary code patterns
- The predictor includes a performance-optimization path that was clearly benchmarked and integrated into production code.
- The runtime app contains comments and fallback behavior that still signal “prototype mode.”

### 5) Architectural coupling to a single network
- The feature schema and signal logic are tightly coupled to a specific lane topology and a single traffic light ID.
- This is fine for a prototype, but it makes scaling to new intersections more difficult.

### 6) Runtime robustness
- The runtime path currently degrades gracefully when no trained model exists, which is sensible but means the ML layer is not yet a reliable part of the core runtime behavior.
- The tests and runtime entry points do not yet look fully aligned, which could become a maintenance issue.

### 7) Dependency direction and responsibility boundaries
- The architecture is fairly clean, but the project is still in a transitional stage where training logic, runtime logic, and future control logic overlap in the same repository.

---

## SECTION 14 — Current project status

### Completed
- Core simulation pipeline skeleton is present.
- SUMO network, route, config, GUI, and environment assets are present.
- A clear data contract exists between raw state, features, and predictions.
- A feature engineering pipeline is implemented.
- A machine-learning inference path is implemented.
- A training pipeline exists for dataset generation, dataset construction, and model fitting.
- Scenario definitions and generated training assets are present.

### In progress
- Runtime orchestration is implemented but still quite minimal.
- The ML pipeline is implemented, but the runtime only uses it if a trained model is available.
- The training and evaluation pipeline is implemented, but it is still an offline workflow rather than a closed-loop control system.
- The project is transitioning from a prototype simulation setup into a more structured digital-twin and ML framework.

### Not started or not yet implemented
- Decision Engine
- Dashboard / visualization layer
- Real signal control logic
- Persisted state and analytics storage
- Formal API/service layer
- Full integration between prediction output and control decisions
- Frontend implementation
- Performance evaluation module
- Database-backed persistence

---

## Final assessment

The project is a well-structured prototype for a traffic digital twin with strong modular boundaries between simulation, state, feature engineering, and machine learning. It is not yet a complete intelligent traffic control system, but it already has the foundations for a functional simulation + prediction architecture.

The main gaps are not in the low-level pipeline design; they are in the missing control layer, the lack of a real decision engine, the absence of a completed dashboard, and the need to align tests and runtime entry points with the current architecture.

---

## SECTION 15 — Performance Evaluation implementation (CURRENT STATE)

> NOTE: Sections 8-14 above were written before the control layer existed
> and are partially outdated. This section records what is actually built
> NOW. Current status summary: simulation ✔, ML model + calibration ✔,
> DecisionEngine ✔, SignalController ✔, closed-loop app.py integration ✔,
> Performance Evaluation ✔ (this section) — remaining: Dashboard,
> emergency detection, database persistence, final demo polish.

### 15.1 What was built

A parallel-simulation performance evaluation system under
`backend/performance/`:

| File | Role |
|---|---|
| `performance/metrics_collector.py` | `MetricsCollector` - aggregates all six core metric families from raw `SimulationState` snapshots. One instance per simulation. |
| `performance/evaluator.py` | `PerformanceEvaluator` - runs TWO PARALLEL, LOCKSTEP-SYNCHRONIZED SUMO instances of the same scenario (AI vs SUMO-default baseline) and produces the comparison panel + CSV with % improvement. |
| `performance/baseline_controllers.py` | Python-side alternative baselines (`FixedTimerController`, `VehicleActuatedController`) emitting real `Decision` objects. |
| `performance/evaluate.py` | Batch runner comparing fixed_timer / vac / ai across many scenarios sequentially. |

### 15.2 The two-simulation design (hard rules)

1. Simulation A ("ai") runs the FULL pipeline:
   TrafficAdapter -> DigitalTwin -> FeatureEngineer -> MLPredictor ->
   DecisionEngine -> SignalController.
2. Simulation B ("baseline") runs TrafficAdapter + MetricsCollector ONLY.
   NO DecisionEngine, NO SignalController. The frozen network's own
   static tlLogic program controls it; it NEVER receives a trafficlight
   command.
3. Both are SEPARATE SUMO processes on separate labeled TraCI connections
   ("ai" / "baseline"). They are never merged into one instance - one
   traffic light cannot run two control strategies, and shared vehicle
   state would couple every metric.
4. Fairness is structural: both managers launch the SAME sumocfg (same
   network, same route files, same seed). Lockstep stepping keeps both at
   identical simulated timestamps.

### 15.3 Metrics collected (per simulation)

All metrics are TIME-WEIGHTED INTEGRALS (value * dt summed over simulated
time, divided by total simulated time), computed from the raw
SimulationState through the IDENTICAL collection path on both sides:

1. Average waiting time (+ worst instantaneous average)
2. Queue length - vehicles below 0.1 m/s (SUMO's halting definition),
   network-wide AND per-lane breakdown
3. Throughput - unique vehicles completing trips, plus veh/hour
4. Average speed
5. Stopped vehicles count
6. Travel time - per-vehicle entry->exit duration paired from
   adapter-reported departure/arrival timestamps (avg + worst)

### 15.4 Infrastructure changes that enabled this

- `TraCIManager(config, label=...)`: labeled TraCI connections;
  `manager.connection` exposes THIS instance's Connection object.
  Verified against the installed traci API: `traci.start()` returns a
  `(label, subprocess)` tuple there, so the Connection is fetched via
  `traci.getConnection(label)`. `run()`/`close()` operate on the
  manager's OWN connection so closing one simulation never kills the
  other. `numRetries=30` fixes intermittent Windows startup failures.
- `TrafficAdapter`: binds to its own manager's connection (no cross-talk
  between parallel simulations); added `get_arrived_vehicle_ids()`
  alongside `get_departed_vehicle_ids()` for travel-time pairing.
- `SignalController(tls_id, traci_connection=None)`: optional explicit
  connection binding so signal commands ALWAYS land on the AI instance
  only. Its per-tick prints became `logger.debug` (console I/O was a
  measurable drag on long runs).
- `app.py`: status logging moved from every step (20 Hz) to decision
  ticks (1 Hz); `SUMO_BINARY_NAME` restored to "sumo-gui".

### 15.5 How to run

From `backend/`:

    python -m performance.evaluator --scenario heavy_seed1          # headless
    python -m performance.evaluator --scenario rush_hour_seed1 --gui # dual GUI demo

Output: side-by-side panel with signed % improvement per metric
(IMPROVED / REGRESSED verdicts - regressions are reported honestly),
plus `results/comparison_<scenario>.csv`.

### 15.6 First verified result (light_seed1)

    Avg Waiting Time : AI 2.56s  vs Baseline 11.56s  -> 77.9% IMPROVED
    Avg Travel Time  : AI 46.34s vs Baseline 53.14s  -> 12.8% IMPROVED
    Avg Queue Length : AI 3.11   vs Baseline 4.94    -> 37.1% IMPROVED
    Avg Speed        : AI 7.98   vs Baseline 6.85    -> 16.4% IMPROVED
    Throughput       : 240 = 240 (identical demand confirmed)
    Worst Travel Time: 1.8% REGRESSED (honest outlier reporting)

### 15.6b Second verified result (heavy_seed1, 888 vehicles per sim)

    Avg Waiting Time : AI 3.17s   vs Baseline 16.81s  -> 81.1% IMPROVED
    Avg Travel Time  : AI 55.26s  vs Baseline 84.55s  -> 34.6% IMPROVED
    Worst Travel Time: AI 123.10s vs Baseline 317.40s -> 61.2% IMPROVED
    Avg Queue Length : AI 14.87   vs Baseline 33.78   -> 56.0% IMPROVED
    Max Queue Length : AI 35      vs Baseline 77      -> 54.5% IMPROVED
    Avg Speed        : AI 7.17    vs Baseline 4.52    -> 58.7% IMPROVED
    Throughput       : 888 = 888 (identical demand confirmed)

Under heavy load the AI's advantage GROWS (waiting time improvement rises
from 77.9% at light demand to 81.1% at heavy demand) - exactly the
behaviour adaptive control is supposed to exhibit.

### 15.7 Remaining roadmap

1. Dashboard (Digital Twin UI): live phase, countdown, density,
   prediction-vs-actual, decision reasoning, AI-vs-baseline panel.
2. Emergency detection: feed real `emergency_lanes` into DecisionEngine.
3. Database persistence (`backend/database/`): decision_log /
   prediction_log / performance_log tables for history + graphs.
4. Final optimization + demo script.

---

## SECTION 16 — Dashboard, Emergency Detection, Database Logging (CURRENT STATE)

> All three components from the 15.7 roadmap are now IMPLEMENTED and
> VERIFIED end-to-end. Only final demo polish remains.

### 16.1 Real-time Dashboard — Traffic Command Center UI

Files:
- `backend/services/live_state.py` — thread-safe snapshot store
  (`LiveStateStore`); simulation publishes, dashboard reads; nothing
  flows back into the simulation (read-only rule is structural).
- `backend/services/dashboard_server.py` — FastAPI app: serves
  `frontend/dashboard.html`, pushes snapshots over WebSocket `/ws`
  every 0.5 s, plus an HTTP fallback at `/api/latest`. Runs as a daemon
  thread inside the simulation process via `start_dashboard_server()`.
- `frontend/dashboard.html` — single-entry multi-page **Traffic Command
  Center** UI (dark professional theme, CSS design tokens, internally
  modular JS: WS client / Router / History buffers / dependency-free
  canvas Charts / per-page renderers).

Sidebar navigation with four pages:
1. **Overview** — large signal visualization (3-lamp housing +
   countdown + progress), KPI cards (vehicles / avg speed / avg wait /
   stopped), emergency alert banner, AI-vs-baseline summary table,
   ~60 s phase-history timeline.
2. **Digital Twin** — lane density bars color-coded by live signal
   state (G/Y/R), real-time network state cards, model confidence
   visualization, prediction-vs-actual table (15 s horizon).
3. **Performance** — waiting-time and queue-length line charts over
   time, AI-vs-baseline throughput comparison bars, signed improvement
   percentage table.
4. **Decisions** — current phase, decision-mode badge color-coded
   NORMAL (blue) / STARVATION OVERRIDE (orange) / EMERGENCY OVERRIDE
   (red), full reason_text reasoning box, phase timeline, emergency
   status panel.

Charting is dependency-free canvas rendering (no CDN - works offline
during demos). WebSocket transport requires the `websockets` package
(uvicorn does not support WS upgrades without it; pinned in
requirements.txt).

Config: `DASHBOARD_ENABLED / DASHBOARD_HOST / DASHBOARD_PORT`
(default http://127.0.0.1:8000). The evaluator exposes live comparison
via `python -m performance.evaluator --scenario X --dashboard`.

VERIFIED: full headless app.py run (320 vehicles, 644 s sim time)
published snapshots for the whole run; HTTP 200 page serve +
/api/latest snapshot confirmed; evaluator --dashboard feeds the
comparison panel live; browser client connected and receiving over
WebSocket after the websockets dependency fix.

### 16.2 Emergency Vehicle Detection

- `TrafficAdapter.get_emergency_vehicle_lanes()` reads SUMO vehicle
  classes via `traci.vehicle.getVehicleClass()` — raw fact only,
  consistent with the adapter's boundary role.
- app.py passes the frozenset of lanes holding "emergency"-class
  vehicles straight into `DecisionEngine.decide(..., emergency_lanes=...)`.
- ALL prioritization logic remains inside DecisionEngine (existing
  EMERGENCY_MINIMUM_SAFETY_SECONDS cut-in + EMERGENCY_SERVICE_WINDOW
  hold). No new decision logic was added anywhere else.
- The emergency_response demo scenario contains emergency-class
  vehicles to exercise this path during demos.

### 16.3 Database Logging (SQLite)

File: `backend/database/db_logger.py`; DB at `data/traffic_dashboard.db`.

| Table | Row cadence | Columns |
|---|---|---|
| decision_log | 1/decision | time, phase, duration, mode, reason |
| performance_log | 1/tick | time, avg_wait, avg_speed, queue_length, stopped |
| prediction_log | 1/lane/matured prediction | time, predicted_values JSON, actual_values JSON, confidence |

Design: WAL journal mode, insert-only, lock-guarded single connection,
ALL database errors swallowed+logged (a DB failure can never cost a
control tick). Predictions are parked in a pending dict until their 15 s
horizon elapses, then paired with observed values before writing - so
every prediction row is a genuine predicted-vs-actual record usable for
model-quality graphs.

VERIFIED on a full run: decision_log = 645 rows, performance_log =
645 rows, prediction_log = 7,560 rows (12 lanes x ~630 matured
predictions), sample rows well-formed.

### 16.4 Integration points (app.py)

app.py now orchestrates three read-only side-channels alongside control:
SQLite logging, dashboard publishing, and emergency-lane feeding. None
of them can influence control decisions; all existing module
responsibilities are unchanged.

### 16.5 Remaining roadmap

1. Final optimization + demo script (presentation flow, optional
   SQLite-backed history charts).
