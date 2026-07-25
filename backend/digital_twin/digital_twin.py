"""
digital_twin.py
================
The Digital Twin, Stage 1.

The Digital Twin is the synchronized digital representation of the
traffic system, it is the central source of truth every future module
will read from. It is not a simulator, not the Decision Engine, not
Feature Engineering, not Machine Learning, and it performs no
calculations of any kind.

At this stage it has exactly three responsibilities:
    1. Store the latest SimulationState.
    2. Maintain a bounded rolling history of previous SimulationState
       objects.
    3. Expose both through safe, read-only properties.

State only ever enters through update(). Nothing else in this class
mutates its internal state, and nothing outside this class can reach in
and mutate it either, both _current_state and _history are private, and
history is only ever handed out as an immutable tuple.
"""

from collections import deque
from typing import Deque, Optional, Tuple

from models import SimulationState


class DigitalTwin:
    """
    Stores the latest SimulationState and a bounded history of the
    states that preceded it.

    The current state and the history are kept separate: _current_state
    always holds the most recent snapshot, while _history holds only the
    snapshots that have since been superseded. This mirrors how a real
    digital twin distinguishes "what the system looks like right now"
    from "what it looked like before", and keeps that distinction
    explicit rather than folding the current state into the history and
    re-deriving it on every read.
    """

    def __init__(self, history_size: int = 1000):
        """
        Parameters
        ----------
        history_size : int
            The maximum number of previous SimulationState objects to
            retain. Once this limit is reached, the oldest snapshot is
            automatically discarded as a new one is added, handled by
            collections.deque's built in maxlen behaviour.
        """
        self._history_size: int = history_size
        self._history: Deque[SimulationState] = deque(maxlen=history_size)
        self._current_state: Optional[SimulationState] = None

    def update(self, state: SimulationState) -> None:
        """
        Update the Digital Twin with a new SimulationState.

        The previously stored current state, if one exists, is moved
        into history before being replaced, so history always reflects
        states that have been superseded, never the current one.

        Parameters
        ----------
        state : SimulationState
            The new snapshot to record as the current state.

        Raises
        ------
        TypeError
            If state is not a SimulationState instance. Validated here
            so an incorrect caller fails immediately and clearly, rather
            than corrupting the twin with data of the wrong shape.
        """
        if not isinstance(state, SimulationState):
            raise TypeError(
                "DigitalTwin.update() expects a SimulationState, got "
                f"{type(state).__name__}."
            )

        if self._current_state is not None:
            self._history.append(self._current_state)

        self._current_state = state

    @property
    def current_state(self) -> Optional[SimulationState]:
        """
        The most recently stored SimulationState.

        Returns
        -------
        SimulationState | None
            None if update() has not yet been called. SimulationState
            itself is an immutable dataclass, so returning it directly
            exposes no mutable internal state.
        """
        return self._current_state

    @property
    def history(self) -> Tuple[SimulationState, ...]:
        """
        The rolling history of previous SimulationState objects, oldest
        first.

        Returns
        -------
        Tuple[SimulationState, ...]
            A new, immutable tuple snapshot of the internal deque.
            Returning a tuple rather than the deque itself means callers
            can never append to, clear, or otherwise mutate the Digital
            Twin's internal history.
        """
        return tuple(self._history)

    @property
    def history_size(self) -> int:
        """
        The configured maximum number of previous states retained in
        history.

        Returns
        -------
        int
            The history_size value the Digital Twin was constructed
            with.
        """
        return self._history_size