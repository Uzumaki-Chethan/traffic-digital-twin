"""
analytics package
==================
Read-only, post-hoc analysis over the SQLite log tables db_logger.py
writes. Nothing in this package ever opens a write connection or
touches the live simulation - see congestion_analytics.py's own
docstring for the full read-only contract.
"""

from analytics.congestion_analytics import (
    average_wait_times,
    congestion_trend,
    detect_peak_periods,
)

__all__ = ["average_wait_times", "congestion_trend", "detect_peak_periods"]
