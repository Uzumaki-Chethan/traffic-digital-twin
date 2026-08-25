"""
services
========
Read-only runtime services: the live-state hand-off store and the
FastAPI dashboard server. Nothing here can influence the simulation.
"""

from services.live_state import LiveStateStore, DEFAULT_STORE
from services.dashboard_server import start_dashboard_server

__all__ = ["LiveStateStore", "DEFAULT_STORE", "start_dashboard_server"]