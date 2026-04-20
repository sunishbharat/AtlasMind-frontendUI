"""
aggregator/engine.py
AggregationEngine - pandas-based chart data aggregation.
Accepts raw Jira issues + a chart spec, returns pre-aggregated chart-ready data.
"""

from __future__ import annotations

import re
from typing import Any

import janitor  # noqa: F401 - registers .clean_names() and .remove_empty() on DataFrame
import numpy as np
import pandas as pd

from .field_resolver import FieldResolver, _extract_jira_obj, _to_snake
from .models import (
    AggregateRequest,
    AggregateResponse,
    ChartSpecInput,
    PiePoint,
    ScatterPoint,
    SeriesData,
)

# - Constants ------------------------------------------------------------------

# camelCase variants removed — clean_names() normalises column names before this set is checked
DATE_FIELDS  = {"created", "updated", "resolutiondate", "duedate", "createddate"}
DATE_ISO_RE  = re.compile(r"^\d{4}-\d{2}-\d{2}")
SPRINT_RE    = re.compile(r"\bname=([^,\]]+)")
# Display-name variants removed — clean_names() normalises column names before this tuple is scanned
POINT_FIELDS = ("story_points", "points", "sp")
LINE_ALIASES = {"line", "multi-line", "multiline", "multi_line"}
COUNT_WORDS  = {"count", "count of issues", "number", "total"}

_BUCKET_FREQ = {"day": "D", "week": "W-MON", "month": "ME"}


# - Helpers --------------------------------------------------------------------

def _is_count_field(y_field: str) -> bool:
    lower = y_field.lower().strip()
    return lower in COUNT_WORDS or lower.startswith("count ")


def _normalise_type(chart_type: str) -> str:
    t = chart_type.lower().strip()
    return "line" if t in LINE_ALIASES else t


def _fmt_bucket_label(ts: pd.Timestamp, bucket: str) -> str:
    if bucket == "day":
        return ts.strftime("%b %-d")
    if bucket == "week":
        return "W " + ts.strftime("%b %-d")
    return ts.strftime("%b '%y")


def _auto_bucket(date_range_days: int) -> str:
    if date_range_days <= 31:
        return "day"
    if date_range_days <= 180:
        return "week"
    return "month"


def _flatten_value(val: Any) -> Any:
    """Extract a scalar from a Jira nested object or Greenhopper sprint string."""
    if isinstance(val, dict):
        extracted = _extract_jira_obj(val)
        return extracted if extracted is not None else val
    if isinstance(val, list):
        if not val:
            return None
        parts = []
        for item in val:
            if isinstance(item, str):
                m = SPRINT_RE.search(item)
                parts.append(m.group(1).strip() if m else item)
            elif isinstance(item, dict):
                extracted = _extract_jira_obj(item)
                parts.append(extracted if extracted is not None else str(item))
            else:
                parts.append(str(item))
        return ", ".join(parts)
    return val


# - Engine ---------------------------------------------------------------------

class AggregationEngine:
    """
    Stateless aggregation engine. A single instance can serve concurrent requests
    safely because all state is local to each aggregate() call.
    """

    def aggregate(self, request: AggregateRequest) -> AggregateResponse:
        if not request.issues:
            return AggregateResponse(
                chart_type=request.chart_spec.type,
                title=request.chart_spec.title or "No data",
                x_axis=[], series=[], pie_data=None, scatter_data=None,
                total_issues=0, fields_resolved={}, warnings=["No issues provided"],
            )

        df = self._build_dataframe(request.issues)
        full_df = df  # unfiltered — used for field_counts so the filter UI always shows all choices

        if request.react_to_filters and request.active_filters:
            df = self._apply_filters(full_df, request.active_filters, request.field_map)

        resolver = FieldResolver(request.issues, field_map=request.field_map)
        spec = request.chart_spec
        chart_type = _normalise_type(spec.type)
        title = spec.title or f"{chart_type.replace('_', ' ').title()} Chart"

        resolved_x, w_x = resolver.resolve(spec.x_field)
        resolved_x = _to_snake(resolved_x)  # bridge raw dict key → clean_names column

        resolved_y, w_y = (
            resolver.resolve(spec.y_field)
            if not _is_count_field(spec.y_field)
            else (spec.y_field, [])
        )
        if not _is_count_field(resolved_y):
            resolved_y = _to_snake(resolved_y)

        resolved_color, w_c = (
            resolver.resolve(spec.color_field) if spec.color_field else (None, [])
        )
        if resolved_color:
            resolved_color = _to_snake(resolved_color)

        all_warnings = w_x + w_y + w_c
        fields_resolved: dict[str, str] = {spec.x_field: resolved_x, spec.y_field: resolved_y}
        if spec.color_field and resolved_color:
            fields_resolved[spec.color_field] = resolved_color

        # Ensure resolved columns exist in df
        for col in (resolved_x, resolved_y if resolved_y != spec.y_field else None, resolved_color):
            if col and col not in df.columns:
                all_warnings.append(f"column '{col}' not found in DataFrame after flattening")

        # Route to appropriate aggregation method
        result: AggregateResponse
        if chart_type == "pie":
            result = self._agg_pie(df, spec, resolved_x, resolved_y, title)
        elif chart_type == "scatter":
            result = self._agg_scatter(df, spec, resolved_x, resolved_y, resolved_color, title)
        elif chart_type == "stacked_bar":
            stack_field = resolved_color or self._auto_detect_group(df, resolved_x)
            result = self._agg_stacked_bar(df, spec, resolved_x, stack_field, resolved_y, title)
        elif chart_type == "trend":
            result = self._agg_trend(df, spec, title)
        elif chart_type == "burndown":
            result = self._agg_burndown(df, spec, title)
        elif chart_type == "line":
            if resolved_x in df.columns and self._is_date_column(df, resolved_x):
                result = self._agg_line_date(df, spec, resolved_x, resolved_y, resolved_color, title)
            else:
                result = self._agg_line_categorical(df, spec, resolved_x, resolved_y, resolved_color, title)
        else:
            result = self._agg_bar(df, spec, resolved_x, resolved_y, title)

        result.warnings = all_warnings + result.warnings
        result.fields_resolved = fields_resolved
        result.total_issues = len(request.issues)
        result.field_counts = self._compute_field_counts(full_df, request.display_fields or [], request.field_map)
        result.filtered_count = len(df) if (request.react_to_filters and request.active_filters) else None
        return result

    # - DataFrame construction -------------------------------------------------

    def _build_dataframe(self, issues: list[dict[str, Any]]) -> pd.DataFrame:
        df = pd.DataFrame(issues)
        if df.empty:
            return df

        # Normalise all column names: lowercase, non-word chars → _, strip edge underscores
        df = df.clean_names(strip_underscores=True)

        # Flatten Jira nested objects and Greenhopper sprint strings
        for col in df.columns:
            sample = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
            if sample is None:
                continue
            if isinstance(sample, (dict, list)):
                df[col] = df[col].apply(_flatten_value)

        # Drop fully-null rows and columns produced by flattening
        df = df.remove_empty()

        # Date coercion — column names are already lowercase after clean_names
        for col in df.columns:
            if col in DATE_FIELDS:
                df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)
                continue
            sample = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
            if isinstance(sample, str) and DATE_ISO_RE.match(sample):
                df[col] = pd.to_datetime(df[col], errors="coerce", utc=True)

        return df

    # - Type helpers -----------------------------------------------------------

    def _is_date_column(self, df: pd.DataFrame, col: str) -> bool:
        if col not in df.columns:
            return False
        if pd.api.types.is_datetime64_any_dtype(df[col]):
            return True
        if col in DATE_FIELDS:  # already lowercase after clean_names
            return True
        sample = df[col].dropna().iloc[0] if not df[col].dropna().empty else None
        return isinstance(sample, str) and bool(DATE_ISO_RE.match(sample))

    def _auto_detect_group(self, df: pd.DataFrame, exclude_col: str) -> str | None:
        for col in df.columns:
            if col == exclude_col or col in {"key", "summary", "description"}:  # already lowercase
                continue
            n_unique = df[col].nunique()
            if 2 <= n_unique <= 8:
                return col
        return None

    def _apply_filters(
        self, df: pd.DataFrame, active_filters: dict[str, list[str]],
        field_map: dict[str, str] | None = None,
    ) -> pd.DataFrame:
        """Row-filter df to rows matching all active_filters (AND logic, OR within each field)."""
        if df.empty or not active_filters:
            return df
        mask = pd.Series(True, index=df.index)
        for display_field, values in active_filters.items():
            if not values:
                continue
            col = _to_snake(display_field)
            if col not in df.columns and field_map and display_field in field_map:
                col = _to_snake(field_map[display_field])
            if col not in df.columns:
                continue
            mask &= df[col].fillna("Empty").astype(str).isin(values)
        return df[mask]

    def _compute_field_counts(
        self, df: pd.DataFrame, display_fields: list[str], field_map: dict[str, str] | None = None
    ) -> dict[str, dict[str, int]]:
        """Return value-count histogram for each requested display field."""
        result: dict[str, dict[str, int]] = {}
        for field in display_fields:
            col = _to_snake(field)
            if col not in df.columns:
                # Try the raw field name after clean_names normalisation
                col = field
            if col not in df.columns and field_map and field in field_map:
                # field_map maps display name → raw Jira key; clean_names converts it to snake
                col = _to_snake(field_map[field])
            if col not in df.columns:
                continue
            counts: dict[str, int] = {
                k: int(v)
                for k, v in df[col].fillna("Empty").astype(str)
                .value_counts().items()
            }
            result[field] = counts
        return result

    def _detect_point_field(self, df: pd.DataFrame) -> str | None:
        for f in POINT_FIELDS:
            if f in df.columns:
                numeric = pd.to_numeric(df[f], errors="coerce")
                if numeric.sum() > 0:
                    return f
        return None

    # - Aggregation methods ----------------------------------------------------

    def _agg_bar(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        resolved_x: str,
        resolved_y: str,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        if resolved_x not in df.columns:
            return AggregateResponse(
                chart_type="bar", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=[f"column '{resolved_x}' not found"],
            )

        clean = df[resolved_x].fillna("—").astype(str)

        if _is_count_field(resolved_y):
            grouped = clean.value_counts().head(spec.max_categories)
            series_name = "Count"
        else:
            if resolved_y not in df.columns:
                warnings.append(f"y column '{resolved_y}' not found — falling back to count")
                grouped = clean.value_counts().head(spec.max_categories)
                series_name = "Count"
            else:
                numeric_y = pd.to_numeric(df[resolved_y], errors="coerce").fillna(0)
                grouped = (
                    pd.concat([clean.rename("x"), numeric_y.rename("y")], axis=1)
                    .groupby("x")["y"]
                    .sum()
                    .sort_values(ascending=False)
                    .head(spec.max_categories)
                )
                series_name = resolved_y

        if grouped.empty:
            warnings.append(f"no data after grouping by '{resolved_x}'")

        if grouped.nunique() == 1:
            warnings.append(f"x_field '{resolved_x}' has only one distinct value")

        x_axis = [str(k) for k in grouped.index]
        data   = [float(v) for v in grouped.values]

        return AggregateResponse(
            chart_type="bar", title=title, x_axis=x_axis,
            series=[SeriesData(name=series_name, data=data, chart_type="bar")],
            pie_data=None, scatter_data=None, total_issues=0,
            fields_resolved={}, warnings=warnings,
        )

    def _agg_pie(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        resolved_x: str,
        resolved_y: str,
        title: str,
    ) -> AggregateResponse:
        bar = self._agg_bar(df, spec, resolved_x, resolved_y, title)
        pie_data = [PiePoint(name=k, value=v) for k, v in zip(bar.x_axis, bar.series[0].data if bar.series else [])]
        return AggregateResponse(
            chart_type="pie", title=title, x_axis=[],
            series=[], pie_data=pie_data, scatter_data=None,
            total_issues=0, fields_resolved={}, warnings=bar.warnings,
        )

    def _agg_line_categorical(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        resolved_x: str,
        resolved_y: str,
        resolved_color: str | None,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        if resolved_x not in df.columns:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=[f"column '{resolved_x}' not found"],
            )

        clean_x = df[resolved_x].fillna("—").astype(str)
        x_cats = (
            clean_x.value_counts()
            .head(spec.max_categories)
            .index.tolist()
        )

        y_is_count = _is_count_field(resolved_y)

        if resolved_color and resolved_color in df.columns:
            clean_c = df[resolved_color].fillna("—").astype(str)
            temp = pd.concat([clean_x.rename("x"), clean_c.rename("c")], axis=1)
            if not y_is_count and resolved_y in df.columns:
                numeric_y = pd.to_numeric(df[resolved_y], errors="coerce").fillna(0)
                temp["y"] = numeric_y
                pivot = temp.groupby(["c", "x"])["y"].sum().unstack("x", fill_value=0)
            else:
                pivot = temp.groupby(["c", "x"]).size().unstack("x", fill_value=0)

            groups = pivot.index.tolist()[: spec.max_series]
            series = [
                SeriesData(
                    name=str(g),
                    data=[float(pivot.loc[g, c]) if c in pivot.columns else 0.0 for c in x_cats],
                    chart_type="line",
                )
                for g in groups
            ]
        else:
            if y_is_count:
                counts = clean_x.value_counts()
                data = [float(counts.get(c, 0)) for c in x_cats]
            else:
                if resolved_y not in df.columns:
                    warnings.append(f"y column '{resolved_y}' not found — using count")
                    counts = clean_x.value_counts()
                    data = [float(counts.get(c, 0)) for c in x_cats]
                else:
                    numeric_y = pd.to_numeric(df[resolved_y], errors="coerce").fillna(0)
                    sums = pd.concat([clean_x.rename("x"), numeric_y.rename("y")], axis=1).groupby("x")["y"].sum()
                    data = [float(sums.get(c, 0)) for c in x_cats]
            series = [SeriesData(name="Count" if y_is_count else resolved_y, data=data, chart_type="line")]

        return AggregateResponse(
            chart_type="line", title=title, x_axis=[str(c) for c in x_cats],
            series=series, pie_data=None, scatter_data=None,
            total_issues=0, fields_resolved={}, warnings=warnings,
        )

    def _agg_line_date(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        resolved_x: str,
        resolved_y: str,
        resolved_color: str | None,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        date_col = pd.to_datetime(df[resolved_x], errors="coerce", utc=True)
        valid = date_col.dropna()
        if valid.empty:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=[f"no valid dates in '{resolved_x}'"],
            )

        date_range_days = int((valid.max() - valid.min()).days)
        bucket = _auto_bucket(date_range_days)
        freq   = _BUCKET_FREQ[bucket]

        temp = df.copy()
        temp["_date"] = date_col
        temp = temp.dropna(subset=["_date"])
        temp["_bucket"] = temp["_date"].dt.to_period(freq).dt.start_time.dt.tz_localize("UTC")

        spine = pd.date_range(temp["_bucket"].min(), temp["_bucket"].max(), freq=freq, tz="UTC")
        x_axis = [_fmt_bucket_label(pd.Timestamp(ts), bucket) for ts in spine]

        y_is_count = _is_count_field(resolved_y)

        if resolved_color and resolved_color in df.columns:
            clean_c = temp[resolved_color].fillna("—").astype(str)
            temp["_group"] = clean_c
            groups = clean_c.value_counts().head(spec.max_series).index.tolist()
            series = []
            for grp in groups:
                sub = temp[temp["_group"] == grp]
                if y_is_count:
                    counts = sub.groupby("_bucket").size().reindex(spine, fill_value=0)
                else:
                    numeric_y = pd.to_numeric(sub[resolved_y], errors="coerce").fillna(0)
                    counts = sub.assign(_y=numeric_y).groupby("_bucket")["_y"].sum().reindex(spine, fill_value=0)
                series.append(SeriesData(name=str(grp), data=[float(v) for v in counts.values], chart_type="line"))
        else:
            if y_is_count:
                counts = temp.groupby("_bucket").size().reindex(spine, fill_value=0)
            else:
                if resolved_y not in df.columns:
                    warnings.append(f"y column '{resolved_y}' not found — using count")
                    counts = temp.groupby("_bucket").size().reindex(spine, fill_value=0)
                else:
                    numeric_y = pd.to_numeric(temp[resolved_y], errors="coerce").fillna(0)
                    counts = temp.assign(_y=numeric_y).groupby("_bucket")["_y"].sum().reindex(spine, fill_value=0)
            series = [SeriesData(name="Count" if y_is_count else resolved_y, data=[float(v) for v in counts.values], chart_type="line")]

        return AggregateResponse(
            chart_type="line", title=title, x_axis=x_axis,
            series=series, pie_data=None, scatter_data=None,
            total_issues=0, fields_resolved={}, warnings=warnings,
        )

    def _agg_stacked_bar(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        resolved_x: str,
        stack_field: str | None,
        resolved_y: str,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        if stack_field is None:
            warnings.append("no stack field found — falling back to bar chart")
            return self._agg_bar(df, spec, resolved_x, resolved_y, title)

        if resolved_x not in df.columns or stack_field not in df.columns:
            missing = [c for c in (resolved_x, stack_field) if c not in df.columns]
            return AggregateResponse(
                chart_type="stacked_bar", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=[f"columns not found: {missing}"],
            )

        clean_x = df[resolved_x].fillna("—").astype(str)
        clean_s = df[stack_field].fillna("—").astype(str)
        y_is_count = _is_count_field(resolved_y)

        if y_is_count:
            pivot = (
                pd.concat([clean_x.rename("x"), clean_s.rename("s")], axis=1)
                .groupby(["x", "s"])
                .size()
                .unstack("s", fill_value=0)
            )
        else:
            if resolved_y not in df.columns:
                warnings.append(f"y column '{resolved_y}' not found — using count")
                pivot = (
                    pd.concat([clean_x.rename("x"), clean_s.rename("s")], axis=1)
                    .groupby(["x", "s"])
                    .size()
                    .unstack("s", fill_value=0)
                )
            else:
                numeric_y = pd.to_numeric(df[resolved_y], errors="coerce").fillna(0)
                pivot = (
                    pd.concat([clean_x.rename("x"), clean_s.rename("s"), numeric_y.rename("y")], axis=1)
                    .groupby(["x", "s"])["y"]
                    .sum()
                    .unstack("s", fill_value=0)
                )

        # Cap rows and columns
        x_order = (
            clean_x.value_counts()
            .head(spec.max_categories)
            .index.tolist()
        )
        pivot = pivot.reindex([x for x in x_order if x in pivot.index])
        stack_cols = pivot.columns.tolist()[: spec.max_series]

        x_axis = [str(i) for i in pivot.index]
        series = [
            SeriesData(
                name=str(col),
                data=[float(pivot.loc[row, col]) if row in pivot.index else 0.0 for row in x_axis],
                chart_type="bar",
                stack="total",
            )
            for col in stack_cols
        ]

        return AggregateResponse(
            chart_type="stacked_bar", title=title, x_axis=x_axis,
            series=series, pie_data=None, scatter_data=None,
            total_issues=0, fields_resolved={}, warnings=warnings,
        )

    def _agg_scatter(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        resolved_x: str,
        resolved_y: str,
        resolved_color: str | None,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        if resolved_x not in df.columns or resolved_y not in df.columns:
            missing = [c for c in (resolved_x, resolved_y) if c not in df.columns]
            warnings.append(f"columns not found for scatter: {missing} — falling back to bar")
            return self._agg_bar(df, spec, resolved_x, resolved_y, title)

        x_num = pd.to_numeric(df[resolved_x], errors="coerce")
        y_num = pd.to_numeric(df[resolved_y], errors="coerce")

        valid_mask = x_num.notna() & y_num.notna()
        if valid_mask.sum() == 0:
            warnings.append(f"no numeric values found for '{resolved_x}'/'{resolved_y}' — falling back to bar")
            return self._agg_bar(df, spec, resolved_x, resolved_y, title)

        valid_df = df[valid_mask].copy()
        valid_df["_x"] = x_num[valid_mask]
        valid_df["_y"] = y_num[valid_mask]

        scatter_data = [
            ScatterPoint(
                name=str(row.get("key", f"row-{i}")),
                x=float(row["_x"]),
                y=float(row["_y"]),
                group=str(row.get(resolved_color, "")) if resolved_color and resolved_color in valid_df.columns else "",
            )
            for i, row in valid_df.iterrows()
        ]

        return AggregateResponse(
            chart_type="scatter", title=title, x_axis=[],
            series=[], pie_data=None, scatter_data=scatter_data,
            total_issues=0, fields_resolved={}, warnings=warnings,
        )

    def _agg_trend(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        # Column names are already lowercase after clean_names — no .lower() needed
        created_col = next((c for c in df.columns if c == "created"), None)
        if created_col is None:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=["no 'created' field found for trend chart"],
            )

        created_dates = pd.to_datetime(df[created_col], errors="coerce", utc=True).dropna()
        if created_dates.empty:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=["no valid created dates for trend chart"],
            )

        date_range_days = int((created_dates.max() - created_dates.min()).days)
        bucket = _auto_bucket(date_range_days)
        freq   = _BUCKET_FREQ[bucket]

        temp = df.copy()
        temp["_created"] = pd.to_datetime(df[created_col], errors="coerce", utc=True)
        temp = temp.dropna(subset=["_created"])
        temp["_bucket"] = temp["_created"].dt.to_period(freq).dt.start_time.dt.tz_localize("UTC")

        spine = pd.date_range(temp["_bucket"].min(), temp["_bucket"].max(), freq=freq, tz="UTC")
        x_axis = [_fmt_bucket_label(pd.Timestamp(ts), bucket) for ts in spine]

        created_counts = temp.groupby("_bucket").size().reindex(spine, fill_value=0)

        # Resolved series (optional)
        resolved_col = next((c for c in df.columns if c == "resolutiondate"), None)
        has_resolved = False
        resolved_counts = pd.Series(0, index=spine)
        if resolved_col:
            temp["_resolved"] = pd.to_datetime(df[resolved_col], errors="coerce", utc=True)
            res_valid = temp.dropna(subset=["_resolved"])
            if not res_valid.empty:
                res_valid = res_valid.copy()
                res_valid["_res_bucket"] = res_valid["_resolved"].dt.to_period(freq).dt.start_time.dt.tz_localize("UTC")
                resolved_counts = res_valid.groupby("_res_bucket").size().reindex(spine, fill_value=0)
                has_resolved = True

        # Cumulative open = cumsum(created) - cumsum(resolved)
        cum_created  = created_counts.cumsum()
        cum_resolved = resolved_counts.cumsum()
        open_counts  = (cum_created - cum_resolved).clip(lower=0)

        series = [
            SeriesData(name="Open (cumulative)", data=[float(v) for v in open_counts.values], chart_type="line"),
            SeriesData(name="Created",           data=[float(v) for v in created_counts.values], chart_type="bar"),
        ]
        if has_resolved:
            series.append(SeriesData(name="Resolved", data=[float(v) for v in resolved_counts.values], chart_type="bar"))

        return AggregateResponse(
            chart_type="line", title=title, x_axis=x_axis,
            series=series, pie_data=None, scatter_data=None,
            total_issues=0, fields_resolved={}, warnings=warnings,
        )

    def _agg_burndown(
        self,
        df: pd.DataFrame,
        spec: ChartSpecInput,
        title: str,
    ) -> AggregateResponse:
        warnings: list[str] = []

        pt_field = self._detect_point_field(df)
        if pt_field is None:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=["no story point field found — burndown not available"],
            )

        pts = pd.to_numeric(df[pt_field], errors="coerce").fillna(0)
        total_pts = float(pts.sum())
        if total_pts == 0:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=["all story points are zero — burndown not available"],
            )

        # Column names are already lowercase after clean_names — no .lower() needed
        created_col = next((c for c in df.columns if c == "created"), None)
        if created_col is None:
            return AggregateResponse(
                chart_type="line", title=title, x_axis=[], series=[],
                pie_data=None, scatter_data=None, total_issues=0,
                fields_resolved={}, warnings=["no 'created' field for burndown sprint start"],
            )

        created_dates = pd.to_datetime(df[created_col], errors="coerce", utc=True).dropna()
        sprint_start  = created_dates.min().normalize()

        due_col = next((c for c in df.columns if c == "duedate"), None)
        if due_col:
            due_dates = pd.to_datetime(df[due_col], errors="coerce", utc=True).dropna()
            sprint_end = due_dates.max().normalize() if not due_dates.empty else sprint_start + pd.Timedelta(days=14)
        else:
            sprint_end = sprint_start + pd.Timedelta(days=14)

        spine = pd.date_range(sprint_start, sprint_end, freq="D", tz="UTC")
        x_axis = [_fmt_bucket_label(pd.Timestamp(ts), "day") for ts in spine]
        n = len(spine)

        # Ideal: linear from total_pts to 0
        ideal = [round(total_pts * (1 - i / max(n - 1, 1)), 1) for i in range(n)]

        # Actual: remaining points per day (None for future days)
        today = pd.Timestamp.now(tz="UTC").normalize()
        res_col = next((c for c in df.columns if c == "resolutiondate"), None)
        actual: list[float | None] = []

        if res_col:
            res_dates = pd.to_datetime(df[res_col], errors="coerce", utc=True)
            for day in spine:
                if day > today:
                    actual.append(None)
                else:
                    burned = float(pts[res_dates.notna() & (res_dates <= day)].sum())
                    actual.append(round(total_pts - burned, 1))
        else:
            warnings.append("no 'resolutiondate' field — actual burndown line not available")
            actual = [None] * n

        # Projected: linear regression from known actual points via numpy
        known = [(i, v) for i, v in enumerate(actual) if v is not None]
        projected: list[float | None] = [None] * n
        if len(known) >= 2:
            xs = [p[0] for p in known]
            ys = [p[1] for p in known]
            slope, intercept = np.polyfit(xs, ys, 1)
            last_known_i = known[-1][0]
            for i in range(last_known_i, n):
                projected[i] = round(max(0.0, slope * i + intercept), 1)

        series = [
            SeriesData(name="Ideal",     data=[float(v) for v in ideal],  chart_type="line"),
            SeriesData(name="Actual",    data=actual,                      chart_type="line"),
            SeriesData(name="Projected", data=projected,                   chart_type="line"),
        ]

        return AggregateResponse(
            chart_type="line",
            title=title or f"Burndown - {total_pts:.0f} pts",
            x_axis=x_axis, series=series,
            pie_data=None, scatter_data=None,
            total_issues=0, fields_resolved={}, warnings=warnings,
        )
