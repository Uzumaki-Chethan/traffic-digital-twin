"""
test_run_control.py
===================
Offline tests for the two pieces that let the browser drive a run:
services/run_control.py (pause / stop / pacing) and
services/sim_supervisor.py (start / stop / one-at-a-time).

Neither needs SUMO. RunControl imports no traci by design, and the
supervisor takes its runner as a parameter specifically so a test can
hand it a fake one instead of the real SUMO pipeline.

Run from the `backend/` directory (or with `backend/` on PYTHONPATH),
matching the rest of the suite:
    cd backend && pytest ../tests/test_run_control.py
"""

import os
import sys
import tempfile
import threading
import time

import pytest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.run_control import RunControl
from services.sim_supervisor import SimulationSupervisor


# ---- RunControl: pause / stop ------------------------------------------

def test_starts_running_and_unblocked():
    control = RunControl()
    assert not control.paused
    assert not control.stop_requested
    # Must not block: a run that never touches this has to behave as if
    # RunControl did not exist.
    control.wait_if_paused()


def test_pause_blocks_until_resumed():
    control = RunControl()
    control.pause()
    assert control.paused

    released = threading.Event()

    def worker():
        control.wait_if_paused()
        released.set()

    threading.Thread(target=worker, daemon=True).start()
    assert not released.wait(0.3), "wait_if_paused returned while still paused"
    control.resume()
    assert released.wait(2.0), "wait_if_paused did not return after resume"
    assert not control.paused


def test_stop_releases_a_paused_run():
    """A stop request must reach a run that is parked on the pause event."""
    control = RunControl()
    control.pause()
    released = threading.Event()
    threading.Thread(
        target=lambda: (control.wait_if_paused(), released.set()), daemon=True,
    ).start()
    assert not released.wait(0.2)
    control.request_stop()
    assert released.wait(2.0)
    assert control.stop_requested


def test_reset_clears_stop_and_pause_for_a_second_run():
    control = RunControl()
    control.pause()
    control.request_stop()
    control.reset()
    assert not control.paused
    assert not control.stop_requested
    control.wait_if_paused()


# ---- RunControl: pacing -------------------------------------------------

def test_pace_holds_simulated_time_to_wall_time():
    """
    Ten 0.05 s steps at 1x should take about half a second of wall clock.
    Generous bounds: this asserts the throttle exists and is roughly
    right, not that the OS scheduler is precise.
    """
    control = RunControl(speed=1.0)
    started = time.monotonic()
    for _ in range(10):
        control.pace(0.05)
    elapsed = time.monotonic() - started
    assert 0.35 <= elapsed <= 0.95, elapsed


def test_pace_scales_with_speed():
    control = RunControl(speed=5.0)
    started = time.monotonic()
    for _ in range(10):
        control.pace(0.05)
    elapsed = time.monotonic() - started
    assert elapsed <= 0.35, elapsed


def test_unthrottled_speed_does_not_sleep():
    control = RunControl(speed=1.0)
    control.set_speed(None)
    assert control.speed is None
    started = time.monotonic()
    for _ in range(50):
        control.pace(0.05)
    assert time.monotonic() - started < 0.1


def test_non_positive_speed_is_treated_as_unthrottled():
    control = RunControl()
    control.set_speed(0)
    assert control.speed is None
    control.set_speed(-3)
    assert control.speed is None


def test_pace_returns_immediately_once_stopped():
    """A pending pacing sleep must not delay a stop by a whole step."""
    control = RunControl(speed=0.01)  # a 0.05 s step would owe 5 s of sleep
    control.pace(0.05)  # anchors the schedule
    control.request_stop()
    started = time.monotonic()
    control.pace(0.05)
    assert time.monotonic() - started < 0.5


# ---- SimulationSupervisor ----------------------------------------------

class _FakeRunner:
    """
    Stands in for simulation_runner.run_simulation. Mirrors its real
    contract: same keyword arguments, ends on a stop request, and ends on
    a handover request after writing the state file the supervisor then
    looks for.
    """

    def __init__(self, write_state=True):
        self.started = threading.Event()
        self.calls = []
        self._write_state = write_state

    def __call__(self, store, control, *, gui=False, load_state=None, sumocfg=None):
        self.calls.append({"store": store, "gui": gui, "load_state": load_state, "sumocfg": sumocfg})
        self.started.set()
        # Behave like the real run loop: step until asked to stop or to
        # hand over to a SUMO window.
        while not control.stop_requested:
            control.wait_if_paused()
            if control.handover_requested:
                if self._write_state:
                    with open(control.handover_path, "w", encoding="utf-8") as fh:
                        fh.write("<snapshot/>")
                    return
                control.cancel_handover()
            time.sleep(0.01)


def test_supervisor_starts_and_stops_a_run():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    assert sup.status_dict()["can_start"] is True
    assert sup.status_dict()["running"] is False

    sup.start(gui=True)
    assert runner.started.wait(2.0)
    assert sup.is_running()
    status = sup.status_dict()
    assert status["running"] is True
    assert status["can_start"] is False
    assert status["gui"] is True

    assert sup.stop()["stopped"] is True
    sup.join(timeout=3.0)
    assert not sup.is_running()
    assert sup.status_dict()["can_start"] is True


def test_supervisor_refuses_a_second_concurrent_run():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start()
    assert runner.started.wait(2.0)
    try:
        raised = False
        try:
            sup.start()
        except RuntimeError:
            raised = True
        assert raised, "a second concurrent run was allowed"
    finally:
        sup.stop()
        sup.join(timeout=3.0)


def test_supervisor_can_start_again_after_a_run_ends():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start()
    assert runner.started.wait(2.0)
    sup.stop()
    sup.join(timeout=3.0)

    runner.started.clear()
    sup.start()
    assert runner.started.wait(2.0), "supervisor could not start a second run"
    assert len(runner.calls) == 2
    sup.stop()
    sup.join(timeout=3.0)


def test_stopped_run_does_not_report_stopping_forever():
    """
    RunControl keeps its stop flag until the next reset(), so the
    supervisor has to suppress it once nothing is running - otherwise the
    UI says "Stopping..." for the rest of the session.
    """
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start()
    assert runner.started.wait(2.0)
    sup.stop()
    sup.join(timeout=3.0)
    status = sup.status_dict()
    assert status["stopping"] is False
    assert status["paused"] is False


def test_supervisor_reports_a_crashed_run_instead_of_hiding_it():
    def explode(store, control, *, gui=False, load_state=None, sumocfg=None):
        raise ValueError("SUMO is not installed")

    sup = SimulationSupervisor(store=object(), runner=explode)
    sup.start()
    sup.join(timeout=3.0)
    status = sup.status_dict()
    assert status["running"] is False
    assert status["can_start"] is True
    assert "SUMO is not installed" in status["error"]


def test_a_new_start_clears_the_previous_error():
    def explode(store, control, *, gui=False, load_state=None, sumocfg=None):
        raise ValueError("boom")

    sup = SimulationSupervisor(store=object(), runner=explode)
    sup.start()
    sup.join(timeout=3.0)
    assert sup.status_dict()["error"] is not None

    runner = _FakeRunner()
    sup._runner = runner  # same supervisor, a runner that works this time
    sup.start()
    assert runner.started.wait(2.0)
    assert sup.status_dict()["error"] is None
    sup.stop()
    sup.join(timeout=3.0)


# ---- GUI handover -------------------------------------------------------
# SUMO cannot attach a window to a process that is already running, so
# "open the SUMO window" means saving the state and resuming from it.
# What matters is that it reads as ONE run throughout, not a stop and a
# fresh start: same thread, still running, and the second launch is given
# the saved state.


def test_handover_resumes_the_same_run_in_a_window():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start(gui=False)
    assert runner.started.wait(2.0)

    runner.started.clear()
    sup.open_gui()
    assert runner.started.wait(3.0), "the run was not relaunched"

    # Still one continuous run from the outside.
    assert sup.is_running()
    assert sup.status_dict()["gui"] is True

    assert len(runner.calls) == 2
    first, second = runner.calls
    assert first["gui"] is False and first["load_state"] is None
    assert second["gui"] is True
    assert second["load_state"] and os.path.isfile(second["load_state"])

    sup.stop()
    sup.join(timeout=3.0)
    os.remove(second["load_state"])


def test_handover_is_refused_when_nothing_is_running():
    sup = SimulationSupervisor(store=object(), runner=_FakeRunner())
    raised = False
    try:
        sup.open_gui()
    except RuntimeError:
        raised = True
    assert raised


def test_handover_is_refused_when_the_window_is_already_open():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start(gui=True)
    assert runner.started.wait(2.0)
    raised = False
    try:
        sup.open_gui()
    except RuntimeError:
        raised = True
    assert raised
    sup.stop()
    sup.join(timeout=3.0)


def test_a_failed_state_save_leaves_the_run_alone():
    """
    If saving the state fails there is nothing to reopen, so the run must
    carry on headless rather than ending for nothing.
    """
    runner = _FakeRunner(write_state=False)
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start(gui=False)
    assert runner.started.wait(2.0)

    sup.open_gui()
    time.sleep(0.3)
    assert sup.is_running()
    assert len(runner.calls) == 1, "the run was relaunched despite no saved state"
    assert sup.status_dict()["gui"] is False

    sup.stop()
    sup.join(timeout=3.0)


def test_reset_clears_a_pending_handover():
    control = RunControl()
    control.request_handover(os.path.join(tempfile.gettempdir(), "nope.xml"))
    assert control.handover_requested
    control.reset()
    assert not control.handover_requested
    assert control.handover_path is None


def test_handover_releases_a_paused_run():
    """Like a stop request: a parked run has to notice it was asked."""
    control = RunControl()
    control.pause()
    released = threading.Event()
    threading.Thread(
        target=lambda: (control.wait_if_paused(), released.set()), daemon=True,
    ).start()
    assert not released.wait(0.2)
    control.request_handover("state.xml")
    assert released.wait(2.0)


# ===================== resolve_config(sumocfg=) =====================

def test_resolve_config_sumocfg_override_is_a_throwaway_subclass():
    from config import Config
    from simulation_runner import resolve_config
    cfg = resolve_config(sumocfg="/tmp/x.sumocfg")
    assert cfg.SUMOCFG_PATH == "/tmp/x.sumocfg"
    assert cfg is not Config and issubclass(cfg, Config)
    assert Config.SUMOCFG_PATH != "/tmp/x.sumocfg"


def test_resolve_config_without_overrides_is_config_itself():
    from config import Config
    from simulation_runner import resolve_config
    assert resolve_config() is Config


# ===================== supervisor: kind, scenario, evaluations =====================

class _FakeEvaluation:
    """Stands in for the in-process evaluation runner: same 4 arguments,
    runs until stopped, records what it was asked to run."""

    def __init__(self):
        self.started = threading.Event()
        self.calls = []

    def __call__(self, store, control, scenario_name, baseline):
        self.calls.append({"store": store, "control": control,
                           "scenario_name": scenario_name, "baseline": baseline})
        self.started.set()
        while not control.stop_requested:
            control.wait_if_paused()
            time.sleep(0.01)


def test_supervisor_reports_kind_and_scenario_for_a_demo():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start(gui=False, scenario_name="light_seed1")
    assert runner.started.wait(2.0)
    try:
        status = sup.status_dict()
        assert status["kind"] == "demo" and status["scenario"] == "light_seed1"
        assert runner.calls[0]["sumocfg"].endswith("light_seed1.sumocfg")
    finally:
        sup.stop(); sup.join(timeout=3.0)
    assert sup.status_dict()["kind"] is None


def test_supervisor_default_scenario_when_none_given():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    sup.start()
    assert runner.started.wait(2.0)
    try:
        assert sup.status_dict()["scenario"] == "default"
        assert runner.calls[0]["sumocfg"] is None  # production route = Config's own path
    finally:
        sup.stop(); sup.join(timeout=3.0)


def test_start_evaluation_runs_the_evaluation_runner_with_the_shared_control():
    evaluation = _FakeEvaluation()
    sup = SimulationSupervisor(store=object(), evaluation_runner=evaluation)
    sup.start_evaluation("heavy_seed1", baseline="vac")
    assert evaluation.started.wait(2.0)
    try:
        status = sup.status_dict()
        assert status["kind"] == "evaluation" and status["scenario"] == "heavy_seed1"
        assert status["running"] is True and status["can_start"] is False
        call = evaluation.calls[0]
        assert call["scenario_name"] == "heavy_seed1" and call["baseline"] == "vac"
        assert call["control"] is sup.run_control
    finally:
        sup.stop(); sup.join(timeout=3.0)
    assert sup.status_dict()["kind"] is None and sup.status_dict()["can_start"] is True


def test_second_start_of_either_kind_is_refused_with_the_right_sentence():
    runner = _FakeRunner(); evaluation = _FakeEvaluation()
    sup = SimulationSupervisor(store=object(), runner=runner, evaluation_runner=evaluation)
    sup.start(); assert runner.started.wait(2.0)
    with pytest.raises(RuntimeError, match="A demo run is active"):
        sup.start_evaluation("light_seed1")
    sup.stop(); sup.join(timeout=3.0)
    sup.start_evaluation("light_seed1"); assert evaluation.started.wait(2.0)
    try:
        with pytest.raises(RuntimeError, match="An evaluation is active"):
            sup.start()
        with pytest.raises(RuntimeError, match="An evaluation is active"):
            sup.start_evaluation("light_seed1")
    finally:
        sup.stop(); sup.join(timeout=3.0)


def test_open_gui_is_refused_for_an_evaluation():
    evaluation = _FakeEvaluation()
    sup = SimulationSupervisor(store=object(), evaluation_runner=evaluation)
    sup.start_evaluation("light_seed1"); assert evaluation.started.wait(2.0)
    try:
        with pytest.raises(RuntimeError, match="Only a demo run"):
            sup.open_gui()
    finally:
        sup.stop(); sup.join(timeout=3.0)


def test_unknown_scenario_is_refused_before_a_thread_starts():
    runner = _FakeRunner()
    sup = SimulationSupervisor(store=object(), runner=runner)
    with pytest.raises(ValueError):
        sup.start(scenario_name="../../evil")
    assert not sup.is_running()
