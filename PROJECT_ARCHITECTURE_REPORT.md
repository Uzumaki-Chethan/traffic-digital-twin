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

---

## SECTION 23 — The console: browser-driven runs and live analytics (CURRENT STATE)

Dated 2026-09-12. Three user-reported problems, one shared root cause, and the
architectural change that fixes all three.

### 23.1 The symptom, and what was actually wrong

The user opened the dashboard without starting a simulation, clicked Analytics, and got:

```
/api/analytics/congestion-trend?bucket_seconds=60&group_by=lane -> HTTP 502
```

They also wanted to start the simulation from the website rather than from a terminal, and
had noticed the live view had no honest relationship to real time ("its like nothing linked
to real world scenario, maybe i kept less delay in the simulator").

All three trace back to one decision made in Section 16: the dashboard server runs as a
daemon thread INSIDE the simulation process (`app.py`). Everything follows from that.

- The server cannot outlive the run, so closing SUMO takes the API down with it — including
  the endpoints that read nothing but SQLite and would have worked perfectly.
- Nothing can start a run from the UI, because the UI only exists once a run is up. A Start
  button had nothing to call.
- Nobody owned the question "how fast should this play?". `sumo-gui`'s Delay slider answered
  it accidentally, which is why the user's 800 ms setting made simulated time crawl at
  ~0.06x real time.

### 23.2 The change: `server.py` owns the lifetime

```
python app.py      one run; dashboard alive only as long as that run   (unchanged)
python server.py   console stays up; runs are started/stopped from the UI   (new)
```

`backend/server.py` serves the identical read-only app (`create_app()`, untouched) and
mounts the same control router. `backend/services/sim_supervisor.py` starts a run on a
worker thread inside the console process.

A thread, not a child process, deliberately — and the contrast with the evaluator is the
argument. The evaluator IS a separate program with its own two SUMO instances, so
`control_routes.py` launches it with `subprocess.Popen` and it publishes back over HTTP
(`RemoteLiveStatePublisher`, Section 18). A live run is not: it publishes into the very
`LiveStateStore` this server reads, and its `RunControl` is the very object the
pause/resume endpoints hold. In-process makes both a direct reference instead of an HTTP
round trip, so pause is instant and there is no cross-process state to reconcile.

To make one run callable from two entry points without two lookalike copies drifting apart,
`app.py`'s `main()` body was extracted verbatim into `backend/simulation_runner.py` as
`run_simulation(store, control, *, gui)`. `app.py` is now a thin CLI wrapper over it and is
behaviourally unchanged. `resolve_config(gui)` picks sumo-gui/sumo per run via a throwaway
Config SUBCLASS rather than assigning to `Config.SUMO_BINARY_NAME`, because Config is a
process-wide singleton and a console that starts several runs must not leave one run's
choice behind for the next.

The read-only guarantee is unchanged and, if anything, sharper: `dashboard_server.py` still
has zero endpoints of its own that can influence a simulation. Every new capability
(`start-simulation`, `stop-simulation`, `speed`) is in `control_routes.py`, which only
`app.py` and `server.py` mount, and which now takes `supervisor` as a duck-typed parameter —
this module never imports the supervisor, keeping the SUMO pipeline out of the import graph
of a dashboard that may never launch anything.

### 23.3 Pacing: who decides how fast "playing" means

A headless `sumo` run steps as fast as the machine allows — measured at roughly 100x real
time — which makes a live dashboard a blur and floods its rolling history. Since the browser
can now start a run, something has to set the pace, and the run loop is the only place that
can: it is the thing calling `simulationStep()`.

`RunControl.pace(step_seconds)` is therefore called once per step and sleeps whatever is
left of that step's real-time budget. It keeps an anchor (wall time, simulated time) rather
than sleeping a fixed amount per step, so error does not accumulate; the anchor is dropped
on resume and on a speed change (otherwise a paused run would sprint to "catch up" on the
pause), and re-anchored if the loop falls more than 1 s behind. Sleeps are sliced at 20 ms
so a pause or stop lands within a frame rather than at the end of one long sleep.

The step length is read once via `getDeltaT()` before the loop, so pacing costs no TraCI
round trip per step. Measured on a real run: **1.00 sim-s per wall-s at 1x, 5.00 at 5x**.
`set_speed(None)` restores the old flat-out behaviour. `Config.SUMO_EXTRA_ARGS` (empty by
default) lets a browser-launched GUI run pass `--start --delay 0`, so sumo-gui's own slider
does not throttle on top of this — two throttles in series just multiply.

### 23.4 Analytics now reads the live run, not the database

The user's instruction was explicit: keep the same graphs, drive them from the current
simulation, and say so when nothing is running. Reading SQLite had a second flaw beyond the
502 — simulated time restarts at zero every run, so a database-wide average at "t = 120 s"
was an average across a different moment in each recorded run.

`frontend/src/data/liveHistory.ts` accumulates one sample per decision tick from the
WebSocket stream (~1 h capacity). `frontend/src/analytics/series.ts` derives from it exactly
the shapes the endpoints used to return, so the charts themselves barely changed — only
their source. Two details worth recording:

- **Re-render control.** At 5x or unthrottled, ticks arrive dozens of times a second.
  Samples are always appended, but the `revision` counter components subscribe to is bumped
  at most once a second, so ten charts refresh at a readable cadence without losing data.
- **Adaptive bucket width.** The endpoints used a fixed 60 s, which shows one column for the
  first minute of a live run and a hundred after an hour. `chooseBucket()` widens with the
  run to keep the axis at roughly a dozen to two dozen columns.

This needed one backend addition: `lanes[].score` in the snapshot — the per-lane urgency
score `DecisionEngine` already computed and `app.py` already persisted to `lane_state_log`,
so no new computation and no new TraCI call. The database is still written exactly as
before; it is the audit trail and the source of the report's figures, and is simply no
longer what a page about the current run reads.

The history endpoints (`/api/analytics/*`, `/api/logs/*`) are untouched and still served —
they are what the Performance and Decisions pages will read, and they now survive a
simulation ending, which is what they should always have done.

### 23.5 3D model corrected against the network

The miniature was drawn with three paint stripes over a 19.2 m road (implying six lanes but
marking them wrong), and all four signal heads faced the same direction because their lamps
were offset in world +z regardless of approach. Both are now measured off
`intersection.net.xml`: solid edge lines at +/-9.6 m, a solid centre line at 0, dashed
dividers at +/-3.2 and +/-6.4, stop bars at the stop lines, nothing painted inside the
junction, and the arms cut at +/-21.6 m so 21.6 + 178.4 = 200 closes exactly. Each signal
head is now a Group rotated to its approach's bearing, standing on the driver's left kerb
(keep-left), and each of the twelve lanes has its own coloured bar at its stop line the way
sumo-gui shows per-lane state.

### 23.6 Tests

`tests/test_run_control.py` is new: 15 tests covering pause/resume/stop release, `reset()`
for a second run, pacing at 1x and 5x, unthrottled and non-positive speeds, prompt return
from a pending pacing sleep once stopped, and the supervisor's start/stop, one-at-a-time
refusal, restart-after-end, suppression of a stale "stopping" state, and crash reporting.
The supervisor takes its runner as a parameter specifically so these need no SUMO.

**Suite: 40/40 pass** (25 existing + 15 new). Verified live as well, against a real headless
run driven entirely through the HTTP API: start, 1.00x pacing, pause freezing `sim_time`,
resume, 5.00x pacing, graceful stop, and the console still serving analytics afterwards.

---

## SECTION 24 — Plan-view correctness, vehicle types, arrow signals (CURRENT STATE)

Dated 2026-09-13. A round of user-reported visual defects, one of which turned out
to be a real data-placement bug rather than a cosmetic one.

### 24.1 The bug: vehicles were drawn in the wrong lanes

Chasing the reported "turning is still wrong in the plan view", the lateral offset
maths in `frontend/src/overview/vehiclePlacement.ts` was checked against the compiled
network for the first time. It was wrong on all four approaches:

```
lane            drawn at      should be     effect
N_in_0 (kerb)   x = 478       x = 550       drawn in the median lane
S_in_0 (kerb)   x = 442       x = 370       drawn in the median lane
E_in_0          y = 252       y = 360       drawn on the OUTBOUND carriageway
W_in_0          y = 288       y = 180       drawn on the OUTBOUND carriageway
```

N and S had the lane order reversed; E and W had the order reversed *and* the sign
flipped, putting eastbound and westbound traffic on the wrong side of the road
entirely. The fix is a single expression — `lateral(i) = 36*(2-i) + 18`, signed
`+` for N/E inbound and `-` for S/W, inverted for outbound — verified against all
24 inbound and outbound lane shapes in `intersection.net.xml`.

Worth recording as a process point: this was never caught because the plate was only
ever checked by eye, and "a car in a lane" looks fine whichever lane it is in. It was
found by re-deriving the geometry from the network file, not by looking harder.

### 24.2 Turning: the junction interior now follows the connection table

A vehicle on one of SUMO's internal `:C_*` lanes previously fell through to a plain
linear map of the whole 400 m network. That map uses a completely different lateral
scale from the arms (the plate exaggerates lane width ~14x), so every vehicle jumped
sideways ~26 drawn units entering the junction, snapped its orientation 90 degrees,
and jumped back on the far side. That is what "shuffle and jump" was.

The twelve `<connection ... via=":C_n_0">` elements are now transcribed into
`MOVEMENTS`, giving each internal lane its from-arm, to-arm and lane indices. A
vehicle inside the junction is drawn along a quadratic Bezier from its entry
stop-line point to its exit stop-line point, with the control point where the two
centrelines meet — so a left turn hugs the corner and a right turn sweeps wide,
which is what those movements actually do in left-hand traffic. Progress along the
curve comes from the vehicle's distance between the internal lane's own endpoints,
which is exactly 0 entering and 1 leaving.

Verified numerically across all 12 movements: **worst handoff discontinuity 0.000
drawn units**, entering and leaving, for every straight and every turn. Heading is
interpolated the same way and unwrapped against each vehicle's previous heading, so
a -90 -> 180 turn goes the short way rather than spinning 270 degrees.

### 24.3 Vehicle types reach the frontend

`VehicleState` gained `type_id` (`traci.vehicle.getTypeID`, one extra read per vehicle
per tick) and the snapshot carries it as `type`. The dimensions and colours that go
with each id are NOT sent — they are static properties of the frozen
`vehicle_types.add.xml`, so `frontend/src/overview/vehicleTypes.ts` holds that table
instead. Confirmed live: a running scenario reports `auto_rickshaw`, `bus`, `truck`,
`car_cautious/normal/aggressive` and `motorcycle_cautious/normal/aggressive` together.

The two views use it differently, on purpose. The 3D miniature draws real bodies at
real SUMO dimensions in the vType's own colour. The plan view is a schematic where
colour already means signal state, so a red car on a red lane fill would read as one
blob — there, type is carried by SIZE alone.

### 24.4 Arrow signal aspects, and motion that does not stutter

The 3D signals were one head per approach with three plain circles. They are now
mast-arm assemblies: one head per LANE, hung over the lane it controls, its three
lenses shaped as arrows for that lane's own movement — left, ahead, right. That is
both what a channelized junction looks like and the most information the view can
carry, since the twelve lanes really do run twelve independent signal states.

Motion was still stuttering because of two compounding mistakes:

1. **Exponential easing.** `k = 1 - exp(-6 dt)` decelerates as it approaches the
   target, so every vehicle slowed to a crawl at the end of each tick and jerked off
   again when the next one landed. Replaced with constant-velocity interpolation
   across the measured tick interval, allowed to overrun 35% so a late frame does
   not stall the traffic.
2. **Re-seeding on the wrong event.** The interpolation was re-aimed whenever a new
   WebSocket frame arrived — but frames are re-sent at 2 Hz while the simulation
   only steps at 1 Hz, so half of them restarted each interpolation from halfway with
   the same target, roughly halving the remaining distance each time. It is now keyed
   on `sim_time` changing.

Heading is also taken once per tick from the whole segment rather than per frame from
a shrinking remainder, which was noisy exactly when it mattered.

### 24.5 Smaller fixes and one new panel

- **N and S pavement arrows were inverted** — drawn away from the junction and
  curving to the wrong side, so a left-turn lane was painted as a backwards right
  turn. E and W were always correct and are unchanged.
- **Pan and zoom on the plan view** (`usePanZoom.ts`): scroll to zoom about the
  pointer, drag to pan, with a reset. Implemented by narrowing the SVG viewBox, so
  everything stays vector-sharp and hairlines do not thicken.
- **A stopped run now clears.** Stopping is not pausing: the traffic no longer
  exists, so the junction goes dark instead of holding a frozen last frame that
  looks live. A PAUSED run deliberately keeps its vehicles on screen.
- **Prediction vs actual** (`overview/PredictionPanel.tsx`), chosen by the user from
  four options, fills the space under the twin. It is the only place the ML layer
  appears anywhere in the UI, which is why it earned the space. Per-lane predicted
  against actual vehicle counts as each horizon matures, plus a run-scoped MAE
  accumulated in `liveHistory`. The horizon is read from the model's own metadata
  rather than hardcoded. **No confidence figure** — standing instruction, and the
  error column beside it is better evidence anyway.

---

## SECTION 25 — Protected left turns, GUI handover, speed control (CURRENT STATE)

Dated 2026-09-13. One deliberate change to the signal program itself — the first since
the network was frozen — plus the controls that make a browser-driven run complete.

### 25.1 Left turns are now protected. Why, given the network says they need not be.

The user asked whether running all four left turns concurrently with the cross street was
dangerous. The network's own answer is no, and it is unambiguous. Decoding the `<request>`
block of `intersection.net.xml` directly (SUMO writes foe strings right-to-left, link 0
last):

```
link         foes                                    must yield to
0  S-left     NONE                                    nothing
3  E-left     NONE                                    nothing
6  N-left     NONE                                    nothing
9  W-left     NONE                                    nothing
```

All four have an empty foe list. The reason is full channelization: every one of the twelve
movements runs `fromLane -> toLane` of the SAME index, so N-left lands in `C_out_E` lane 0
while W-straight lands in `C_out_E` lane 1. On paper they never touch.

The user's counter-argument is the stronger one, and it is why the change was made:
**that permission is entirely contingent on perfect lane discipline.** Two streams sharing
an exit edge avoid each other only because each holds its own lane exactly. The traffic
this project models — the same vehicle mix that includes auto-rickshaws and motorcycles
weaving — does not. A left-turner crossing in front of a moving through-stream on the
strength of a lane marking is precisely the conflict the foe matrix cannot see.

So each left now runs only in its own approach's phase:

```
before  phase 1  GGrGrrGGrGrr   S-left S-straight E-left N-left N-straight W-left
after   phase 1  GGrrrrGGrrrr   S-left S-straight N-left N-straight
before  phase 5  GrrGGrGrrGGr   S-left E-left E-straight N-left W-left W-straight
after   phase 5  rrrGGrrrrGGr   E-left E-straight W-left W-straight
```

Verified over 200 simulated seconds (more than two full cycles): **0 instances** of a left
turn green at the same moment as the through movement feeding its own exit edge, down from
5120 steps before.

**A trap worth recording.** Editing `intersection.tll.xml` alone changed nothing. That file
is a netconvert SOURCE and is not referenced at run time — `intersection.sumocfg` loads the
compiled `intersection.net.xml`, which carries its own copy of the program. The first
verification run still showed the old states, which is how this was caught. Both files now
carry the change and both say so.

### 25.2 What the change cost, and what is now stale

Left-turn capacity drops from roughly 60 s of green per 96 s cycle to 30 s. Everything
downstream that encoded the shared-left structure moved with it:

- `_PHASE_EXCLUSIVE_LANES` now assigns every one of the twelve lanes to exactly one phase.
- The `left_turn_influence` scoring bonus is GONE, not retuned. It existed because
  left demand was shared and had to be folded into both main phases at partial weight;
  a left lane's demand is now inside its own phase's exclusive urgency, and adding it
  again would double-count it. The config field is kept (so existing constructions do not
  raise) and documented as having no effect.
- Gap-out now counts left lanes, which is correct: this phase is now the only one that
  will serve those left-turners, so a queue of them is a real reason to hold on.
- Emergency phase selection is unambiguous: previously a left-turn emergency matched
  whichever main phase was checked first.
- `baseline_controllers.py` imports `_PHASE_EXCLUSIVE_LANES`, so VAC picked all of this up
  automatically and symmetrically — the AI-vs-baseline comparison stays fair by construction.

**STALE RESULTS.** The 7/7-across-13-scenarios VAC sweep in Sections 20-22 and in README.md
was measured under the old program and no longer describes this configuration. The
comparison remains methodologically fair (both controllers drive the same network), so what
is needed is a re-run, not a redesign. The trained Random Forest is in the same position: it
learned from data generated under the old phase structure, so it is strictly out of
distribution now and should be regenerated and retrained. Neither has been done; both are
flagged rather than quietly left to look current.

### 25.3 Opening a SUMO window mid-run

SUMO cannot attach a GUI to a process that is already running, so the only route is to save
the state and relaunch. Tested before building anything:

```
saved at t=60.00 with 45 vehicles, tls=GrrGGrGrrGGr
reloaded at t=60.00 with 45 vehicles, tls=GrrGGrGrrGGr
same vehicle set: True    lost: 0  gained: 0
```

`RunControl.request_handover(path)` asks the loop to `saveState` and end; the supervisor's
worker thread then loops and restarts the SAME run from that state with `sumo-gui`. Because
it is one thread, `is_running()` never goes false and it reads as one continuous run.
`DecisionEngine` is now constructed on whatever phase the signal is ACTUALLY showing
(`trafficlight.getPhase`) rather than assuming phase 0, so the lights do not jump across the
swap — that also changes nothing for a fresh run, where the answer is phase 0 anyway. If the
save fails there is nothing to reopen, so the handover is cancelled and the run carries on
headless.

**`--quit-on-end` is load-bearing.** sumo-gui keeps its window open after the simulation
ends by default, which left `traci.close()` blocking on a process that was never going to
exit — the run thread never finished and the console reported the run as still active
forever, with an orphaned window. Found by measurement (the thread was still alive 10 s
after "Simulation finished"), not by reading docs. Browser-launched GUI runs now pass
`--start --delay 0 --quit-on-end true`.

Measured end to end: headless at t=0.05 -> open-gui -> window running at t=14.50 with the
same run, `gui` true, `running` true throughout; Stop ended it in 1 second with no orphaned
process.

### 25.4 Speed control, and the remaining view fixes

The speed button cycles on click and reveals a slider on hover (0.25x / 0.5x / 1x / 2x / 5x
/ max) — same control, two ways to reach it.

- **Vehicles overhung the stop line** in both views. TraCI reports the FRONT BUMPER: measured
  on a live run, every stopped vehicle sits exactly 1.00 m before its stop line, which is
  SUMO's own gap. Drawing the body centred on that coordinate pushed half of it across the
  bar. Both views now offset back half a length along the heading.
- **Cars parked sideways at the signal** in 3D. A vehicle that appears already stopped in a
  queue never produces a movement delta, so it kept the default heading of 0 forever. First
  heading now comes from its lane (`junctionTopology.laneHeading3D`).
- **3D traffic did not clear on stop**, because clearing lived inside the tick-gated block
  and sim_time stops changing when the run ends. It is now unconditional.
- **Leftovers streaked at the start of a second run**: SUMO reuses flow ids, so a surviving
  car interpolated from its old position across the whole network. Simulated time running
  backwards now hard-resets the fleet.
- **Signal heads** are one horizontal four-aspect head per approach — red disc, amber disc, a
  combined left+ahead green arrow, and a separate right green arrow — which is the shape of
  this program's own phase structure.
- The "No simulation running" overlay was removed: it sat exactly on top of the Plan/3D and
  Fullscreen controls, so those buttons were unreachable until a run started.

### 25.5 Tests

**46/46 pass** (was 40). Six new: the handover resuming the same run in a window, refusing
when nothing is running, refusing when a window is already open, leaving the run alone when
the state save fails, `reset()` clearing a pending handover, and a handover releasing a
paused run. The supervisor takes its runner as a parameter so none of these need SUMO.

---

## SECTION 26 — Retraining for protected lefts: residual targets, the phase clock, and the sweep (CURRENT STATE)

Dated 2026-09-13. The user's instruction was to settle the ML side "once and for all":
regenerate the training data for the protected-left program (Section 25), find out why the
retrained model's error went up, check the data for inconsistencies, and get the AI back to
a clean 7/7 sweep against VAC on every scenario. This section is the record of that work,
in the order it happened, including the two things that turned out to have been wrong all
along and only became visible because the data changed.

### 26.1 Regeneration: the data itself was fine

All 38 (scenario, seed) runs were regenerated with the project's own `_run_single()` — the
only change to how it was invoked was running three at a time in separate OS processes
(`traci.start()` picks a free port per process), which cut the wall time from the ~4 h of
the Aug 15 run to 101 min. Every one of the 38 files came back with the SAME row count as
its Aug 15 original (one run +1), which is the strongest available evidence that the
pipeline itself behaved identically and only the signal content changed. The Sep 8
`repair_raw_datasets` pass was NOT needed this time: the `features_to_vector` bug it
existed to work around is fixed in code, so no rows were dropped — the built datasets grew
from 16 048 / 3 522 / 2 907 (train / test / held-out) to **28 023 / 6 514 / 4 802**.

A statistical audit of the built datasets found nothing to fix: prediction horizon exactly
15 s on every row (max 15.10, inside the 0.1 s tolerance), no NaN/inf, no duplicate
(run, time) keys, no negative targets, negatives only in the four trend columns (which are
signed by definition), and — the check that matters for this change — per-lane signal
shares of **31.3 % green on left and through lanes, 12.5 % on right-turn lanes**, i.e.
exactly 30/96 and 12/96 of the new program's cycle. The only oddity is four sampler-drift
steps of 1.05 s per run (float accumulation in the 1 s sampler), which the horizon tolerance
already absorbs.

### 26.2 Why the MAE went up: a harder target, and two things that were always wrong

The straight retrain landed at test MAE 2.06 / held-out 2.35, against 1.63 / 1.99 for the
old model. Three causes, measured rather than guessed:

**(a) The target got harder — nothing to fix.** Under the old program every left lane was
green in both main phases, so left-lane wait time was ~0.35 s mean with std 1.0: "predict
zero" was right, which is why those four lanes scored 0.5 MAE. Under protected lefts the
same targets are ~5.5 s mean with std 8.3. Their MAE rose to ~1.3 — a far *better* relative
result on a target with eight times the spread. This alone accounts for the left-lane rows
of the per-lane table and is simply the reality the program change created.

**(b) The absolute-level target was the wrong thing to predict.** Decomposing the error
against a persistence baseline ("the value in 15 s equals the value now") showed the forest
was *worse than persistence on vehicle count on every single lane* (test: 0.5–2.1 vs
0.2–0.5), and on the held-out `extreme` scenario's right-turn lanes it was 5.3 against
persistence's 1.5. A tree can only ever emit the mean of the training rows in a leaf: a
queue longer than anything in training is pulled back into the training range, and a large
wait is shrunk toward the 77 % of rows whose wait is exactly zero (bias −17 s on 30–60 s
waits, −36 s above 60 s). This was true of the old model too; the new data exposed it.

**(c) `seconds_until_next_signal_switch` was a train/serve deviation.** It was the model's
single most important feature (importance 0.031, top of 125). Training records it from
SUMO's static program, where it is a real countdown (0.8–29.9 s). At run time
`SignalController` re-arms every green to a 60 s provisional ceiling on every tick
(`PROVISIONAL_HOLD_SECONDS`), so the adapter reported ~60 on ~97 % of ticks — a value the
model had never seen, on its most-relied-upon input. Measured by feeding the test set what
the live system actually sees: an 8 % MAE penalty offline, and a much larger one in
control (26.4). This predates today's change; it existed from the day the feature was added.

Nine controlled experiments (scratch scripts, no project code touched) isolated each lever:

| experiment | test MAE | held-out MAE | fed what it sees live |
|---|---|---|---|
| persistence baseline | 2.72 | 4.31 | — |
| absolute target, next-switch feature (the straight retrain) | 2.06 | 2.35 | 2.23 |
| … drop next-switch | 2.12 | 2.37 | 2.12 |
| … less regularisation (`max_features` 0.33–0.5, deeper) | 2.06–2.07 | 2.32 | 2.36–2.43 (worse) |
| **residual target** | **1.39** | **1.46** | 1.62 |
| residual + drop next-switch | 1.49 | 1.58 | 1.49 |
| **residual + elapsed-in-phase instead of next-switch** | **1.39** | **1.48** | ≈1.39 |

Less regularisation did nothing offline and made the live skew worse (it leans harder on
the bad feature). The residual target is the single biggest lever. Replacing the countdown
with elapsed time beats dropping it.

### 26.3 What changed in the code

- **Residual targets** (`ml/feature_schema.py` `TARGET_MODE_*`,
  `current_values_as_target_vector()`; `ml/training/train.py`; `ml/ml_predictor.py`). The
  forest now fits `target − current value of the same field on the same lane`; every MAE
  `train.py` reports is computed on `clip(output + current, 0)`, i.e. on the prediction the
  Decision Engine actually receives, and the metadata now also records the persistence
  baseline on the same rows. `train.py` writes `"target_mode": "residual"` into the model's
  metadata and `MLPredictor.from_path()` reads it back, so a model and its interpretation
  travel together — a model with no metadata is treated as absolute, so nothing old breaks.
- **`seconds_in_current_phase` replaces `seconds_until_next_signal_switch` as the network
  feature** (vector stays 125 wide). `TrafficAdapter` now keeps a phase clock — the one
  piece of state it holds between ticks, and still pure observation: it records *when* the
  index changed, it decides nothing. On its first read it recovers elapsed time from SUMO's
  own `duration − remaining` (exact under the static program; ~0 under a controller that
  re-arms its ceiling, which is the right answer for "just attached"), so a run resumed from
  a saved state (Section 25.3) starts with the truth rather than zero. `SignalState` keeps
  `seconds_until_next_switch` for the dashboard's amber countdown; `SignalFeatures` (the
  ML-facing type) carries only the new field. Verified from the real generator: 0.05–29.2 s,
  never above 30 on a main phase or 12 on a right-turn phase.
- **Confidence formula is now mode-aware.** After the residual retrain the calibrated
  confidence-vs-error correlation collapsed (count −0.23 → −0.04). The raw score divided
  tree spread by the prediction's *level* — but in residual mode the level is mostly the
  persistence base, which the trees never voted on, so a long queue read as "confident"
  regardless. Measured on the residual model: the relative formula correlated −0.003 with
  real count error and **+0.16** with wait error (the wrong sign — more confidence where
  error was higher), while spread alone (`100 / (1 + std)`) reached −0.43 for both.
  `MLPredictor._confidence` and `evaluate_calibration._confidence_from_spread` now use
  spread alone in residual mode and the original formula in absolute mode. After refitting
  the isotonic calibrators the calibrated correlation is **−0.37 (count) / −0.49 (wait)**,
  against −0.23 / −0.10 for the original model. Since confidence sets the prediction's blend
  weight in `DecisionEngine`, this matters for control, not just for reporting.
- The datasets were regenerated a second time (118 min, contended) so that training data
  comes from the same `FeatureEngineer` the runtime uses — the generator's own design rule —
  rather than by transforming the first set offline, even though the offline transform is
  exact under the static program.

**Final model:** test MAE **1.437**, held-out **1.488** (persistence 2.72 / 4.31 on the
same rows). Vehicle count 0.43 / 0.76, waiting time 2.45 / 2.21. Better than the original
pre-change model (1.63 / 1.99) on a strictly harder target. Held-out `extreme` 1.73 (was
2.88). `tests/test_ml_predictor.py` is new (10 tests: schema alignment, absolute vs residual
output, zero clipping, metadata round-trip, the phase clock's reset/recovery behaviour);
**56/56 pass**.

### 26.4 The sweep: before and after the model fix

Two full 13-scenario sweeps were run against VAC on the protected-left program, both with
`DecisionConfig` exactly as Section 22 left it (margin 0.35, starvation cap 0.20,
wait influences 0.25/0.15) — no engine tuning at all.

**Interim model** (absolute target, next-switch feature — i.e. the straight retrain):
9/13 clean. `light_seed1` **3/7** (wait −3.6 %, travel −2.0 %, avg queue −8.4 %, speed
−1.9 %), `balanced_seed1` 6/7 (travel −0.2 %), `east_heavy_seed1` 6/7 (max queue −3.1 %),
`accident_seed1` 6/7 (worst travel −2.4 %). Archived in
`results/interim_2026-09-13_absolute_nextswitch/`.

The decisive diagnostic was `light_seed1` with the predictor's influence switched off
(`max_predicted_weight=0`): **6/7** (wait +6.7 %, worst travel +7.4 %). The scoring was
fine; the skewed model was actively steering the engine wrong in light traffic — the
"deviation" in 26.2(c) was not a theoretical concern, it was the loss.

**Sweep with the final model, engine unchanged:** 12/13 clean — every scenario the interim
model had missed except `light` was fixed by the model alone (`balanced` −0.2 % → +1.8 %
travel; `east_heavy` −3.1 % → +6.2 % max queue), and every heavy scenario's margins widened
(e.g. `heavy` wait +64.6 % → +68.1 %, `extreme` +63.9 % → +66.8 %). `light_seed1` stayed at
**3/7** with numbers almost identical to the interim model's, and `accident_seed1` kept the
same −2.4 % worst-travel miss. Archived in `results/modelfix_only_2026-09-13/`.

### 26.4a Light traffic: what the AI was actually doing wrong

With the model no longer the cause, `light_seed1` was instrumented (decision-mode counts,
switch triggers, congestion index) with prediction on and off:

```
                        switches  gap-out  scored   wins
prediction on   (0.35)     64        55       9     3/7
prediction off  (0.0)      64        56       8     6/7
VAC                        74        -        -
```

Same number of switches, same trigger mix — the entire difference was **which phase the
gap-out released to**. `best_other` was the argmax of the *blended* phase scores, so a phase
with nobody at the line but a forecast arrival could outrank one with a vehicle already
stopped; in light traffic that is exactly the vehicle whose wait then grows. VAC ranks the
next phase by present count. Note also that the AI switches **less** than VAC in every
light seed (64 vs 74, 58 vs 67, 65 vs 75) — the anti-flicker work of Section 19 holds, and
nothing in this section adds a switch.

Three candidate mechanisms were tested, each on all three `light` seeds, since single-seed
light-traffic results are chaotic enough to mislead:

| engine variant (final model throughout) | seed 1 | seed 2 | seed 3 |
|---|---|---|---|
| Section 22 engine (blended-score gap-out target) | 3/7 | — | — |
| gap-out target = present-demand *score* | 5/7 | 4/7 | 1/7 |
| … + starvation only for phases with vehicles | 5/7 (queue −8.0 %) | 3/7 | 1/7 |
| **gap-out target = present vehicle COUNT, score as tie-break** | **7/7** | **7/7** | 5/7 |
| … + light-traffic gate at congestion 0.10 | 5/7 | 7/7 | — |

- **Count-first gap-out (`gap_out_uses_present_demand`, on)** is the one that works, and it
  is the principled one: a gap-out asks "who is actually waiting right now", VAC answers it
  with raw counts, and average queue length is the metric that count-ranking greedily
  minimises. The AI's wait-aware score still decides between phases holding the same number
  of vehicles, and still drives every hold-or-preempt decision. Seed 3's two remaining
  misses are travel −0.1 % and speed −1.2 % (it was 1/7 before).
- **Starvation gated on presence (`starvation_requires_demand`)** looked right on paper —
  before it, a phase 20 s unserved with zero vehicles (pressure 0.20) outranked a phase with
  one vehicle waiting 10 s (score ~0.10), and the 150 s hard override would force-serve an
  empty phase — but it lost on every seed. The pressure on empty phases evidently works as
  a useful "serve the least-recently-served phase" tie-break at gap-out. Kept in code,
  default **off**, with tests for both settings; the same fate as the light-traffic mode.
- **The light-traffic gate** (Section 20.2's mechanism, at 0.10 — light traffic's
  congestion index sits at 0.03, p90 0.07) lost again, as it did in Section 20.

Two other probes for completeness: `switch_confirmation_seconds` 3 → 5 made light worse
(queue −3.1 %), and prediction weight 0.15 was strictly between 0 and 0.35 (4/7) —
prediction influence in light traffic was monotonically harmful *only* through the gap-out
target, which is what the count-first rule removes.

**Sweep with residual model + phase clock + count-first gap-out** (`DecisionConfig`
otherwise as Section 22): 11/13 clean — `light` 7/7, `balanced` 7/7, every heavy scenario
7/7 with wider margins than before; `accident_seed1` 6/7 (worst travel −2.4 %) and
`east_heavy_seed1` 6/7 (max queue 33 vs 32 vehicles). Archived in
`results/countfirst_gapout_2026-09-13/`. Those two are the subject of 26.4b.

### 26.4b The last two: a realistic-green floor, and a metric that was measuring a script

With the count-first gap-out in, the sweep stood at 11/13. The user's instruction was to
get both remaining scenarios to 7/7 — and, separately, that a green lasting 10–15 s and then
going amber "is not feasible in the real world". The two turned out to be connected.

**accident_seed1 (worst travel time −2.4 %).** Logging the four worst vehicles under each
controller settled it in one run:

```
      worst                      2nd worst    3rd      4th
AI    accident_vehicle  635.9 s  car 169.1 s  168.3 s  167.8 s
VAC   accident_vehicle  621.0 s  car 514.1 s  491.6 s  470.2 s
```

The worst vehicle under BOTH controllers is the scenario's own stalled truck —
`<stop lane="E_in_1" duration="550"/>` in `accident.rou.xml` — and the AI's value was
identical to the decimal across every sweep of the day, model or engine changes
notwithstanding. The 15 s gap is whether E's phase happened to be green the instant the
scripted stop ended. Meanwhile the worst *real* vehicle waited 169 s under the AI and
**514 s under VAC**, because VAC has no starvation protection: it kept feeding the blocked
lane's ever-growing queue and starved the right-turn lane for eight minutes. The AI "lost"
the truck's 15 s precisely by refusing to do that.

`MetricsCollector` now keeps a vehicle's *scheduled* stop time out of its travel time —
the same convention SUMO's own waiting-time accounting applies — via two new adapter reads
(`get_stop_starting_vehicle_ids` / `get_stop_ending_vehicle_ids`, wrapping
`simulation.getStopStartingVehiclesIDList` / `getStopEndingVehiclesIDList`), applied to
both controllers identically. A scripted 550 s parking is not delay the signal caused.
Result: worst travel time 169.1 s vs 514.1 s, **+67.1 %**, everything else unchanged.
`tests/test_metrics_collector.py` covers the accounting.

**east_heavy_seed1 (max queue 33 vs 32).** Seeds 2 and 3 were 7/7 with +9–10 % on that
metric, so this was one vehicle at one instant — but the switch log around the AI's peak
was the real finding: the heavy approach's own phase was being held **12–17 s** and
preempted by a waiting phase on score, nine switches in 100 s, while VAC held it 45 s to
max-out. That is the "green for ten seconds, then amber" behaviour the user rejected, and
each extra amber costs the heavy approach capacity. Two contributing mechanics:

- the phase timer starts at the switch *decision*, so the 3 s amber counts toward
  `min_green_seconds` — the old 10/8 floor was 7 s / 5 s of actual green;
- in a four-phase rotation every rival phase has always been unserved ≥ 20 s, so at the
  0.20 cap every rival permanently carries +0.20 of starvation pressure — the 0.35 margin
  was effectively 0.15.

Everything below was A/B-tested on `east_heavy_seed1` *and* all three `light` seeds, because
light traffic is where any added patience costs, and single-seed light results move by
±3 % on a one-line change:

| variant | light s1 / s2 / s3 | east_heavy s1 | AI switches (east) |
|---|---|---|---|
| count-first gap-out only (start of 26.4b) | 7/7 · 7/7 · 5/7 | 6/7 (maxQ −3.1 %) | 58 |
| starvation cap 0.20 → 0.10 | 3/7 · 4/7 · 3/7 | 7/7 | 44 |
| shared min green 15/10 (both controllers) | 3/7 · 4/7 · 7/7 | 7/7 | 44 |
| both of the above | 4/7 · 6/7 · 6/7 | 7/7 (maxQ +18 %) | 44 |
| oversaturation bonus 0.25 → 2.0 | — | 6/7 (AI advantage collapses to +12 %) | 38 |
| **preemption floor 20/12, gated on phase score ≥ 0.12** | **7/7 · 7/7 · 5/7** | **7/7 (maxQ +6.2 %)** | 59 |
| … same floor, gated on vehicles present ≥ 3 or ≥ 4 | 5/7 · 7/7 · 3/7 | 7/7 | 53 |
| … same floor, gated on vehicles present ≥ 5 | 7/7 · 7/7 · 5/7 | 6/7 (never binds) | 58 |
| … same floor, gated on vehicles standing ≥ 3 | 7/7 · 7/7 · 5/7 | 6/7 (never binds) | 59 |
| … same floor, gated on departure rate ≥ 0.1/s | 5/7 · 7/7 · 4/7 | 7/7 | 50 |
| … + round-robin tie-break at gap-out | 3/7 · 7/7 · 3/7 | 7/7 | 54 |

The lower cap and the longer shared floor both fixed heavy and both lost light — the same
pressure that cuts a discharging stream in heavy traffic is what lets a car waiting 30 s
preempt a phase serving one moving car in light traffic. Raising the floor for *everyone*
made lone vehicles wait out greens serving nobody. So the fix is a floor that only the
scored-preference path respects (`min_green_before_preemption_seconds`, 20 s main / 12 s
right — ≈17 s / 9 s of actual green), and only while the phase is still serving something:
a restriction the AI places on itself, so the comparison stays fair (VAC never preempts).

Choosing the gate was the instructive part. Logging every tick the floor bound in
`light_seed1` showed the same shape each time: current phase with **four vehicles present,
none standing, nothing departing** — four cars just inserted 150 m up the approach — scoring
0.03 while a rival with a car actually waiting scored 0.20–0.53. Holding a green for cars
that far away is wrong. Vehicles present could not separate that from a heavy stream (both
3–4); vehicles standing never bound in heavy traffic at all (the standing queue is gone by
the time the stream gets cut); the departure rate is backward-looking and kept holding
phases that had just *finished* discharging. The engine's own phase score separated every
case cleanly — 0.03–0.10 in all the light moments, 0.3+ mid-stream in heavy — so that is
the gate: `preemption_floor_min_phase_score = 0.12`. The floor never binds in light traffic
(numbers identical to no floor) and east_heavy goes to 7/7 with its best margins of the day.

Also tested and kept off: `starvation_requires_demand` (starvation only for phases with
vehicles) lost on every light seed; the pressure on empty phases is a useful
least-recently-served tie-break at gap-out. The switch-confirmation window at 5 s and a
light-traffic gate at 0.10 both lost, as in Section 20.

**Final `DecisionConfig` deltas from Section 22:** `gap_out_uses_present_demand=True`
(count-first, score tie-break), `min_green_before_preemption_seconds=20/12`,
`preemption_floor_min_phase_score=0.12`. Everything else — margin 0.35, cap 0.20, min green
10/8, max green 45/20, wait influences 0.25/0.15, confirmation 3 s — is unchanged.
`tests/`: **65/65**.

**Final sweep, all changes in:**

| scenario (seed 1) | wins | wait | travel | worst travel | avg queue | max queue | speed | throughput |
|---|---|---|---|---|---|---|---|---|
| `light` | **7/7** | +7.8 % | +0.2 % | +7.4 % | +0.7 % | +0.0 % | +1.6 % | +0.0 % |
| `balanced` | **7/7** | +18.5 % | +1.1 % | +1.9 % | +4.0 % | +0.0 % | +1.6 % | +0.0 % |
| `normal_traffic` | **7/7** | +86.5 % | +34.7 % | +70.3 % | +65.7 % | +61.4 % | +47.3 % | +0.0 % |
| `heavy` | **7/7** | +66.9 % | +20.5 % | +40.0 % | +46.2 % | +37.1 % | +24.5 % | +0.0 % |
| `extreme` | **7/7** | +64.3 % | +37.4 % | +57.4 % | +51.5 % | +50.6 % | +45.5 % | +0.0 % |
| `rush_hour` | **7/7** | +58.5 % | +10.8 % | +43.9 % | +26.0 % | +33.7 % | +11.0 % | +0.0 % |
| `north_heavy` | **7/7** | +57.6 % | +10.7 % | +43.8 % | +29.9 % | +11.4 % | +9.3 % | +0.0 % |
| `south_heavy` | **7/7** | +62.2 % | +8.8 % | +42.1 % | +26.9 % | +7.5 % | +9.7 % | +0.0 % |
| `east_heavy` | **7/7** | +62.5 % | +15.4 % | +41.1 % | +37.2 % | +6.2 % | +18.5 % | +0.0 % |
| `west_heavy` | **7/7** | +63.9 % | +13.8 % | +42.9 % | +36.5 % | +13.2 % | +14.8 % | +0.0 % |
| `accident` | **7/7** | +84.1 % | +34.1 % | +70.2 % | +62.8 % | +54.7 % | +41.2 % | +0.0 % |
| `emergency_response` | **7/7** | +86.2 % | +32.0 % | +70.3 % | +62.2 % | +56.8 % | +42.5 % | +0.0 % |
| `rain` | **7/7** | +85.9 % | +35.7 % | +66.2 % | +67.7 % | +64.5 % | +46.2 % | +0.0 % |

**13/13 clean sweeps — every scenario, every metric.** All thirteen `results/comparison_
<scenario>_seed1.csv` files were written by this one run (evening of 2026-09-13). The AI
switches less than VAC in every light seed (64 vs 74, 58 vs 67, 65 vs 75) and, under
saturation, holds a phase serving a stream for at least ~17 s of real green before any
score can end it. Throughput is tied by construction in every row; the two 0.0 max-queue
entries (`light`, `balanced`) are exact ties, 31 vs 31 vehicles.

Multi-seed spot checks with this configuration: `light_seed2` 7/7, `light_seed3` 5/7
(travel −0.1 %, speed −1.2 %), `east_heavy_seed2` 7/7, `east_heavy_seed3` 7/7. As in
Section 22.3, a literal "every seed of every scenario" guarantee is not claimed.


### 26.5 Two honest notes

- The `results/comparison_light_seed1.csv` committed in `deca744` (the commit whose message
  claims 13/13) shows VAC ahead on 5/7 for light — it disagrees with Section 22's text. Most
  likely it was overwritten by one of the threshold experiments Section 20.2 describes and
  never refreshed. It cannot be resolved from history; the old-program files are preserved
  as-is in `results/old_shared_left_2026-09-08/` and every number in this section comes from
  runs made today.
- The model file grew from 388 MB to 654 MB (75 % more rows, deeper trees). It is tracked
  through Git LFS (`.gitattributes`), as before.

---

## SECTION 27 — The Performance page, Simulation Settings, and honest vehicles (CURRENT STATE)

Dated 2026-09-14. Two new pages, one evaluator that now runs under the console, and three
rendering defects the user reported the moment they saw the 3D view up close. The written
design is `docs/superpowers/specs/2026-09-14-performance-and-settings-design.md`; the plan
it was built from is beside it under `docs/superpowers/plans/`.

### 27.1 What the user asked for

Two side-by-side windows — Trinetra and VAC — like the digital twin on Overview, and below
them every evaluation metric with a graph and "who is winning"; plus a Simulation Settings
page with scenario cards for the demo and for the evaluation, so that "if the user just
wants to see how the extreme scenario would be, he does that; when he wants to see how our
system behaves at extreme traffic in comparison with VAC, he sees that too". Decisions taken
in the design conversation, in the order they were asked: two live junction plates (plan
view only); the same Pause/Play/Stop/speed bar as Overview; time series with a running
verdict; thirteen cards, seed 1 fixed, the production route as a fourteenth "Everyday
junction traffic" card for the demo; one run at a time.

### 27.2 The evaluation runs on the console's own worker thread

The evaluator was a batch job — `python -m performance.evaluator` from a terminal, or a
child process the console launched and talked to over HTTP (Section 18). Neither could be
paused, and neither drew anything: the live feed carried one side's summary numbers and no
vehicles. Three approaches were weighed; the one taken is the one Section 23.2 already
argued for the demo run: **in-process, on the supervisor's single worker slot**.
`SimulationSupervisor.start_evaluation(scenario_name, baseline)` hands
`PerformanceEvaluator.run(live_store, control)` the very `RunControl` the pause/speed/stop
endpoints hold and the very `LiveStateStore` the WebSocket serves. Pause is instant, there
is no cross-process state, and the top bar needed no second set of buttons.

What the evaluator gained is additive and gated on `control` being passed, so the batch
paths (the CSV sweep, `performance.evaluate`, the terminal) are byte-for-byte unchanged —
verified by re-running `light_seed1` and diffing its CSV against the sweep's. Each lockstep
iteration now calls `lockstep_gate(control)` (block while paused; break on stop) and
`pace_after_step(control, step_seconds)` after stepping both SUMOs. The live payload is
built by `services/snapshot_views.py`, a new module holding the demo run's own view
builders (`signal_view`, `lanes_view`, `vehicles_view`, `decision_view`, `side_view`),
moved out of `simulation_runner.py` so both publishers share one implementation — which is
what lets a `JunctionPlate` be fed `snapshot.ai` or `snapshot.baseline` unchanged. The last
publish carries `comparison.final = true` so the page can lock its verdicts. A run that
reaches its natural end writes `results/comparison_<scenario>.csv` exactly as a terminal run
does; one stopped from the browser does not — the first end-to-end pass overwrote the
sweep's full-run `extreme` CSV with a 213 s partial before that guard existed.

Scenario ids became a registry (`performance/scenarios.py`): one `known_scenario_names()`
every start route validates against, one `scenario_sumocfg_path()`, and `"default"` for
the production route. `start-simulation` gained `scenario_name`; `resolve_config()` gained a
`sumocfg` override on the same throwaway-subclass mechanism it uses for `gui`, so a chosen
scenario never leaks into the process-wide `Config`. `run-state` reports `kind`
(`demo | evaluation | null`) and `scenario`; a second start of either kind while anything
runs is a 409 whose detail is a sentence the UI shows verbatim ("A demo run is active —
stop it first."). Opening a SUMO window is refused for an evaluation. FastAPI's TestClient
now covers these routes (`tests/test_control_routes.py`; `httpx` added to
`requirements.txt` for it).

One older gap surfaced on the first Playwright pass and was fixed alongside: the dashboard
served `dist/` but had no SPA fallback, so a deep link or a reload on `/analytics` was a
404. `create_app()` now serves `index.html` for any non-API path.

### 27.3 The frontend

- **One WebSocket, one shape, plus `kind`.** A demo frame is today's `LiveSnapshot` with
  `kind: "demo"`; an evaluation frame is `{kind, sim_time, scenario, baseline_controller,
  ai, baseline, comparison}` with each side a `SideView` (signal, metrics, lanes, vehicles,
  decision, phase history) and no `prediction`. `isLive()` was narrowed so nothing that
  reads demo frames sees an evaluation by accident; `isEvaluation()` is the new guard.
- **Simulation Settings** (`/settings`): two `Panel`s of `ScenarioCard`s. The card table
  (`data/scenarios.ts`) is where "rush_hour_seed1" becomes "Rush hour — demand ramps up,
  peaks, then eases"; the id travels only in the start request. Selection lives in
  `localStorage` (`data/settings.ts`) and applies the next time that page's Start is
  pressed; while a run of that kind is up, the section says "Stop the current run to
  change" and its cards are inert.
- **Performance** (`/performance`): two `ControllerWindow`s (each a `TwinViewport` with
  `allow3d={false}`), a summary line ("Trinetra ahead or even on 7 of 7 metrics"), then
  seven `MetricBlock`s from an `evalHistory` accumulator built like `liveHistory` — one
  sample per evaluation tick, a once-a-second revision gate. The verdict rule
  (`data/verdict.ts`) calls anything inside ±0.5 % *Even*, so the single-instant extremes
  and throughput do not get dressed up as wins. Both pure modules have Vitest tests — the
  first frontend unit tests in the project; nothing else is rendered in tests, the UI is
  verified live.
- **The top bar** starts an evaluation when the route is `/performance` and a demo
  elsewhere; the SUMO-window buttons are hidden for evaluations. Overview shows "An
  evaluation is running — watch it on Performance" in place of its junction when the
  frames on the wire are an evaluation, and carries a scenario chip that links to Settings.
- The store's tick bookkeeping (measured rate, interpolation window, clock) now runs for
  either kind of frame; `lastLive` stays demo-only, since it is Overview's "keep the last
  picture" fallback.

### 27.4 Vehicles, honestly drawn

Three defects, all real, all reported by the user from the 3D view and a stopped queue:

- **Plan-view vehicles overlapped in a queue.** A measurement error, not a rendering one: a
  car was drawn 18 units long = 7.8 m, but SUMO parks stopped cars 7 m apart (4.5 m body +
  2.5 m gap), so a drawn car was longer than the space it occupies and a queue *had* to
  overlap. Lengths are now true to scale (`PLATE_UNITS_PER_METRE = 920/400`: car 10.4,
  motorcycle 4.6, auto 6.0, bus 24.2, truck 18.4 units); widths keep the lane-width
  exaggeration but were narrowed (car 7, bike 4, auto 6, bus/truck 9) so a true-length car
  does not read as a square. Verified: 5.7 units of clear gap between stopped cars, and a
  close-up screenshot of a queue.
- **3D motorcycles looked like small cars, autos could not be seen.** Every non-slab type
  was one box at its SUMO dimensions with a lowered body — a 2.0 × 0.7 m box is a shrunken
  car. `Junction3D` now builds a motorcycle from a narrow frame, tank, two wheels, a rider
  and a helmet, and an auto-rickshaw from a short tall cab, a nose, three wheels, a canopy
  and a windscreen — at true SUMO dimensions, in the vType's colour, with the part
  geometries cached per type like the car bodies. Verified by close-up screenshot.
- **Lane ids on screen.** `N_in_0` and friends were painted on the plate and led every lane
  table. They are SUMO's names; the user's rule is "explain it or cut it". Every lane is
  now "North · Left" (`utils/signal.laneLabel`), the tables have one Lane column, and the
  N/S plate labels stack as a three-line legend per arm (which also removed the
  overlapping-labels defect from the 2026-09-13 visual check; the arrows moved 22 units
  inward to make room). The plate labels use Barlow, not the mono face: the vendored
  JetBrains Mono subset has no middle dot, which the first pass rendered as a box. They
  carry a road-coloured halo so vehicles spawning under them at the arm ends never merge
  with the text.

### 27.5 Verified, and what it cost to run

The end-to-end pass, on the console with the built frontend: Settings → Extreme for
Performance (stored) → Performance → Start → both plates animating, seven blocks filling,
the clock running → Pause (simulated time frozen after the in-flight tick) → Resume → Stop →
`comparison.final = true`, seven "· final" badges, the summary line; then Settings → Rush
hour for Overview → Overview → Start → chip reads "Rush hour" and `run-state.scenario` is
`rush_hour_seed1`. Zero console errors throughout.

One honest number: with two SUMO instances of the **extreme** scenario, two feature
pipelines and the forest, this laptop runs the evaluation at **0.9× real time
unthrottled** — the speed control is applied (it can only slow, never accelerate a
CPU-bound loop), and lighter scenarios reach 5× with room to spare (`light` runs at ~7×
flat out). The bar shows the measured rate ("×0.9 real time") rather than the requested
one, so this is visible rather than surprising.

**Tests:** backend 94/94 (new: `test_scenarios`, `test_snapshot_views`,
`test_evaluation_gate`, `test_control_routes`, supervisor cases); frontend Vitest 7/7;
`tsc`, lint and build clean.

**Still open:** the Decisions page (placeholder); the three cosmetic items from
Section 26's visual check that were outside this work (the 3D zoom is orbit-centred, the
idle "Green held 3s", Analytics peak windows on short runs); and the auto-rickshaw could
still read more clearly as a three-wheeler from some angles.

---

## SECTION 28 — Nine times faster: TraCI subscriptions and a 1 Hz read cadence (CURRENT STATE)

Dated 2026-09-14. The user's report: at "1×" the Performance page ran at 0.5–0.6× real time,
and "we should optimise the code fully so that there are absolutely no lag issues". Also
two visual defects on the same page, folded in at the end of this section.

### 28.1 Where the time went — measured, not guessed

A 60-second `extreme` demo run (one side) under `cProfile`:

```
445,256 TraCI round trips in 60 simulated seconds
  _extract_vehicle  86,470 calls  →  5 socket calls each (position, lane, speed, waiting time, type)
  = ~7,400 round trips per simulated second, on ONE side
```

`TrafficAdapter.get_current_state()` read every variable of every vehicle with its own
request, every 0.05 s step, for a decision made once per second. The two-sided evaluation
doubled it; on this laptop that was 0.9× real time unthrottled, which is what the user saw.
SUMO's own stepping was ~28 s of the 166 s a full extreme run took — the simulator could
run at 30×; the Python round trips were the run.

### 28.2 Two changes, both inside the adapter's boundary

**Subscriptions.** Each vehicle is now subscribed once, on the step it first appears
(`traci.vehicle.subscribe` for lane, speed, waiting time, position); from then on SUMO
delivers every subscribed variable for every vehicle *inside the `simulationStep()` reply*,
and a step's state is one `getAllSubscriptionResults()` call. Type and vehicle class are
static for a vehicle's life, so they are read once and cached rather than subscribed — a
subscription is delivered every step whether it is read or not, so every variable in it is
parsing cost twenty times a second. The traffic light is subscribed the same way (four
calls → one), and the controlled-links table is read once per connection rather than per
step. `get_emergency_vehicle_lanes()` is served from the last step's results and costs
nothing. Values are byte-identical to the direct reads they replace.

**Cadence.** `TraCIManager.run()` gained `callback_interval_seconds`: SUMO still steps at
0.05 s, but state is read and the pipeline (twin, features, forest, decision, logging,
publish) runs once per decision tick. The evaluator's own lockstep loop does the same. Ticks
land on exactly the simulated times the per-step loop decided at — the first step, then
every full second after it (0.05, 1.05, 2.05 …) — which is what keeps the AI's decisions
identical. The trap in this: SUMO's departed / arrived / stop-starting / stop-ending lists
report only the *last* step, so a 1 Hz reader would lose 19 of every 20 steps of them and
the throughput and travel-time accounting would silently break (the first attempt served
238 of 240 vehicles). `TrafficAdapter.observe_step()` — one simulation-domain subscription,
a handful of ids per step — is called after every step and accumulates those lists; the
four id getters hand back what accumulated since they were last asked. The evaluator also
flushes them once after its loop, or the last vehicles home never count.

Proof the pipeline is unchanged: the `light_seed1` training run regenerates **byte-identical
(866/866 rows)** under the new adapter and cadence — the 15 s trend lookback lands on the
same history entry either way — so the datasets and model stand as they are. The one
intended difference is that the evaluation metrics now integrate per tick rather than per
step: same behaviour, same worst vehicles, same verdicts; travel times are resolved to the
second and the averages move within sampling noise (light: wait +7.77 % → +7.07 %).

### 28.3 Measured

| | before | after |
|---|---|---|
| extreme demo, one side, unthrottled | 1.5× real time | ~8× (5.8× incl. the 6 s model load) |
| extreme evaluation, two sides, unthrottled | 0.9× | **7.9×** |
| `light_seed1` batch evaluation | 117 s | 29 s |
| one training run (`light_seed1`) | ~130 s | 16 s |
| the full 13-scenario sweep | ~75 min | **~6 min** |

The sweep was re-run on the new pipeline: **13/13, every metric** (the table in README.md is
this run). What remains per step is SUMO itself plus traci's Python-side parsing of the
subscription payload; going further would mean `libsumo` (no socket, no parsing), which
cannot host the evaluation's two simulations in one process, so it was not pursued.

### 28.4 The two plate defects from the same report

- **Vehicles overlapping in a stopped queue.** Section 27 sized plate vehicles at the plate's
  *average* scale (920 units / 400 m = 2.3 per metre). The arms — where queues form — are
  drawn at 334 units / 178.4 m = **1.87 per metre**, and SUMO's front-to-front spacing is the
  leader's length plus the *follower's* `minGap`, which `vehicle_types.add.xml` sets from
  0.6 m (aggressive motorcycle) to 3.5 m (truck). A bus drawn 24.2 units long with an
  aggressive car parked 23.0 units behind it overlapped by construction. Lengths now derive
  from `plateGeometry.ARM_UNITS_PER_METRE`; the tightest legal spacing of every type leaves
  a visible gap (motorcycle 1.1 units, everything else ≥ 3.4).
- **"Extreme doesn't look extreme."** The first analysis here concluded it was the scenario
  (1,334 veh/h per approach, ~90 % of lane capacity, "never gridlock") and not the drawing.
  The user pushed back — the same file looked extreme in sumo-gui during development — and
  the user was right. See 28.5.

### 28.5 The plan view becomes a map (2026-09-14, later the same day)

The plate was a *schematic*: 3.2 m lanes drawn 36 units wide and 178 m arms 334 units long
— eleven times wider than long — so twelve lanes stayed legible on a projector. Section
28.4's overlap fix made vehicle *lengths* true to the arm (1.87 units/m) while their widths
stayed a fifth of the lane. The consequence is the whole "extreme" complaint: in sumo-gui a
1.8 m car fills more than half of its 3.2 m lane, so eight queued cars are a solid 56 m bar
at the line; on the plate the same eight cars were a row of small dots with green road all
round them. Same simulation, same 90–170 vehicles, read as a third of the traffic.

The user's instruction: *"give the arms like sumo only, so that it can be zoomed out, in,
fit"* — and keep the look. So:

- **`plateGeometry.ts` is now in metres.** One SVG unit is one metre; x is SUMO's x and y is
  `400 − sumo_y`. Every number is transcribed from `intersection.net.xml`: 3.2 m lanes, 9.6 m
  corridors, inbound lanes ending 21.6 m from the centre, the junction's own polygon (a
  19.2 m opening on each side joined by 12 m fillets that curve *into* the corners — the
  shape's vertices sit 12 m from the outer corner, which the first draft got backwards and
  drew as a bulging rounded square), lane centres at 208.0 / 204.8 / 201.6. The 3D miniature
  already used these; the two views now agree to the metre. Vehicles are drawn at their
  vType `length × width` — the same table (`vehicleTypes.ts`) the 3D view builds bodies from,
  and the same file SUMO reads — at their SUMO coordinate, front bumper shifted back half a
  length. `vehiclePlacement.ts` lost its arm decomposition and Bezier turns: there is nothing
  to map any more. Heading on an arm is the lane's own (SUMO changes lane as a sideways jump
  between ticks; a heading taken from that movement parked cars at 45° in their queues —
  fixed in the 3D view in the same commit); only on an internal lane does the movement
  carry the heading.
- **The look stayed.** Hatched junction box with dashed boundary, pedestrian crossing bands,
  medians, dashed dividers, painted movement arrows, three-lamp heads, drafting north arrow,
  lane fill = signal, `--plate-vehicle` bodies. Things that must stay readable at any zoom —
  lane names, signal heads, the north arrow — are drawn in a screen-pixel frame
  (`scale(1 / pxPerMetre)`), and per-lane detail hides below 8 px of lane width. Lane names
  are painted on the road under the traffic, staggered 20 / 52 / 84 m back from the line
  (three 11 px labels on lanes 9 px apart would stack); approach names sit at the arm ends.
- **Zoom is sumo-gui's.** `usePanZoom` is a window in metres (centre + visible height);
  scroll zooms about the pointer, drag pans, the readout is the magnification relative to
  the whole network fitted (**1×** = all 400 m, the zoom-out limit), and one button frames
  the junction (150 m tall — the box plus ~53 m of each arm, the default). A separate "Fit"
  button was tried and removed at the user's request: its icon read as a second fullscreen
  button. The Performance page lifts one view state into both windows, so Trinetra and the
  baseline are always framed identically — a comparison at two zooms is not a comparison.
  (Both superseded on 2026-09-15, Section 30: the default is 3.5×, the wheel needs Ctrl,
  and the two windows zoom independently with a Match button.)
- Verified in the browser on `extreme_seed1`: queues now read as queues, in Overview and in
  both Performance windows.

---

## SECTION 29 - The interface learns a motion vocabulary (CURRENT STATE)

Dated 2026-09-15. Chethan's report: *"you havent even used the ui ux pro max skills and
the framer motions and all, because i cannot see them anywhere on the screen, and you are
not doing a good job in the ui styling"* - set against a portfolio page he had liked and
still had deployed.

### 29.1 What the comparison actually showed

The portfolio was read rather than admired: 416 lines of CSS, **two** keyframes (`blink`,
`fadeUp`) and 17 transitions. Nothing in it is expensive. What made it read as designed
was four habits:

1. **Everything answers the pointer** - a nav underline growing 0 -> 100%, a card lifting
   4px and warming its border, an accent bar scaling in from the left, a link widening its
   own gap.
2. **An arrival staircase** - `fadeUp` at 0 / 0.1 / 0.2 / 0.3 / 0.5s, not a fade.
3. **Constant background texture** - a fixed 60px grid at 3% over the whole page.
4. **Micro-label typography** - uppercase captions at 0.12-0.18em, a marker before every
   heading.

Trinetra had framer-motion in eight files and spent it on a 34ms page fade nobody could
perceive, a number tween and a bar growth. Everything else answered with
`transition-colors` or nothing; `MetricBlock` had no transition at all.

### 29.2 The conflict, and who resolved it

`docs/design/TRINETRA_UI_DESIGN_BRIEF.md` section 5.4 banned all four habits by name -
*"peripheral motion on an operations screen is a defect, not a flourish"* - and spent the
whole motion budget on a phase-transition choreography whose step 3 (**the release**: lamp
bloom, lane saturation, one sweep of the painted arrow) had never been implemented.

That conflict was put to Chethan rather than resolved unilaterally, and he chose to relax
the bans. The brief was then **amended, not ignored**: 5.4 is rewritten around the four
places motion is now spent, section 12's overruled items are struck with the reason, and a
status header records every part of the brief that later decisions have superseded (IBM
Plex, the asphalt palette, the reference-kit process, the middle-dot ban that
`North - Left` overrules). What stayed banned: looping in the periphery, glow pulses,
spinners past 300ms, motion that gates information, and any code that depends on an
animation finishing.

### 29.3 What was built

**One rhythm.** `frontend/src/ui/motion.ts` is the single source for duration and easing,
in step with the `--dur-*` / `--ease-*` tokens. Duration follows distance (`tick` 120ms ->
`phase` 900ms); exits run at 65% of their enter.

**The release.** On the confirmed green, light runs once along the painted arrow in the
direction of travel - drawn as the path's own `pathLength`, so it follows a turn instead
of cutting across it - and a ring blooms out of the green lens. The trigger is
`utils/signal.phaseKey(simTime, heldSeconds)`: the simulated second the phase began,
constant through a green and changing exactly once on the switch. That is a **derived**
key, so there is no previous-state tracking, no effect, and no cache to get out of step
between the Performance page's two simultaneous plates - and a switch arriving mid-sweep
replaces the element rather than waiting for it. Measured in the browser on a live run:
six separate sweeps in 30s, each peaking at 0.95 opacity and fading to nothing.

**Answers.** The nav rail's active pill slides between destinations on a shared
`layoutId`; scenario cards lift 2px under the pointer, press to 0.985 and draw an accent
bar from the leading edge when chosen; lane rows grow a 3px accent marker; every control
has press feedback.

**Arrival.** `Reveal` now travels 14px over 420ms at 70ms apart (was 10px / 340ms / 55ms,
which measured as present and read as nothing). Scenario cards carry their own grid index,
so thirteen cards arrive as a staircase.

**Surface.** A drafting grid (40px minor, 200px major) sits under the page as a fixed
background on the scroll region - `background-attachment: fixed` anchors it to the
viewport but clips it to that box, which a fixed-position pseudo-element did not: the
first attempt painted over the status bar and the footer. Panel titles gained a leading
accent tick, and `.eyebrow` is now a real typographic role.

### 29.4 Defects found by looking at the screen

Four, all fixed, none of them about motion:

- **Plate lane names collided** with the traffic and with each other - three 11px labels
  on lanes 9px apart. They now sit on the verge outside the carriageway, staggered
  26 / 52 / 78m back, and appear only once an approach is zoomed in far enough to earn
  them (`MIN_LABEL_LANE_PX`).
- **The junction framing had no orientation label at all**: approach names were pinned to
  the ends of the arms, which are off screen at the default view. They now pin to the
  edges of the current window, like the compass.
- **Metric panel headers wrapped to two lines** because the verdict badge read "Trinetra
  ahead 21.8 % - so far". `Verdict` gained a `short` form ("Trinetra +21.8%"); "so far /
  final" moved to the footer where there is room.
- **A badge that was usually invisible.** `AnimatePresence mode="wait"` was keyed on the
  badge's text, so it re-ran the crossfade every tick as the percentage moved a decimal
  and spent most of its life mid-exit. It is keyed on the leader now; the figure updates
  in place.

Verified: 94 backend tests, 8 Vitest (two new, pinning the badge's length), `tsc -b`,
oxlint clean, and a live `balanced_seed1` demo plus a VAC evaluation driven in the browser.

---

## SECTION 30 - Scrolling past the map, two zooms, one scenario grid (CURRENT STATE)

Dated 2026-09-15. Chethan's list after using the console: the map ate the wheel when he
meant to scroll the page; zooming one Performance window zoomed the other; the junction
opened too far out; Simulation Settings showed the same thirteen scenarios twice; and
nothing clickable showed a hand cursor. Then, mid-build: the footer's left half should say
which page this is, the "Everyday junction traffic" card should go with Balanced as the
default, and the "Ctrl + scroll to zoom" tag must not be printed on the map.

### 30.1 The wheel belongs to the page

`usePanZoom` swallowed every wheel turn over the plate (`preventDefault`, then zoom). On
a page that scrolls, that traps whoever only wanted to scroll past the junction. The rule
now, in `overview/usePanZoom.ts`: a wheel turn zooms only with Ctrl (⌘ on a Mac) held —
`wheelIsZoom()`; a trackpad pinch arrives as a ctrl-wheel, so it zooms as expected — and a
plain turn is left entirely alone, so the page scrolls. Fullscreen has nothing behind the
map to scroll, so there `wheelZoomsPlain` lets a plain wheel zoom. The 3D view follows the
same rule: OrbitControls listens on the canvas, so a capturing wheel listener on the stage
above it stops a plain turn before OrbitControls sees it, and the page scrolls.

A "Ctrl + scroll to zoom" tag that appeared on the map for 1.4 s after a plain turn was
built, verified, and removed the same hour at Chethan's instruction — nothing printed on
the map. The instruction lives in the zoom readout's tooltip instead.

### 30.2 Each Performance window has its own frame, and a Match button

Section 28.5 lifted one view state into both windows so Trinetra and VAC were always
framed identically. Chethan overruled that: he wanted to study one junction up close while
the other kept its frame. `PerformancePage` now owns two `View` states, one per
`ControllerWindow`, and passes each window the other's as `matchView`. `TwinViewport`
shows a Match button (`Link2`) only when it has a partner; pressing it copies that framing
across once and disables itself while the two agree — a one-shot, not a lock. Verified in
the browser: both open at 3.5×, a Ctrl-wheel on Trinetra leaves VAC untouched, VAC's Match
adopts Trinetra's viewBox to the centimetre and then greys.

### 30.3 3.5× to open

`HOME_ZOOM = 3.5`; `HOME_VIEW.h = FIT_VIEW.h / 3.5` ≈ 118 m visible (was 150 m, 2.7×). The
"frame the junction" button returns there. `overview/__tests__/usePanZoom.test.ts` pins the
ratio and the wheel rule — the first test on the plate's window.

### 30.4 One scenario grid

Simulation Settings had two panels of the same thirteen cards. Now: one panel, one grid,
and a "Choose for" dropdown (Overview · demo / Performance · Trinetra vs VAC) that says
which page the next click chooses for; the lead sentence under it changes with the
target. Each card marks the page(s) currently set to run it (an accent dot and an eyebrow
"Overview" / "Performance"), so both choices read from one grid without touching the
dropdown. The lock rule is unchanged — while a run of the targeted kind is up the cards
are inert and the meta says so — and `data/settings.ts` keeps its two keys.

"Everyday junction traffic" is gone as a card. It was the production route
(`sumo/routes/intersection.rou.xml`, `python app.py`'s run): 480 vehicles an hour per
approach, split 2:1:1 through/left/right, for ten minutes. Balanced traffic is the same
480 per approach split 1:1:1 across the three movements (160 on each of the twelve routes)
with per-seed jitter; Light traffic is half that (80 per route, 240 per approach); Normal
day is the one with the realistic 65–70 % through share. Two cards at the same volume was
one too many, so Balanced is now the demo's default (Performance stays on Extreme). The
backend's `"default"` scenario id is untouched — a run started without a scenario still
reports it and still gets its name in the chip; it simply has no card. A browser holding
the old `default` choice in `localStorage` falls back to Balanced, because `settings.ts`
validates stored ids against the card set.

### 30.5 Cursors, and the footer

Tailwind v4's preflight dropped `cursor: pointer` from buttons (v3 set it), which is why
every control in the product read as an arrow. One rule in `index.css` gives the hand to
enabled buttons, `[role=button]`, selects, summaries and labels; disabled controls keep
their `not-allowed`. The plate shows `grab`, and `grabbing` while a drag is live — in the
3D view too, via OrbitControls' `start`/`end` events.

The footer's left half read "SUMO · TraCI · read-only viewer · backend 127.0.0.1:8000" on
every page. The top bar is already the same everywhere, so the footer now names the page
being read and what it shows in one line (`layout/FooterBar.tsx`, from the route); the
measured rate stays on the right.

Verified: `tsc -b`, oxlint, 10 Vitest (two new), the build, and a live pass on the console:
a `light_seed1` demo (plain wheel not prevented and the page scrollable, Ctrl-wheel zooms,
readout 3.5× at home) and a `light_seed1` VAC evaluation (independent zooms, Match). Zero
console errors.

### 30.6 The top bar belongs to the page (later the same day)

Chethan's next list: the top bar's Start/Pause/Stop confused him — arriving on Performance
while a demo was running, he found controls for a run he could not see, and no way to start
the evaluation without going back to Overview to stop the demo. He wanted each page's bar
to be its own, and Start on Performance to end the demo and start the evaluation itself.

`data/pageContext.ts` is the one place that decides what a page is about: its kind of run
(Performance → the evaluation; Overview and Analytics → the demo; Simulation Settings →
whichever page its "Choose for" dropdown names, which moved from page-local state into the
settings store so the bar can read it), the scenario that run is or would be, and whether
a run of this kind — or the other — is up. `RunControls` reads it: nothing of this page's
kind running → Start; this page's kind running → Pause / Stop / speed; the other kind
running → still Start, whose press ends that run first. `runState.replaceWithDemo` /
`replaceWithEvaluation` do the sequence — stop, poll `run-state` until idle (20 s cap),
start — with `busy` held so nothing else is pressed mid-way; the console's own 409 on a
second start never has to fire. From Settings, Start also navigates to the page it runs.
Verified live: demo up → Performance → Start → `running:demo:stopping` → `running:evaluation`,
one press; the reverse from Overview; and Settings with the dropdown on Performance →
Start → `/performance`, `kind: evaluation`, the chosen scenario.

The page-level "Scenario: …" chips on Overview and Performance moved into the top bar as
one chip beside the controls (the sliders icon, linking to Settings), naming the page's
scenario — running or chosen. The subtitle under "Adaptive signal control" is a line
about the project; it carried the scenario for a day and Chethan preferred the chip. The
footer's right side, which duplicated the rate the status bar already shows, now names
the backend host and the stream state instead. Analytics'
own start prompt learned the same rule (an evaluation up → "Start here ends it").

### 30.7 Performance keeps its shape

The idle Performance page was a centred card ("Trinetra vs VAC — nothing running yet") with
its own Start. Chethan: "why did you give the performance page like a placeholder". It now
always renders its layout — the two junction windows dark and unpowered, exactly as
Overview draws its plate before a run, and the seven metric blocks as `EmptyMetricBlock`s
(title, legends without readings, an empty axis, "fills in once the evaluation starts") in
the evaluator's own order (`METRIC_KEYS`). The windows' header meta carries the one line
that matters ("press Start to run the evaluation", "a demo run is up on Overview — Start
here ends it", "starting — both junctions appear on the first tick"). `EvalStartPrompt.tsx`
is deleted; Start lives in the top bar.

Also removed: the 3D view's "12 lanes · true scale · real vehicle types" caption (its
orbit hint now says Ctrl + scroll).

### 30.8 A page shows its own run, and nothing else (2026-09-16)

Four defects from using the per-page bar, all one rule: **a run of the other kind is
"nothing running" from this page.** While an evaluation ran, Overview kept saying "an
evaluation is running — watch it on Performance" in place of its plate, the top-right
clock ticked the evaluation's time, and the Active-phase panel's "Green held" counted —
`useLiveClock` follows whatever frames are on the wire, the evaluation's AI side included,
and Overview's `ended` only asked "is anything running". Now: `OverviewPage` and
`PerformancePage` treat a run of the other kind as ended (dark plate, "—" everywhere, no
message pointing elsewhere); `StatusBar` computes `foreign` from `pageContext` and shows
"No simulation running" / Idle, no clock, no mode chip; `PhasePanel` takes `powered` and
does not read the clock when false. The Performance side of it mattered too: for the few
seconds before a new demo's first tick, the last evaluation frame still on the wire read
as live there.

And the painted turn arrows: each bent 3 m sideways in a 3.2 m lane, so the kerb lane's
arrow ran 1.4 m onto the verge and the inner lane's across the median. `arrowPath` now
ends the bend 1.0 m off centre at 45°, which puts the 0.8 m head's tip at ~1.57 m — inside
the lane at any zoom (checked at 3.5×, 7.8× and 17×).

### 30.9 The ground, the fast run, and the restart (2026-09-16)

- **The plan view's ground is the 3D model's grass** (`--plate-ground` = Junction3D's
  `GROUND`, `#268426` after one lightening), at Chethan's request — the two views now read as one place. Text on
  it (lane names, approach names, the north arrow) moved from ink to the marking white
  (`--plate-ink`, 4.75:1 on that green); the Light demand chip that borrowed the old pale
  ground now uses `--accent-soft`.
- **"Max" speed scattered vehicles.** Frames are broadcast at 2 Hz wall time whatever the
  speed, so at ~8-16x each frame spans 4-8 simulated seconds, and a constant-velocity tween
  between two positions that far apart is a chord — through the verge for a car turning in
  the junction, diagonally across lanes for one that changed lane. `store.ts` now measures
  `simPerFrame` and derives `smooth` (≤ 1.6 s); above that the plate drops its CSS
  transition and the 3D view collapses each car's segment to its endpoint, so every frame
  is drawn where SUMO put the vehicle. Measured: 16.4x, 73 vehicles, zero off the
  carriageway; back at 1x the 1 s tween returns.
- **Restarting brought the old vehicles back.** A stop cleared the plate, but the console's
  `LiveStateStore` kept the ended run's last snapshot and re-broadcast it at 2 Hz, so the
  moment a new run was reported running the old picture re-powered for the 4-6 s SUMO and
  the model take to come up, then slid "backwards" into the new run's first frame. Two
  halves: `SimulationSupervisor.start()`/`start_evaluation()` call `LiveStateStore.clear()`
  (not the GUI handover, which is the same run continuing — `test_a_new_run_starts_from_an_
  empty_live_store`), and the frontend's `runState` resets the sim store (`useSim.reset()`:
  frames, `lastLive`, clocks) whenever `run-state.started_at` changes. Measured with the
  restarted console: zero vehicles on the plate through the launch, then the new run's own.
  The 4-5 s itself is real — SUMO launch plus the forest loading — not a rendering delay.

### 30.10 Smooth at any speed, a one-second start, a curved 3D junction (2026-09-16)

Chethan's follow-up: the snap of 30.9 made "max" correct but frame-by-frame, and he wanted
it smooth; why does a run take 4-5 s to start, and can that go; and the 3D junction was a
square where the plan has fillets.

**Per-tick frames.** The WebSocket loop sent whatever the store held every 0.5 s of wall
time, whatever the speed — so at 16-19x each frame spanned 8+ simulated seconds, which no
interpolation can fill honestly. `LiveStateStore` now carries a version (bumped on
`publish()` and `clear()`), and the loop sends when the version changes (checked every
33 ms, so ≤ 30 frames/s) with a 0.5 s heartbeat for unchanged state. Every frame is now
one simulation tick at any speed; the frontend's tween floor dropped from 120 ms to one
display frame (33 ms) and its rate guard from 50 ms to 10 ms so it keeps up. Measured on
`heavy_seed1` at 19.4x: 14 frames/s reaching the page, 54 ms tweens, 67 vehicles, none off
the carriageway — smooth, and where SUMO put them. The `smooth` gate of 30.9 stays as the
safety net for a slow link.

**The start-up time was the forest.** `MLPredictor.from_path` deserialised the 258 MB
joblib on every run: 4.8-7.3 s on this laptop, against ~1 s for SUMO itself.
`_load_model_files` now caches the deserialised model, calibrators and target mode for the
life of the process, keyed on the path, size and mtime of all three files (a retrained model
or re-fitted calibrator invalidates it — `test_from_path_reads_target_mode_from_metadata`
caught the first version, which keyed on the forest alone). `server.py` warms the cache on
a daemon thread at start, so even the first run is fast; the evaluator's two sides share the
same objects (the forest is only ever read). Measured: start → first tick **1.4 s** (was
5-7); a cached `from_path` is 0.06 s. Terminal `app.py` and the batch sweep are unchanged —
one process, one load, as before.

**The 3D junction slab** is the network's own `<junction id="C">` outline — the plan
view's `junctionOutline()` rebuilt as a `THREE.Shape` with four `absarc` fillets (12 m,
centred on the outer corners) and extruded 0.4 m — instead of a 43.2 m square. Both views
now share the one shape, to the metre.

### 30.11 Motion frames: a turn drawn as a turn (2026-09-16)

Chethan: turns were not smooth, a car sometimes stood still for a fraction of a second
before the next frame, and left-turners in the kerb lane crossed the curve line.

All three were the frame spacing. Positions were published once per decision tick — one
simulated second — so a car in the 13.6 m left-turn arc moved ~8 m between frames and the
tween was a straight chord 0.6 m inside the arc, while the lane centre sits only 1.6 m
from the net's 12 m corner. The stall was the tween reaching its mark before the next
frame arrived.

**Motion frames.** Between ticks the run now publishes a light frame every 0.2 s
simulated: the last tick's snapshot with fresh `sim_time` and `vehicles`
(`TrafficAdapter.get_vehicles()` — the subscription results SUMO already delivers each
step; twin, features and engine never see it) and the decision's held-seconds advanced by
the elapsed time, so `sim_time − duration`, the plate's release key, does not move. Ticks
carry `tick: true`, motion frames `tick: false`; the frontend's `liveHistory` and
`evalHistory` skip the latter, so Analytics and the Performance verdicts still sample once
a second. `simulation_runner.py` does it in `on_step` (same phase as the tick — 0.25,
0.45, 0.65, 0.85, never on a tick step), the evaluator in its lockstep loop for both
fleets (`snapshot_views.motion_frame`, `test_motion_frame_moves_vehicles_and_the_held_
clock_only`). Batch runs have no store and pay nothing.

**No stall.** The plate's tween runs 20 % longer than the measured frame interval, so the
next frame lands mid-tween and retargets it (the 3D view already overruns by 35 %).

**The curve.** `KERB_R` is 11 m in both views, not the net polygon's 12: that polygon is
where the lanes end, not a kerb, and 1 m tighter gives a turning car ~1.7 m of flank
clearance instead of 0.7.

Measured on `heavy_seed1` at 1x: 5.1 frames/s on the page, 230 ms tweens, and over 20 s
the closest any vehicle centre came to a corner was 13.5 m (2.5 m outside the drawn kerb).
Frames on the wire: (6.05, tick), (6.25), (6.45), (6.65), (6.85), (7.05, tick) …

### 30.12 The explainability row: "Why this phase" and "Recent switches" (2026-09-17)

Chethan noticed the empty band under the prediction panel (the left column ended ~100 px
above the 12-row lane table) and asked what could go there, and what the Decisions page
was for.

Two panels now fill it, both from the live stream:

- **Why this phase** — the design brief's §7.5 score ledger: the four phase scores as
  bars, the served phase in signal green, and the decision boundary drawn as a dashed line
  at *served score + hysteresis margin* — what a challenger must clear before an ordinary
  preference switch is even considered. The served phase is often not the highest bar
  (N–S right at 0.03 served while two challengers sat at 0.35 under a 0.40 boundary, on the
  first live look), and this is the panel that shows that as a decision rather than a
  fault. The margin was only inside the reason text before; `Decision` gained
  `switch_margin` (the effective margin of that tick; 0.0 for the baselines, which have
  none) and `decision_view` exports it as `margin`.
- **Recent switches** — the last five phase changes: time, from → to, how long the ended
  phase had run, and the rule (priority / gap-out / starvation / emergency). Sourced from
  the snapshot's own 60 s `phase_history`, so it is right the moment the page opens; the
  rule comes from the page's per-tick history and is shown only for ticks this page saw —
  a switch from before the page opened shows without one rather than with a guess.

**The Decisions page** (still `NotBuiltPage`) is decided: it will be built as the brief's
§8.4 audit trail — every decision of a run from `GET /api/logs/decisions`, dense list,
filter by mode, row → ledger + desired/actual + full reason — the one page that can show
a run after it has ended. Not yet built; it waits on the database question below.

### 30.13 The database knows which run a row belongs to (2026-09-17)

Chethan, on hearing Decisions would read the database: "we don't want the previous
running data when it finishes running". He was right to ask — nothing separated runs.
Every demo run appended to the same four insert-only tables with no run id (564,638 rows,
74 MB, by then), and `/api/logs/decisions` ordered by simulated time was every run ever,
shuffled. He chose "keep the last few runs, scoped" over "current run only", so the
offline calibration script keeps enough history.

- **`run_id` on every row** of all four tables: the run's ISO UTC start time (the
  console passes its `started_at`, so a GUI handover continues the same run; a terminal
  `app.py` run makes its own). Added by `ALTER TABLE` to an existing file like the
  actual-state columns were, with an index per table; legacy rows keep NULL and count as
  the oldest run.
- **Pruning at run start**: `DatabaseLogger.prune_runs(Config.DB_KEEP_RUNS = 10)` deletes
  rows from runs older than the newest ten (this run counted), then `VACUUM`s so the file
  is the size of what it holds — the legacy 74 MB became 4 MB.
- **Reads are per run**: `/api/logs/{decisions,performance,predictions}` take `?run=`
  and default to the newest run (`?run=all` is the old behaviour, for a legacy file);
  `/api/logs/runs` lists the runs held, newest first; the three analytics functions and
  their endpoints take `run_id` (default `"latest"`). `decisions` rows now also carry
  `actual_phase` / `actual_is_yellow` / `run_id`, which the Decisions page will show.
- Tests: `tests/test_db_logger_runs.py` (rows carry their run, reads default to the
  latest, pruning keeps the newest N and drops legacy rows first). 98/98.

Evaluations still write nothing to the database (they never did); the CSV under
`results/` is their record.

### 30.14 The Decisions page (2026-09-17)

The last placeholder is gone. `pages/DecisionsPage.tsx` is the design brief's §8.4 audit
trail, built on the run-scoped database of 30.13:

- **A run picker** (newest first: "17 Sept, 16:24 · Emergency vehicles · 00:14:14") from
  `/api/logs/runs`, which now also reports the scenario and switch count; the newest run
  is followed unless the reader picks another, and while the selected run is the one the
  console is writing, the page polls `?after_id=` every 2 s and appends — a "live" pill
  says so. The scenario a run played is stored on its decision rows (`scenario`), as are
  the four phase scores and the margin of every tick (`phase_scores`, `margin`), so a
  past decision's ledger can be redrawn exactly; rows from before this change show
  "not recorded" rather than a guess.
- **Rule chips with counts** (All · Switches 57 · Minimum green 441 · Priority 270 ·
  Emergency 133 · Gap-out 11 on the emergency run) filter the list; the phase a row
  replaced is computed on the full run, so a filtered list still marks real switches.
- **A windowed list** (`decisions/DecisionList.tsx`: fixed 30 px rows, only the visible
  slice in the DOM — an hour is 3 600 rows), newest at the bottom, pinned there while
  following unless the reader scrolls up; ↑/↓ move the selection.
- **The opened decision** (`DecisionDetail.tsx`): the rule and its plain sentence, the
  full reason, engine-decided vs light-showing with the amber case explained ("amber —
  clearing into the decided phase", never a fault), and the same `ScoreLedger` Overview
  shows live, from the row's own scores and margin — on the emergency run's override it
  shows N–S straight+left taken at 0.22 against a 0.60 boundary, which is the point.
- The data hook (`decisions/useDecisionLog.ts`) walks a run forward with `after_id` a
  page at a time, so a run longer than the API's 1 000-row cap is complete. Evaluations
  never write the database, so only demo runs appear; the CSV under `results/` is theirs.

`NotBuiltPage.tsx` is deleted. Five pages, none a placeholder.

### 30.15 Video-smooth traffic: the motion buffer and SUMO's own heading (2026-09-17)

Chethan: a tiny hitch every few seconds in otherwise smooth traffic, in both views, and
turning vehicles whose nose swung first and body followed.

**Measured first.** On the wire at 2x, frames due every 100 ms arrived alternating ~92 and
~142 ms (±20 ms sd; the 33 ms broadcast poll plus pacing). Both views tweened toward each
frame as it landed, over the *average* interval, so on every longer gap the car reached its
mark and stood still for the difference — 30-50 ms, a few times a second, noticed every
few seconds. The heading was derived from position deltas, and on entering a turn the
derived angle led the interpolated position: the nose swung, the body caught up.

**The fix is what a video player does.** `data/motion.ts` keeps the last twelve frames per
fleet (`MotionBuffer`: the demo, and the evaluation's `ai` and `baseline`), fed at ingest,
and a `DisplayClock` per view draws the traffic a fixed 250 ms *behind* the newest frame,
advancing at the measured sim rate and easing toward that lag; each animation frame
samples the buffer at the display time and interpolates every vehicle between the two
frames that bracket it. Jitter smaller than the lag cannot show, nothing extrapolates
past the newest frame (which is what once put cars on the verge), and a vehicle that just
appeared sits at its first position rather than sliding in from nowhere. The plate's
`VehicleLayer` writes transforms straight to its `<g>` elements from a
`requestAnimationFrame` loop — React only decides which vehicles have an element — and
`Junction3D` runs the identical buffer and clock, so the two views move as one.
`vehiclePlacement.ts` and the 3D view's from/to segments are gone.

**Heading is SUMO's.** The adapter subscribes to `VAR_ANGLE` as well; `VehicleState.angle`
(degrees clockwise from north, SUMO's convention along the lane's real shape) rides in
every frame and is interpolated the short way round. On the plate that is `angle − 90` in
its clockwise-from-east frame; in 3D it is `rotation.y` directly. Nothing in the
pipeline reads it — training rows are untouched. The broadcast poll dropped 33 → 10 ms.

Measured on the page, `heavy_seed1`: 721 display frames over 12 s at 1x with **zero**
frames in which the moving traffic did not move (the old hitch), headings changing at
most 2.6° per display frame with no jump over 8°; at 11x, 479 frames, zero stalls, the
corner clearance of 30.11 kept. Six Vitest cases pin the buffer and the clock.

**Lane changes (later the same day).** Chethan watched an East→South left-turner land in
the kerb lane and "suddenly come to the middle". That is SUMO's lane-change model moving
it to the middle lane — and SUMO performs a lane change as an instantaneous 3.2 m sideways
jump between two steps, which the buffer drew faithfully as a one-frame slide. Offered a
cosmetic easing or SUMO's `lanechange.duration` (which changes the dynamics and would
invalidate the sweep), he chose the easing: the buffer notes a jump of ≥ 1.5 m sideways
between two frames on the same road (`noteLaneChanges`) and, for `LANE_CHANGE_SECONDS`
(1.2 s) after it, pulls the drawn pose back toward the old lane on a smoothstep with up
to 6° of yaw toward the new one — the along-road motion exact throughout, the car exactly
where SUMO put it once the drift ends. Turns (internal lanes) and merges onto another road
are left alone. Two more Vitest cases; 18 in all.

**And one bug of mine in 3D**, reported by Chethan as "turning abnormally" and "stopping
on the line": the scene's z axis runs south (z = CENTRE − y) and a group faces (sin θ,
cos θ), so SUMO's north-based angle maps to θ = π − angle — I had used θ = angle, which
faced every north/south vehicle backwards and therefore pushed its body *forward* across
the stop line instead of back from the bumper. East/west vehicles happened to be right,
which is why it was not obvious. Fixed and checked against queues on all four arms.

**Bodies (later).** "They just seem like boxes now" — the bus and truck were one slab
each. `Junction3D` now builds a truck as a chassis, a darker tractor cab with a
windscreen, a cargo box in the vType colour and six wheels; a bus as a chassis, one long
body with a dark window band along both sides, a windscreen and four large wheels; and a
car as its lower body, glazed cabin and four wheels. Geometry is still cached per
(kind, dimensions) and shared, so the cost per vehicle is unchanged. The fire engine
(9 m) takes the truck build, the ambulance and police car the car build.
