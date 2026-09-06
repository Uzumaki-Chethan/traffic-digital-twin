"""
congestion_analytics.py
========================
Read-only, post-hoc congestion analysis over the SQLite tables
db_logger.py writes (performance_log, lane_state_log). No write
connection is ever opened here, no FastAPI/Config dependency - every
function takes db_path explicitly, exactly like dashboard_server.py's
own read-only endpoints already do, so this module can be exercised
directly (scripts, tests, a future CLI) without booting the dashboard.

"Peak traffic periods" are detected STATISTICALLY from the recorded
congestion_score history (see decision_engine._lane_score - the exact
same 0-1 urgency score already computed once per tick and persisted by
app.py into lane_state_log) rather than assumed from wall-clock
time-of-day, because simulated time is elapsed seconds since a
scenario started, not a real hour of day.
"""

import sqlite3
from typing import Dict, List, Optional


def _read_only_connection(db_path: str) -> sqlite3.Connection:
    """Same read-only URI pattern as dashboard_server.py's own helper."""
    uri = "file:{}?mode=ro".format(db_path)
    return sqlite3.connect(uri, uri=True)


def _time_filter_clause(start_time: Optional[float], end_time: Optional[float]):
    clauses = []
    params: List[float] = []
    if start_time is not None:
        clauses.append("time >= ?")
        params.append(start_time)
    if end_time is not None:
        clauses.append("time <= ?")
        params.append(end_time)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    return where, params


def average_wait_times(
    db_path: str,
    group_by: str = "network",
    start_time: Optional[float] = None,
    end_time: Optional[float] = None,
) -> Dict:
    """
    group_by="network": mean of performance_log.avg_wait over the
    optional [start_time, end_time] range.
    group_by="lane": per-lane mean of lane_state_log.avg_waiting_time
    over the same range.

    Returns an empty-shaped result (not an error) if the database file
    does not exist yet - consistent with dashboard_server.py's own
    "no simulation has run yet" handling.
    """
    if group_by not in ("network", "lane"):
        raise ValueError("group_by must be 'network' or 'lane', got {!r}".format(group_by))

    where, params = _time_filter_clause(start_time, end_time)
    try:
        conn = _read_only_connection(db_path)
    except sqlite3.OperationalError:
        return (
            {"group_by": "network", "average_wait_seconds": None, "sample_count": 0}
            if group_by == "network"
            else {"group_by": "lane", "lanes": {}}
        )
    try:
        if group_by == "network":
            row = conn.execute(
                "SELECT AVG(avg_wait), COUNT(*) FROM performance_log" + where, params
            ).fetchone()
            return {
                "group_by": "network",
                "average_wait_seconds": row[0],
                "sample_count": row[1] or 0,
            }
        rows = conn.execute(
            "SELECT lane_id, AVG(avg_waiting_time), COUNT(*) FROM lane_state_log"
            + where + " GROUP BY lane_id",
            params,
        ).fetchall()
        return {
            "group_by": "lane",
            "lanes": {
                lane_id: {"average_wait_seconds": avg_wait, "sample_count": count}
                for lane_id, avg_wait, count in rows
            },
        }
    finally:
        conn.close()


def congestion_trend(
    db_path: str,
    bucket_seconds: float = 60.0,
    group_by: str = "network",
) -> List[Dict]:
    """
    Time-bucketed congestion_score trend, sourced from lane_state_log
    (the same per-lane urgency score DecisionEngine computed live, not
    recomputed here). Bucketing is done in Python rather than SQL
    because SQLite has no clean arbitrary-width time-bucket function
    and the row counts here (1 Hz x 12 lanes) are small enough that a
    single Python pass is simpler and just as fast.

    group_by="network": one series, each point the mean congestion
    score across all 12 lanes within that bucket.
    group_by="lane": one entry per (bucket, lane) pair that has at
    least one sample, each carrying its own "lane_id".

    Returns [] (not an error) if the database or table has no rows yet.
    """
    if group_by not in ("network", "lane"):
        raise ValueError("group_by must be 'network' or 'lane', got {!r}".format(group_by))
    if bucket_seconds <= 0:
        raise ValueError("bucket_seconds must be positive, got {!r}".format(bucket_seconds))

    try:
        conn = _read_only_connection(db_path)
    except sqlite3.OperationalError:
        return []
    try:
        rows = conn.execute(
            "SELECT time, lane_id, congestion_score FROM lane_state_log ORDER BY time"
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return []

    # bucket_index -> list[score] (network) or -> {lane_id: list[score]} (lane)
    buckets: Dict[int, object] = {}
    for time, lane_id, score in rows:
        bucket_index = int(time // bucket_seconds)
        if group_by == "network":
            buckets.setdefault(bucket_index, []).append(score)
        else:
            buckets.setdefault(bucket_index, {}).setdefault(lane_id, []).append(score)

    results: List[Dict] = []
    for bucket_index in sorted(buckets):
        bucket_start = bucket_index * bucket_seconds
        bucket_end = bucket_start + bucket_seconds
        if group_by == "network":
            scores = buckets[bucket_index]
            results.append({
                "bucket_start": bucket_start,
                "bucket_end": bucket_end,
                "avg_congestion_score": sum(scores) / len(scores),
                "sample_count": len(scores),
            })
        else:
            for lane_id, scores in sorted(buckets[bucket_index].items()):
                results.append({
                    "bucket_start": bucket_start,
                    "bucket_end": bucket_end,
                    "lane_id": lane_id,
                    "avg_congestion_score": sum(scores) / len(scores),
                    "sample_count": len(scores),
                })
    return results


def detect_peak_periods(
    db_path: str,
    top_n: int = 3,
    window_seconds: float = 60.0,
) -> List[Dict]:
    """
    Statistically detect the top_n highest-congestion, non-overlapping
    time windows recorded so far, using the network-wide congestion
    trend (congestion_trend(group_by="network")) as the underlying
    signal. "Peak" here means highest recorded congestion within THIS
    run's own history, not a wall-clock rush-hour assumption -
    simulated time has no real hour-of-day to anchor to (confirmed
    approach, see module docstring).

    NOTE: no table currently records which named scenario (e.g.
    "heavy_seed1") a given time range belongs to when running via
    app.py directly - only performance/evaluator.py's CSV output tags
    scenario names today. Each returned window's "scenario" field is
    therefore always None for now; having app.py log its own scenario
    name is a separate, deliberately not-yet-made change (flagged
    during design rather than added silently).
    """
    if top_n <= 0:
        raise ValueError("top_n must be positive, got {!r}".format(top_n))

    buckets = congestion_trend(db_path, bucket_seconds=window_seconds, group_by="network")
    if not buckets:
        return []

    ranked = sorted(buckets, key=lambda b: b["avg_congestion_score"], reverse=True)
    peaks = ranked[:top_n]
    # Report peaks in chronological order, not congestion-descending
    # order, so a viewer reads them the way the run actually unfolded.
    peaks.sort(key=lambda b: b["bucket_start"])
    return [
        {
            "start_time": peak["bucket_start"],
            "end_time": peak["bucket_end"],
            "peak_congestion_score": peak["avg_congestion_score"],
            "sample_count": peak["sample_count"],
            "scenario": None,
        }
        for peak in peaks
    ]
