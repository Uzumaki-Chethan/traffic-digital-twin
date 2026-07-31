"""
data_collector.py
===================
DataCollector: turns a stream of TrafficFeatures snapshots into labeled
(feature_vector, target_vector) training rows.

Single responsibility: pairing a feature snapshot with the correct
future snapshot exactly PREDICTION_HORIZON_SECONDS later, at
SAMPLING_INTERVAL_SECONDS resolution, and only emitting a row when the
actual elapsed simulation time between the two snapshots matches the
intended horizon within tolerance. Nothing in this class knows about
SUMO, TraCI, CSV files, or the network, it only knows about
TrafficFeatures and time.

This is deliberately unit-testable with fake TrafficFeatures objects and
no SUMO involvement at all, see the bottom of this file's module tests
for exactly that.
"""

from collections import deque
from typing import Deque, List, NamedTuple, Optional

from models import TrafficFeatures
from ml.feature_schema import PREDICTION_HORIZON_SECONDS, features_to_vector, targets_to_vector
from ml.training.config import TrainingConfig


class Row(NamedTuple):
    """One labeled training row, before it is written to disk."""

    feature_time: float
    target_time: float
    feature_vector: List[float]
    target_vector: List[float]


class DataCollector:
    """
    Buffers TrafficFeatures snapshots and emits labeled rows once a
    future snapshot at the correct horizon becomes available.

    Sampling is throttled to TrainingConfig.SAMPLING_INTERVAL_SECONDS,
    not every call to observe() produces a buffered snapshot, SUMO's
    step-length is much finer (0.05s) than a useful sampling interval,
    collecting every raw step would produce a dataset dominated by
    near-duplicate rows.
    """

    def __init__(
        self,
        horizon_seconds: float = PREDICTION_HORIZON_SECONDS,
        sampling_interval_seconds: float = TrainingConfig.SAMPLING_INTERVAL_SECONDS,
        horizon_tolerance_seconds: float = TrainingConfig.HORIZON_TOLERANCE_SECONDS,
    ):
        self._horizon_seconds = horizon_seconds
        self._sampling_interval_seconds = sampling_interval_seconds
        self._horizon_tolerance_seconds = horizon_tolerance_seconds

        # Bounded generously, just needs to comfortably span one horizon
        # worth of sampled snapshots, not the whole run.
        buffer_size = int(horizon_seconds / sampling_interval_seconds) + 10
        self._buffer: Deque[TrafficFeatures] = deque(maxlen=buffer_size)

        self._last_sampled_time: Optional[float] = None
        self._rows: List[Row] = []

    def observe(self, features: TrafficFeatures) -> None:
        """
        Offer one TrafficFeatures snapshot to the collector.

        Only actually samples it if enough simulated time has passed
        since the last sample (see SAMPLING_INTERVAL_SECONDS), and only
        emits a row if a previously buffered snapshot is now exactly
        horizon_seconds (within tolerance) in the past relative to this
        one.
        """
        current_time = features.simulation_time

        if not self._should_sample(current_time):
            return

        self._last_sampled_time = current_time
        self._buffer.append(features)
        self._try_emit_row(features)

    def _should_sample(self, current_time: float) -> bool:
        if self._last_sampled_time is None:
            return True
        return (current_time - self._last_sampled_time) >= self._sampling_interval_seconds

    def _try_emit_row(self, current_features: TrafficFeatures) -> None:
        """
        Look through the buffer for a snapshot whose time is horizon
        seconds before current_features, within tolerance. If found,
        emit a Row pairing that older snapshot's features with this
        snapshot's targets.

        Snapshots that are checked but do not (yet, or ever) find a
        matching pair are simply left in the buffer to expire naturally
        via its maxlen, no separate cleanup logic is needed.
        """
        target_time = current_features.simulation_time
        desired_feature_time = target_time - self._horizon_seconds

        for candidate in self._buffer:
            elapsed = target_time - candidate.simulation_time
            if abs(elapsed - self._horizon_seconds) <= self._horizon_tolerance_seconds:
                self._rows.append(
                    Row(
                        feature_time=candidate.simulation_time,
                        target_time=target_time,
                        feature_vector=features_to_vector(candidate),
                        target_vector=targets_to_vector(current_features),
                    )
                )
                return
        # No candidate matched within tolerance, silently skip, this is
        # expected for the first horizon_seconds of every run, before
        # any snapshot old enough to pair exists yet.
        _ = desired_feature_time  # documents intent, not used further

    @property
    def rows(self) -> List[Row]:
        """All rows emitted so far. A new list each call, not the
        internal list itself, so callers cannot mutate collector state."""
        return list(self._rows)