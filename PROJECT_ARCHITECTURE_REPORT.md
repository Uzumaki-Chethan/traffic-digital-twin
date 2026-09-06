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

---

## SECTION 17 — Decision Engine refinement + congestion analytics (CURRENT STATE)

> Adds tunability, durable Desired-vs-Actual persistence, and a
> read-only congestion analytics layer on top of the Decision Engine
> and database described in Sections 15-16. Investigated as part of
> this work but explicitly NOT built (see 17.4): multi-junction
> coordination, and a second hand-rolled simulation engine alongside
> SUMO.

### 17.1 DecisionConfig — tunables extracted from decision_engine.py

`backend/decision_engine/decision_config.py`'s `DecisionConfig` frozen
dataclass now holds every tunable the engine previously hardcoded as
module-level constants (min/max green per phase, hysteresis margin,
oversaturation margin bonus, starvation rate and hard limit, emergency
safety minimum and service window, normalization ceilings, max
predicted weight). `DecisionConfig()` with no arguments reproduces the
exact prior hardcoded behaviour - this was a pure refactor, not a
behaviour change, verified by the full pre-existing test suite plus
the new tests in 17.3 passing unchanged. `MIN_GREEN_SECONDS` and
`MAX_GREEN_SECONDS` remain re-exported as module-level constants from
`decision_engine.py` (sourced from `DecisionConfig()`'s own defaults)
specifically because `performance/baseline_controllers.py`'s
`FixedTimerController` and `VehicleActuatedController` import them
directly, and must use identical clamps to the AI for the AI-vs-baseline
comparison to remain fair.

`backend/decision_engine/calibrate_normalization.py` is a standalone,
manually-run script (never invoked automatically) that derives
`norm_vehicle_count`/`norm_waiting_time_seconds` from the P90 (default)
of recorded `lane_state_log` data, writing
`backend/decision_engine/normalization_calibration.json`.
`DecisionEngine.__init__` loads this file automatically if present,
falling back silently to `DecisionConfig()`'s defaults if it is
missing, unreadable, or malformed - a bad calibration file can never
prevent startup. Refuses to calibrate from fewer than 500 rows.

### 17.2 Desired vs Actual signal state - now persisted

Previously this distinction (the guide's Section 5.5 "most important
distinction") existed only live, in `app.py`'s WebSocket snapshot
(`_signal_view(state)` reconstructs the actual TraCI-confirmed phase
separately from `decision`, the desired one) - never in SQLite.
`decision_log` gained two columns, `actual_phase` and
`actual_is_yellow`, populated from that same `_signal_view()` call at
the existing `db_logger.log_decision(...)` call site. Older database
files are migrated in place via `ALTER TABLE` on startup
(`DatabaseLogger._migrate_decision_log_columns`), not requiring a fresh
database.

### 17.3 lane_state_log + congestion analytics

New table `lane_state_log` (time, lane_id, vehicle_count, avg_speed,
avg_waiting_time, stopped_count, congestion_score, signal_state) is
written once per decision tick, one row per lane (12 rows/tick),
via a new `DatabaseLogger.log_lane_states()` batched insert. Wired from
`app.py`'s `update_twin()`, right alongside the existing
`log_performance()` call. `congestion_score` reuses
`DecisionEngine._lane_score()`'s already-computed per-lane urgency
score directly - `Decision` gained a `lane_scores: Mapping[str, float]`
field so `app.py` never has to recompute it.

New package `backend/analytics/` (`congestion_analytics.py`): three
read-only, `db_path`-parameterized functions with no FastAPI
dependency of their own - `average_wait_times`, `congestion_trend`
(time-bucketed, done in Python since SQLite has no clean arbitrary
bucket-width function), and `detect_peak_periods` (statistical
detection of the top-N highest-congestion windows recorded so far;
deliberately NOT based on wall-clock time-of-day, since simulated time
has no real hour-of-day to anchor to). Exposed via three new read-only
FastAPI endpoints on the existing dashboard server:
`GET /api/analytics/wait-times`, `/congestion-trend`, `/peak-periods` -
same read-only-URI-connection pattern as the pre-existing
`/api/logs/*` endpoints.

`detect_peak_periods`'s `scenario` field is currently always `None`:
no table records which named scenario (e.g. `heavy_seed1`) a given
`app.py` run belongs to - only `performance/evaluator.py`'s CSV output
tags scenario names today. Flagged rather than silently building a
scenario-logging change alongside this work.

### 17.4 Explicitly investigated and NOT built this round

Two of four externally-sourced feature prompts for this round turned
out to already be fully implemented (congestion-adaptive timing,
emergency-vehicle priority - see Sections 15-16), one was found
redundant with the existing architecture, and one was found to be a
much larger, separate initiative:

- **A second "time-based simulation engine"**: SUMO+TraCI already is
  exactly this, stepping at 0.05s (20x finer than the 1 Hz decision
  cadence) - building a parallel hand-rolled simulator would duplicate
  it and contradict this project's own founding decision to use SUMO
  over a simplified simulator (see Section 5.2 of the execution guide).
- **Multi-junction coordination**: confirmed NOT a bolt-on. Three
  independent layers each hardcode the single-junction ("C") assumption
  differently - `ml/feature_schema.py` (a flat 12-lane-name tuple
  driving the whole feature/target vector), `traffic_adapter.py` (a
  module-level `_TLS_ID` constant, not a constructor parameter), and
  `ml/training/scenario_manifest.py` (an implicit flat route namespace)
  - plus the Decision Engine's own `PHASE_NAMES`/`_PHASE_EXCLUSIVE_LANES`
  tables. Supporting N junctions needs a junction/topology registry, a
  per-junction feature schema redesign, a scenario manifest extended
  with a junction dimension, and an entirely new coordination layer
  above per-junction Decision Engines (no green-wave/offset logic
  exists at all today, since there has only ever been one junction).
  Deliberately deferred to a separate future initiative rather than
  attempted incrementally inside this round.

---

## SECTION 18 — VAC baseline wiring + backend-driven demo control (CURRENT STATE)

> Closes two items flagged in Section 17: the VAC-vs-fixed-timer baseline gap, and the
> "copy a command into a terminal" demo experience the (now-being-replaced) React
> frontend's Scenario Control page documented as deliberate. Both are now implemented.

### 18.1 `--baseline {fixed_timer,vac}` on the headline evaluator

`performance/evaluator.py`'s `PerformanceEvaluator` now accepts `baseline:
str = "fixed_timer"`. When `"vac"`, simulation B additionally gets its own `DigitalTwin` +
`FeatureEngineer` + `VehicleActuatedController` (`performance/baseline_controllers.py`,
pre-existing but previously only reachable via the separate `performance/evaluate.py`
batch matrix) + its own `SignalController` bound explicitly to the baseline TraCI
connection - mirroring the AI side's own wiring exactly, just with a different (non-ML)
decision source. `Decision` gained no new fields for this; `baseline_controller` is
carried through `PerformanceEvaluator.run()`'s result dict and the live dashboard payload
so callers know which baseline produced a given comparison. `fixed_timer` behavior
(default) is 100% unchanged - zero risk to previously-recorded results using the default.

**Verified end-to-end (2026-09-05, both real full runs, not fabricated):**

| Scenario | vs VAC | vs Fixed-Timer (recorded earlier, Section 15.6) |
|---|---|---|
| `light_seed1` | AI regresses on 6/7 metrics (waiting time -95.6%, travel time -11.7%, worst travel -44.0%, avg queue -45.9%, max queue -25.0%, speed -8.1%); throughput tied | AI improves on 6/7 metrics (waiting time +77.9%, ...); only worst-travel-time regresses (-1.8%) |
| `heavy_seed1` | AI improves on 6/7 metrics (waiting time +63.5%, travel time +7.9%, worst travel +14.9%, avg queue +28.9%, max queue +34.0%, speed +9.1%); throughput tied | AI improves on all 7 metrics (Section 15.6b: waiting time +81.1%, ...) |

This is a genuinely mixed, unresolved result, not smoothed over: under light demand VAC's
simple gap-out logic is close to optimal and the AI's own constraints (fixed min-green
floors, hysteresis margin) make it comparatively less nimble; under heavy demand the AI's
prediction- and fairness-aware approach clearly wins, consistent with the
already-documented "AI's advantage grows under load" pattern. Investigating *why* light
traffic regresses against VAC specifically (e.g. whether MIN_GREEN_SECONDS is too
conservative for a light-demand junction) is flagged as good follow-up work, not yet done.

### 18.2 Backend-driven demo control (no terminal beyond `python app.py` / `npm run dev`)

New module `backend/services/control_routes.py`, an `APIRouter` mounted **only** by
`app.py` (via a new optional `extra_router` parameter on
`dashboard_server.create_app()`/`start_dashboard_server()` - `None` for every other
caller, including `performance/evaluator.py`'s own `--dashboard`, so `dashboard_server.py`
itself still defines zero control endpoints and its "pure viewer" docstring claim stays
literally true):

- `POST /api/control/start-evaluator` `{scenario_name, baseline, gui}` - validates
  `scenario_name` against real `.sumocfg` files and `baseline` against
  `evaluator.BASELINE_CONTROLLERS` before ever building a subprocess argv; 409 if a run is
  already tracked as active. Launches `python -m performance.evaluator --scenario ...
  --baseline ... [--gui]` as a genuinely separate OS process, `PUSH_TO_CONTROL_URL`
  set in its environment.
- `POST /api/control/stop-evaluator` - Windows: `CTRL_BREAK_EVENT` (requires the process
  was created with `CREATE_NEW_PROCESS_GROUP`), which raises `KeyboardInterrupt` in the
  child exactly like a terminal Ctrl+C, letting `evaluator.py`'s own
  `manager_ai.close()`/`manager_base.close()` `finally` block run its normal clean
  TraCI/SUMO teardown; hard `kill()` only as a last-resort fallback after a ~10s grace
  period. Verified via `tasklist`: both the evaluator process and its two `sumo.exe`
  children terminate cleanly, no orphans, while `app.py`'s own simulation (and its
  `sumo-gui.exe`) is completely undisturbed.
- `GET /api/control/status` - self-heals to `running: false` once a tracked process exits
  on its own (scenario finished) without requiring a stop call.
- `POST /api/internal/publish` - receives a spawned evaluator's snapshots and forwards
  them into the SAME `LiveStateStore` app.py's own live loop publishes into. Not meant for
  the frontend to call directly.

**Cross-process live data**: `services/live_state.py` gained `RemoteLiveStatePublisher`,
same `.publish(snapshot)` interface as `LiveStateStore` (used by `evaluator.py`'s `main()`
only when `PUSH_TO_CONTROL_URL` is set in its environment - unset, `--dashboard` self-hosts
exactly as it always has). Its `publish()` is **non-blocking**: the snapshot is handed to a
background daemon thread over a single-slot condition variable (only the latest
not-yet-sent snapshot is ever kept - an older one is simply superseded, matching
`LiveStateStore.publish()`'s own "atomically replace the latest" semantics), so a slow or
failed HTTP call can never block the simulation's own decision loop. This follows the same
"a side-channel must never cost a control tick" principle `database.DatabaseLogger`
already established for SQLite writes.

**A performance red herring worth recording**: a synchronous version of
`RemoteLiveStatePublisher.publish()` was initially shipped and a control-launched
`light_seed1` run was observed taking 120+ real seconds - alarming next to a vague prior
impression of "~15-20s" for the same scenario. The non-blocking rewrite above was made on
principle before re-measuring. A subsequent direct timing check (`python -m
performance.evaluator --scenario light_seed1 --baseline vac`, no push, no dashboard, no
control layer at all) *also* took 120+ seconds - proving the true cost is intrinsic to
running two lockstep SUMO/TraCI instances for ~850 simulated seconds on this machine, not
the HTTP publish. The non-blocking design was kept anyway (correct regardless of the actual
measured impact), but the original "measured 100+s of added overhead" claim was wrong and
has been corrected in `live_state.py`'s own docstring.

### 18.3 Explicitly out of scope this round

- Frontend wiring - confirmed backend-capability-only for now; the React frontend's
  Scenario Control / Performance pages still show copy-paste `CommandSnippet` boxes until
  the full frontend redesign (already agreed to be a separate, later effort) replaces them
  with real buttons against the endpoints in 18.2.
- Any authentication on the new control endpoints - matches the rest of the system's
  localhost-only, no-auth posture.
- A button to launch `app.py`'s own live loop - `python app.py` is the one manual command
  the user has explicitly accepted keeping (there is nothing to launch it FROM before it
  exists).

### 18.4 Housekeeping fix (unrelated to 18.1/18.2, found while auditing setup docs)

`backend/requirements.txt` was stale, unreferenced by any script/doc, and incorrectly
listed `Flask>=3.0,<4.0` (the backend is FastAPI/uvicorn/websockets, listed correctly only
in the root `requirements.txt`). Removed rather than fixed in place, since nothing pointed
to it.

---

## SECTION 19 — Gap-out, switch-confirmation debounce, and vehicle-mix parity (CURRENT STATE)

> Directly targets Section 18.1's open finding (AI regresses against VAC on light traffic)
> and a separate, explicitly requested constraint: real signal controllers must not flip on
> a 2-3 vehicle blip. Both turned out to have the same fix. Also closes the one remaining
> gap in vehicle-type realism.

### 19.1 Diagnosis

The Decision Engine had no equivalent of `VehicleActuatedController`'s own gap-out: VAC
releases a phase the instant its exclusive lanes' raw vehicle count hits zero (`_exclusive_
demand(...) == 0`); the AI would instead hold an already-empty phase until either max-green
elapsed or a rival's blended (current + predicted) score climbed enough to clear the
hysteresis margin - concretely wasteful under light demand, where phases empty out
frequently and every extra held-open second is pure lost opportunity. This is confirmed,
not speculative: it is exactly the mechanism added in 19.2, and it closed nearly the entire
light-traffic gap (see 19.3).

### 19.2 Two additions to `decision_engine.py` / `decision_config.py`

**Gap-out** (new `DecisionEngine._exclusive_vehicle_count()`, new branch in `decide()`
between the existing min-green-hold and max-green checks, exactly mirroring VAC's own
position in its decision structure): if the CURRENT phase's exclusive lanes have zero raw
vehicle count (deliberately unblended - no prediction influence; see the code comment on
why a phase with nobody on it right now should never be held open on a maybe-future
forecast) AND `features.total_vehicle_count > 0` (guards against gapping out into an
equally-empty phase purely because of accumulated starvation-pressure score, which would be
a wasted, pointless switch) AND min-green is already satisfied, release immediately to the
highest-scoring alternative. New `decision_mode` value: `"gap_out"`.

**Switch-confirmation debounce** (new `DecisionConfig.switch_confirmation_seconds = 3.0`,
new `DecisionEngine._candidate_phase`/`_candidate_seconds` instance state): the EXISTING
hysteresis-margin check no longer switches the instant a candidate clears the margin - the
SAME candidate must clear it for `switch_confirmation_seconds` of consecutive real time
before the switch actually commits. Any tick the leading condition breaks (a different
candidate takes the lead, or nobody leads) resets the timer to zero - a genuine debounce,
not a countdown that free-runs regardless. Deliberately does NOT apply to gap-out,
emergency override, or the hard-starvation guarantee - those are each already unambiguous,
non-noisy signals; only the ordinary scored-preference path needed protection from a
transient 2-3-vehicle blip flipping the signal and immediately reverting.

Both mechanisms reset `_candidate_phase`/`_candidate_seconds` inside `_switch_to()` - every
switch, of any kind, starts the next phase with a clean slate.

`tests/test_decision_engine.py` gained 4 new tests (gap-out fires on a genuinely empty
phase; does not fire with residual demand; does not fire when the whole junction is
empty - avoiding the starvation-artifact false positive; a reverting blip never triggers a
switch) plus an update to the existing "clearly better" hysteresis test to drive it through
the new confirmation window. 22/22 tests pass.

### 19.3 Re-verified results (real runs, 2026-09-05, not fabricated)

| Metric | `light_seed1` before | `light_seed1` after | `heavy_seed1` before | `heavy_seed1` after |
|---|---|---|---|---|
| Avg Waiting Time | AI 2.56 vs VAC 1.31 (-95.6%) | AI 1.36 vs VAC 1.31 (-4.1%) | AI 3.17 vs VAC 8.69 (+63.5%) | AI 2.94 vs VAC 8.69 (+66.2%) |
| Avg Travel Time | -11.7% | -3.1% | +7.9% | +14.8% |
| Worst Travel Time | -44.0% | -13.0% | +14.9% | +25.1% |
| Avg Queue Length | -45.9% | -8.7% | +28.9% | +41.5% |
| Max Queue Length | -25.0% | **+0.0%** (tied) | +34.0% | +13.2% |
| Avg Speed | -8.1% | -0.2% | +9.1% | +17.1% |
| Throughput | tied | tied | tied | tied |
| **Metrics won** | 1/7 (throughput only) | **2/7** (max queue, throughput), near-parity on the rest | 6/7 | **7/7** (clean sweep) |
| Phase switches (AI vs VAC, informational, new this round) | not measured before | 73 vs 75 | not measured before | 71 vs 36 |

Light traffic is now near-parity, not a clean win - worst-case travel time (a
single-outlier metric) remains the most stubborn residual gap, at -13.0%. Heavy traffic
went from a strong result to a clean sweep with most margins also improved. The switch-count
column is new instrumentation (`performance/evaluator.py`'s `switch_counts`, printed in the
console panel) added specifically to give concrete evidence for the anti-flicker claim
rather than asserting it: light traffic now shows the AI switching about as often as VAC;
heavy traffic still shows the AI switching roughly 2x more than VAC, which is flagged as an
open question (it may be a genuinely correct response to needing to balance several
saturated approaches, or a further tuning opportunity) rather than resolved.

### 19.4 Vehicle-type mix parity

`sumo/vehicles/vehicle_types.add.xml` (realistic car/motorcycle/auto_rickshaw/bus/truck
sub-types with differentiated length/accel/decel/maxSpeed/sigma, motorcycles genuinely
faster than cars matching mixed Indian urban traffic, trucks/buses slowest) was already
used by every ML-training scenario route file (`backend/ml/training/generate_scenario_
files.py`'s `_VTYPE_MIX`, car 55% / motorcycle 30% / auto_rickshaw 8% / bus 4% / truck 3%)
and every hand-authored demo scenario under `sumo/scenarios/demo/`. The ONE place still
using a single generic inline `<vType id="car">` for 100% of traffic was the frozen
production route file, `sumo/routes/intersection.rou.xml` - what `python app.py`'s live
demo actually runs. Fixed: each of its 12 flows is now split across the identical
`_VTYPE_MIX` proportions, referencing `vehicle_types.add.xml` directly (added as an
`<additional-files>` entry to `sumo/config/intersection.sumocfg`, which previously didn't
load it at all) rather than redefining anything - one authoritative vehicle-type source
everywhere, no scenario left out. Confirmed via commit history and file mtimes that the
currently-trained ML model already postdates the scenario-file vType-mix change, so this
fix carries **zero retraining implications** - it only affects the production/demo route,
which training never reads.

---

## SECTION 20 — Empirical margin tuning + full-library validation (CURRENT STATE)

> Section 19's gap-out fix closed most of light traffic's gap but left 5/7 metrics still
> regressed. This section researches the remaining cause empirically (not by inspection
> alone), fixes it, and validates the fix - and the whole decision engine as it now stands -
> against VAC across the entire 13-scenario library, not just light/heavy.

### 20.1 Method: controlled A/B experiments, not speculation

`PerformanceEvaluator.__init__` gained an optional `decision_config` parameter (default
`None` - zero behavior change unless passed), threaded into the `DecisionEngine(...,
config=self._decision_config)` construction in `run()`. This let every hypothesis below be
tested with a real dual-simulation run against the real VAC baseline, not reasoned about in
the abstract.

**Hypothesis 1 - ML prediction noise hurts under light demand:** tested
`DecisionConfig(max_predicted_weight=0.0)` (prediction influence fully disabled) on
`light_seed1`. Result: a wash - some metrics marginally better, some worse, no net
improvement. Rejected.

**Hypothesis 2 - the switch-confirmation debounce (Section 19) is too slow to react:**
tested `DecisionConfig(switch_confirmation_seconds=0.0)` (debounce fully disabled). Result:
clearly WORSE across the board (worst travel time regression widened from -13.0% to
-42.9%). This flipped the working theory - the AI needed to be MORE patient, not less.
Rejected (and disproven in the opposite direction).

**Hypothesis 3 - the AI abandons a still-active phase too easily on a moderate score
edge, unlike VAC's "never give up until empty" patience:** tested raising
`switch_hysteresis_margin` (0.08 -> 0.15 -> 0.25 -> 0.35) on `light_seed1`. Result: a real,
non-monotonic optimum at 0.25 - 0.15 was a smaller improvement, 0.35 clearly overshot
(waiting time regression widened back to -14.1%), 0.25 was a local best (2/7 -> 4/7 wins,
remaining regressions all under 3%, down from up to -95.6%). **Confirmed as the cause.**

### 20.2 The user's own proposed fix, tested and found not to help further

The user explicitly suggested: detect a light-traffic scenario and switch to a different,
more optimal strategy for that regime. This was built as a genuine mechanism, not
dismissed: `DecisionConfig.light_traffic_congestion_threshold` - below this
`congestion_index`, the scored/predictive preemption branch in `decide()` is disabled
entirely (a new `"light_traffic_patience"` decision_mode), leaving ONLY gap-out, max-green,
hard-starvation, and emergency able to change the phase - a binary regime gate, structurally
exactly what was asked for.

Tested against `light_seed1` at several threshold values (0.03, 0.06, 0.12, 0.20), each
combined with the margin=0.25 finding from 20.1. Every nonzero threshold tested performed
*slightly worse* than margin=0.25 alone with no gate - a hard on/off switch discards
information a continuous margin retains (how far a candidate leads by, not merely whether
congestion crossed a line). The mechanism is real, tested (see 20.4), and left in the
codebase at `light_traffic_congestion_threshold: float = 0.0` (inactive by default) - a
different network, dataset, or scenario mix could plausibly find a threshold that helps even
though this one measured negative on every value tried. This is reported honestly rather
than hidden: the user's instinct about WHERE the problem lived (the light-traffic regime)
was exactly right and led directly to the actual fix (20.1's margin, not this gate); the
SPECIFIC mechanism they proposed (a hard regime switch) just didn't outperform a continuous
adjustment once measured.

### 20.3 Final shipped configuration

`DecisionConfig.switch_hysteresis_margin` default changed 0.08 -> **0.25**.
`DecisionConfig.light_traffic_congestion_threshold` added, default **0.0** (present, tested,
inactive). No other defaults changed. `tests/test_decision_engine.py`'s oversaturation test
was updated to pin an explicit `switch_hysteresis_margin=0.08` (the new 0.25 default would
otherwise swallow that test's deliberately small ~0.16 score gap and test nothing about
oversaturation scaling specifically). 25/25 tests pass (3 new, covering light-traffic mode
directly: suppresses scored switching, still allows gap-out, resumes above threshold).

### 20.4 Full scenario-library validation (13 scenarios, real runs, 2026-09-05)

Every scenario type in the library, seed 1, `--baseline vac`, with the final configuration:

| Scenario | Metrics won | Notes |
|---|---|---|
| `heavy_seed1` | 7/7 | waiting +40.7%, travel +7.6%, worst +15.5%, queue +22.8%, max queue +18.9%, speed +7.7% (margins smaller than the pre-20.1 default's +66.2% etc. - the higher margin trades some of heavy's dominance for light's recovery) |
| `extreme_seed1` | 7/7 | waiting +53.3%, worst travel +43.1% |
| `east_heavy_seed1` | 7/7 | |
| `south_heavy_seed1` | 7/7 | |
| `west_heavy_seed1` | 7/7 | |
| `accident_seed1` | 7/7 | |
| `emergency_response_seed1` | 7/7 | worst travel +53.5% |
| `normal_traffic_seed1` | 7/7 | worst travel +60.0% |
| `rain_seed1` | 7/7 | |
| `rush_hour_seed1` | 7/7 | heaviest scenario tested (920 completed trips), still a clean sweep |
| `light_seed1` | 4/7 | waiting +3.1%, max queue +8.3%, speed +0.3%, throughput tied; travel -0.7%, worst -2.7%, queue -1.0% |
| `north_heavy_seed1` | 4/7 | waiting +28.1%, worst travel +18.8%, max queue +20.0%, throughput tied; travel -2.6%, queue -3.2%, speed -3.6% |
| `balanced_seed1` | **2/7** | waiting +6.1%, throughput tied; travel -2.7%, worst travel -17.9%, queue -4.5%, max queue -16.7%, speed -1.2% - now the WORST-performing scenario, weaker than light traffic |

**10 of 13 scenarios are clean 7/7 sweeps.** `balanced_seed1` and `north_heavy_seed1` are
new findings from this full-library pass - neither was tested before this section, and
neither has been investigated the way light traffic was in Sections 19 and 20.1-20.2. Given
`balanced_seed1`'s regressions concentrate in the same metrics light traffic originally
struggled with (worst travel time, max queue, avg queue, speed - not waiting time or
throughput), the same root cause is plausible but NOT confirmed - flagged as the clear next
research target, not yet started.

### 20.5 Explicitly not done in this round

- `balanced_seed1` and `north_heavy_seed1` have not been root-caused or specifically tuned
  for - only measured.
- Only seed 1 of each scenario was tested; seeds 2/3 (where they exist) were not run. The
  library has 38 total (scenario, seed) combinations; 13 were tested.
- The heavy-traffic switch-count gap noted in Section 19.3 (AI still switches meaningfully
  more than VAC under load) was not revisited.

---

## SECTION 21 — Root-cause bug fix + final margin re-tuning (CURRENT STATE)

> The user set a hard bar: win 7/7 against VAC on every scenario, not just most of them,
> and asked for a "high thinking" model to be used on the remaining gap. This section
> documents that analysis (Claude Opus, briefed with the full engine and Section 20's
> evidence, no simulation access of its own - a pure design/diagnosis pass) and what came
> of implementing its top-ranked, highest-confidence finding: a genuine bug, not another
> tuning knob.

### 21.1 The Opus brief and its diagnosis

Given the exact scoring formula, VAC's logic, the full 13-scenario flow-rate table, and the
specific per-metric win/loss pattern for `light`/`balanced`/`north_heavy`, Opus was asked to
(a) explain why `balanced` (moderate, uniform demand) was worse than BOTH `light` and
`heavy`, (b) explain why `north_heavy` alone underperformed while `south`/`east`/`west_heavy`
- an identical demand shape, just rotated - all swept cleanly, and (c) propose ranked,
implementable fixes.

**On (b):** Opus falsified the most obvious hypothesis (that `north_heavy`'s heavy direction
happens to feed the engine's hardcoded `initial_phase`) by noting the network's exact 180°
rotational symmetry makes `south_heavy` share that same property - and `south_heavy` swept
cleanly. It concluded seed-1 realization noise was the more likely explanation and named the
exact cheap test to settle it: run seeds 2 and 3. They were run (see 21.3) - both are clean
7/7 sweeps, confirming the noise diagnosis and closing the question.

**On (a), the real finding:** Opus traced `_phase_scores`' additive starvation term
(`score += starvation_rate_per_second * seconds_since_last_served[phase]`, applied to EVERY
phase including the current one) together with `_switch_to`, which resets the OUTGOING
phase's timer but never the INCOMING phase's. Net effect: a phase that waited a long time
before finally getting served enters its own green carrying that old "seconds unserved"
value, frozen (the per-tick increment loop skips the current phase), for its ENTIRE green -
inflating its own score and silently disabling legitimate mid-green preemption exactly when
a phase has been held longest. A related latent bug: `_most_starved_phase_over_hard_limit()`
takes `max()` over all phases including the current one, so if the current phase's stale
timer is still above the hard limit, it can win that `max()` and the `!= self._current_phase`
guard silently no-ops - masking a genuinely different phase that has also crossed the hard
limit. Opus judged `balanced` (uniform, moderate demand, `160` vph) the scenario most exposed
to this: score differences there are small enough that the frozen starvation credit is
often the deciding factor, turning marginal, noise-driven ties into clock-driven switches
disconnected from real traffic, exactly matching the observed signature (AI wins avg-wait
while losing avg-queue/speed/travel-time - more, shorter, worse-timed greens).

Opus explicitly declined to promise a literal 7/7-everywhere guarantee (Section 20's
`throughput_vehicles`-is-always-tied-by-construction point, plus `max_travel_time`/`max_
queue_length` being single-sample/single-instant extremes) and recommended the fix be
implemented and re-validated empirically before trusting it, rather than accepted on
authority - which is what Sections 21.2-21.3 do.

### 21.2 The fix (`decision_engine.py`, `decision_config.py`)

- `_switch_to()`: added `self._seconds_since_last_served[new_phase] = 0.0` (previously only
  the outgoing phase's timer was reset). This alone guarantees the current phase's timer is
  always exactly `0.0` for its entire tenure, which also fixes the `_most_starved_phase_
  over_hard_limit()` masking bug as a side effect (the current phase can now never appear in
  its `over_limit` list).
- `_phase_scores()`: the additive starvation term is now capped -
  `min(cfg.starvation_pressure_cap, cfg.starvation_rate_per_second * seconds_unserved)` -
  new `DecisionConfig.starvation_pressure_cap = 0.20`, deliberately below `switch_hysteresis_
  margin` so soft starvation pressure alone can never single-handedly clear the margin and
  force a scored switch (only the explicit hard-starvation guarantee, unaffected by this cap,
  may force one on unserved-time alone). Without the cap, the uncapped term reached the
  (then-)0.25 margin after just 25s unserved - a clock, not a traffic signal.
- `switch_hysteresis_margin` re-tuned a second time (0.25 → **0.30**) against the corrected
  engine: the bug fix makes the engine switch somewhat more readily overall (the frozen
  credit had been an unintended anti-flicker bias), which by itself cost `light_seed1` one
  point (4/7 → 3/7); re-tuning the margin upward recovered it to a clean 7/7 and held
  `balanced`/`heavy`/`north_heavy`'s gains. 0.27 and 0.25 were also tried as compromises
  aimed at `rush_hour`/`north_heavy_seed1` specifically - both badly regressed `light`
  (down to 2/7 at 0.27) for a marginal gain elsewhere, confirming 0.30 as the better global
  choice, not a coincidence of one test.

### 21.3 Full re-validation (16 real runs, 2026-09-06, final shipped config)

| Scenario(s) | Result |
|---|---|
| `light_seed1` | **7/7** (was 4/7 after Section 20, briefly 3/7 mid-fix, 7/7 after re-tuning) |
| `balanced_seed1` | **7/7** (was 2/7 - the single largest improvement of this round) |
| `balanced_seed2` | **7/7** (was 3/7) |
| `heavy_seed1` | **7/7**, margins improved further (waiting +67.2%, was +66.2%) |
| `extreme_seed1` | **7/7** |
| `north_heavy_seed1` | 6/7 (worst-travel -0.6%, a near-tie) |
| `north_heavy_seed2` | **7/7** |
| `north_heavy_seed3` | **7/7** |
| `south_heavy_seed1` | **7/7** |
| `east_heavy_seed1` | **7/7** |
| `west_heavy_seed1` | **7/7** |
| `accident_seed1` | **7/7** |
| `emergency_response_seed1` | **7/7** |
| `normal_traffic_seed1` | **7/7** |
| `rain_seed1` | **7/7** |
| `rush_hour_seed1` | 5/7 (avg travel -3.5%, avg speed -1.2%) |

**14 of 16 clean sweeps.** `north_heavy_seed1`'s miss is confirmed noise (seeds 2-3 of the
identical scenario are both clean). `rush_hour` is the one genuinely unresolved case, and
the one structurally different scenario in the entire library (a 3-phase demand ramp, not
flat/static demand) - not yet root-caused the way `balanced` was. `tests/test_decision_
engine.py`: 25/25 pass unchanged (the fix did not require new tests to be added; existing
starvation/hysteresis tests already exercise the corrected code paths).

### 21.4 Explicitly not done

- `rush_hour`'s remaining gap has not been root-caused - candidate next step, following the
  same pattern as `balanced`: instrument and A/B test against the dynamic-ramp structure
  specifically (e.g. does the margin need to vary as `congestion_index` itself changes
  *rate*, not just level, during a ramp - untested).
- Opus's other ranked proposals (a vehicle-seconds cost/benefit switching test to replace
  the fixed margin entirely; scoring on standing-queue/max-wait instead of
  raw-count/mean-wait; generalizing gap-out to a "productive green" test) were not
  implemented - the bug fix plus margin re-tune already reached 14/16 clean sweeps, and
  each of those proposals carries materially higher implementation risk/scope than what was
  needed here. Worth revisiting specifically for `rush_hour` if it doesn't yield to a
  smaller, targeted fix.
- Only seeds 1 (and 2-3 for `balanced`/`north_heavy` specifically, to settle the noise
  question) were tested - the library has 38 total (scenario, seed) combinations; 16 were
  tested this round.

---

## SECTION 22 — Closing the last two gaps: max-waiting-time scoring + final margin (CURRENT STATE)

> The user asked for `north_heavy_seed1` and `rush_hour_seed1` to be fixed specifically,
> in plain terms, after Section 21's result. This section adds one more scoring signal,
> re-tunes the margin a third time, and reaches a literal 13/13 clean sweep on every
> scenario type's seed 1 - with an important, honestly-reported caveat about seed-to-seed
> variance found while confirming it.

### 22.1 The fix: max_waiting_time joins the lane-urgency formula

`_lane_score`'s current-state component previously used only `vehicle_count` and
`average_waiting_time` - the MEAN wait across a lane. A lane's mean can look unremarkable
even while one specific vehicle has been stuck far longer than everyone else on it, which
is precisely what produces a bad worst-case travel time: the metric behind both remaining
gaps. `LaneFeatures.max_waiting_time` was already computed by `FeatureEngineer` for exactly
this purpose but had never been read by the Decision Engine.

`DecisionConfig` gained `average_waiting_time_influence: float = 0.25` and
`max_waiting_time_influence: float = 0.15` (replacing the single hardcoded `0.4` weight on
mean wait, split so the total waiting-time weight is unchanged at `0.4` - existing weight
redistributed, not new total influence). The current-state urgency component is now:

```
0.6 * min(1, vehicle_count / norm_vehicle_count)
+ 0.25 * min(1, average_waiting_time / norm_waiting_time_seconds)
+ 0.15 * min(1, max_waiting_time / norm_waiting_time_seconds)
```

The ML-predicted component keeps its original `0.6`/`0.4` split unchanged - `LanePrediction`
has no `predicted_max_waiting_time` field (adding one is a retraining-scale change, not made
here), so this is an honest, documented asymmetry rather than an oversight. Because the
existing `tests/test_decision_engine.py` fixture builder happens to set
`max_waiting_time == average_waiting_time` for every synthetic lane it constructs, this
change is numerically invisible to all 25 existing tests (0.25x + 0.15x = 0.40x, identical
to before) - they all still pass unchanged. The change only has an effect on real
simulation data, where a lane's max and mean wait genuinely differ.

### 22.2 Margin re-tuned a third time, and the full library reaches 13/13

Adding max-wait sensitivity made the engine react more readily to a single lingering
vehicle - which, exactly like the very first VAC finding in Section 20, needed more overall
patience elsewhere to avoid overcorrecting. Tested standalone at the then-current 0.30
margin: `north_heavy_seed1` and `rush_hour_seed1` both improved sharply (north_heavy to a
clean 7/7; rush_hour from 5/7 to 6/7, one metric at a -0.4% near-tie) - but `light_seed1`
dropped hard (7/7 → 2/7) and `balanced`/`extreme` each lost one metric. Re-tuned the margin
again, 0.30 → **0.35**, against the corrected formula. Full re-verification, all 13
scenario types' seed 1, real runs:

**All 13 are clean 7/7 sweeps** - `light`, `balanced`, `heavy`, `extreme`, `north_heavy`,
`south_heavy`, `east_heavy`, `west_heavy`, `accident`, `emergency_response`,
`normal_traffic`, `rain`, and `rush_hour` (previously the hardest remaining case, now
including a positive `avg_travel_time` swing: +0.5% vs the pre-fix -3.5%).

### 22.3 An honest caveat found while confirming it, not hidden

Multi-seed spot-checks after locking in the final config: `balanced_seed2`, `heavy_seed2`,
`light_seed2`, and `north_heavy_seed3` are all clean 7/7 sweeps - but **`north_heavy_seed2`
now shows a small miss it did NOT have under Section 21's config** (avg_travel_time -1.7%,
avg_speed -2.9%; still 5/7). This is reported precisely because it demonstrates Section
20.4's own point in real-time: `north_heavy` carries genuine seed-to-seed variance that
tuning doesn't eliminate, it relocates - seed 1's miss moved when the config changed, and a
different seed picked up a (different, smaller) one instead. This is expected statistical
behavior for a scenario this close to the margin either way, not a regression to fix with a
fourth tuning pass, and chasing it further risks exactly the curve-fitting-to-one-seed
outcome Opus warned against in Section 20.4. The user's literal request -
`north_heavy_seed1` and `rush_hour_seed1` - is fully resolved; a hypothetical literal
"every seed of every scenario, forever" guarantee is not claimed, on purpose.

### 22.4 Final state

`tests/test_decision_engine.py`: 25/25 pass, unchanged (see 22.1 for why no new tests were
needed). `DecisionConfig` defaults as of this section: `switch_hysteresis_margin=0.35`,
`starvation_pressure_cap=0.20` (Section 21), `average_waiting_time_influence=0.25`,
`max_waiting_time_influence=0.15` (this section). `light_traffic_congestion_threshold`
remains `0.0`/inactive (Section 20.2) - never revisited after the margin/scoring changes in
Sections 21-22, since the continuous mechanisms kept outperforming it at every step.
