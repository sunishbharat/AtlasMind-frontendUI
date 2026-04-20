"""
aggregator/models.py
Pydantic models for the aggregation pipeline request/response contract.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# - Request models -------------------------------------------------------------

class ChartSpecInput(BaseModel):
    type: str                           # "bar"|"pie"|"line"|"stacked_bar"|"scatter"|"trend"|"burndown"
    title: str | None = None
    x_field: str
    y_field: str                        # "count" or a numeric field name
    color_field: str | None = None      # optional grouping / stack dimension
    max_categories: int = Field(default=20, ge=1, le=100)
    max_series: int = Field(default=8, ge=1, le=20)


class AggregateRequest(BaseModel):
    issues: list[dict[str, Any]]
    chart_spec: ChartSpecInput
    display_fields: list[str] | None = None      # fields to compute value-count histograms for
    field_map: dict[str, str] | None = None      # display name → raw Jira key (e.g. "Domain" → "customfield_1xxxx")
    active_filters: dict[str, list[str]] | None = None  # display_field → [value, ...] to keep
    react_to_filters: bool = False               # when True, apply active_filters before aggregation


# - Response models ------------------------------------------------------------

class SeriesData(BaseModel):
    name: str
    data: list[float | None]            # parallel to x_axis; None = gap (burndown projected)
    chart_type: str                     # ECharts series type hint: "bar"|"line"
    stack: str | None = None            # non-null signals stacked rendering to ECharts


class PiePoint(BaseModel):
    name: str
    value: float


class ScatterPoint(BaseModel):
    name: str                           # issue key or label
    x: float
    y: float
    group: str                          # color_field value, or "" when absent


class AggregateResponse(BaseModel):
    chart_type: str
    title: str
    x_axis: list[str]                   # ordered category labels (empty for pie/scatter)
    series: list[SeriesData]            # bar / line / stacked_bar / trend / burndown
    pie_data: list[PiePoint] | None     # populated for pie only
    scatter_data: list[ScatterPoint] | None  # populated for scatter only
    total_issues: int
    fields_resolved: dict[str, str]     # original hint -> resolved DataFrame column
    warnings: list[str]
    field_counts: dict[str, dict[str, int]] | None = None  # display_field -> {value: count}; always from full dataset
    filtered_count: int | None = None            # row count after applying active_filters (None when react_to_filters=False)
