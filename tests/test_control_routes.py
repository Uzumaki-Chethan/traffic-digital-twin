"""
test_control_routes.py
=======================
The console's control endpoints, driven through FastAPI's TestClient
against a supervisor with fake runners - no SUMO. Covers what the
frontend relies on: scenario selection on start, the start-evaluation
route, one-run-at-a-time refusals with their exact sentences, and
run-state carrying kind/scenario.

Run from backend/:  pytest ../tests/test_control_routes.py
"""

import sys
import threading
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.control_routes import build_control_router
from services.live_state import LiveStateStore
from services.sim_supervisor import SimulationSupervisor


class _Blocking:
    def __init__(self):
        self.started = threading.Event()

    def demo(self, store, control, *, gui=False, load_state=None, sumocfg=None):
        self.started.set()
        while not control.stop_requested:
            control.wait_if_paused()
            time.sleep(0.01)

    def evaluation(self, store, control, scenario_name, baseline):
        self.started.set()
        while not control.stop_requested:
            control.wait_if_paused()
            time.sleep(0.01)


@pytest.fixture
def console():
    fake = _Blocking()
    sup = SimulationSupervisor(LiveStateStore(), runner=fake.demo, evaluation_runner=fake.evaluation)
    app = FastAPI()
    app.include_router(build_control_router(LiveStateStore(), run_control=sup.run_control, supervisor=sup))
    client = TestClient(app)
    yield client, sup, fake
    if sup.is_running():
        sup.stop()
        sup.join(timeout=3.0)


def test_unknown_scenario_is_a_400(console):
    client, _, _ = console
    r = client.post("/api/control/start-simulation", json={"scenario_name": "../../evil"})
    assert r.status_code == 400 and "Unknown scenario" in r.json()["detail"]
    r = client.post("/api/control/start-evaluation", json={"scenario_name": "nope"})
    assert r.status_code == 400


def test_start_simulation_with_a_scenario_shows_in_run_state(console):
    client, sup, fake = console
    r = client.post("/api/control/start-simulation", json={"scenario_name": "light_seed1"})
    assert r.status_code == 200 and fake.started.wait(2.0)
    state = client.get("/api/control/run-state").json()
    assert state["running"] is True and state["kind"] == "demo" and state["scenario"] == "light_seed1"


def test_start_simulation_without_a_scenario_is_the_default(console):
    client, _, fake = console
    assert client.post("/api/control/start-simulation", json={}).status_code == 200
    assert fake.started.wait(2.0)
    assert client.get("/api/control/run-state").json()["scenario"] == "default"


def test_one_run_at_a_time_with_the_exact_sentences(console):
    client, sup, fake = console
    client.post("/api/control/start-simulation", json={})
    assert fake.started.wait(2.0)
    r = client.post("/api/control/start-evaluation", json={"scenario_name": "light_seed1"})
    assert r.status_code == 409 and r.json()["detail"] == "A demo run is active — stop it first."
    client.post("/api/control/stop-simulation")
    sup.join(timeout=3.0)

    fake.started.clear()
    r = client.post("/api/control/start-evaluation", json={"scenario_name": "light_seed1"})
    assert r.status_code == 200 and fake.started.wait(2.0)
    state = client.get("/api/control/run-state").json()
    assert state["kind"] == "evaluation" and state["scenario"] == "light_seed1"
    r = client.post("/api/control/start-simulation", json={})
    assert r.status_code == 409 and r.json()["detail"] == "An evaluation is active — stop it first."
    r = client.post("/api/control/open-gui")
    assert r.status_code == 409 and "Only a demo run" in r.json()["detail"]


def test_evaluation_rejects_an_unknown_baseline(console):
    client, _, _ = console
    r = client.post("/api/control/start-evaluation", json={"scenario_name": "light_seed1", "baseline": "magic"})
    assert r.status_code == 400
