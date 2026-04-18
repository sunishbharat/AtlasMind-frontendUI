"""
aggregator
Flat public API for the pandas aggregation pipeline.
Callers import aggregate() directly - the engine class is an implementation detail.
"""

from .engine import AggregationEngine
from .models import (
    AggregateRequest,
    AggregateResponse,
    ChartSpecInput,
    PiePoint,
    ScatterPoint,
    SeriesData,
)

_engine = AggregationEngine()


def aggregate(request: AggregateRequest) -> AggregateResponse:
    """Aggregate raw Jira issues into chart-ready data. Thread-safe."""
    return _engine.aggregate(request)


__all__ = [
    "aggregate",
    "AggregateRequest",
    "AggregateResponse",
    "ChartSpecInput",
    "SeriesData",
    "PiePoint",
    "ScatterPoint",
]
