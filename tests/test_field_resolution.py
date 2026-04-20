"""
tests/test_field_resolution.py
Tests for custom field key renaming (_apply_field_map) and FieldResolver resolution.
"""

import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from aggregator.field_map import apply_field_map as _apply_field_map
from aggregator.field_resolver import FieldResolver

# - _apply_field_map -----------------------------------------------------------

FIELD_MAP = {"Domain": "customfield_1234", "Team": "customfield_5678"}


def test_renames_custom_keys():
    issues = [{"key": "AP-1", "summary": "Fix bug", "customfield_1234": "Backend", "customfield_5678": "NY team"}]
    result = _apply_field_map(issues, FIELD_MAP)
    assert result[0]["Domain"] == "Backend"
    assert result[0]["Team"] == "NY team"
    assert "customfield_1234" not in result[0]
    assert "customfield_5678" not in result[0]


def test_standard_keys_unchanged():
    issues = [{"key": "AP-1", "status": "Open", "customfield_1234": "Backend"}]
    result = _apply_field_map(issues, FIELD_MAP)
    assert result[0]["key"] == "AP-1"
    assert result[0]["status"] == "Open"


def test_empty_field_map_returns_issues_unchanged():
    issues = [{"key": "AP-1", "customfield_1234": "Backend"}]
    assert _apply_field_map(issues, {}) == issues


def test_empty_issues_returns_empty():
    assert _apply_field_map([], FIELD_MAP) == []


def test_multiple_issues():
    issues = [
        {"key": "AP-1", "customfield_1234": "Backend"},
        {"key": "AP-2", "customfield_1234": "Frontend"},
    ]
    result = _apply_field_map(issues, FIELD_MAP)
    assert result[0]["Domain"] == "Backend"
    assert result[1]["Domain"] == "Frontend"


# - FieldResolver --------------------------------------------------------------

ISSUES = [
    {"key": "AP-1", "Domain": "Backend",  "status": "Open",   "assignee": "Alice"},
    {"key": "AP-2", "Domain": "Frontend", "status": "Closed", "assignee": "Bob"},
]


def test_exact_match():
    r = FieldResolver(ISSUES)
    key, warns = r.resolve("status")
    assert key == "status"
    assert warns == []


def test_case_insensitive():
    r = FieldResolver(ISSUES)
    key, warns = r.resolve("Status")
    assert key == "status"


def test_field_map_resolves_display_name():
    field_map = {"Domain": "customfield_1234"}
    raw_issues = [{"key": "AP-1", "customfield_1234": "Backend"}]
    r = FieldResolver(raw_issues, field_map=field_map)
    key, warns = r.resolve("Domain")
    assert key == "customfield_1234"
    assert warns == []


def test_field_map_takes_priority_over_fuzzy():
    field_map = {"Domain": "customfield_1234"}
    raw_issues = [{"key": "AP-1", "customfield_1234": "Backend", "domain_notes": "extra"}]
    r = FieldResolver(raw_issues, field_map=field_map)
    key, _ = r.resolve("Domain")
    assert key == "customfield_1234"


def test_unknown_field_returns_hint_with_warning():
    r = FieldResolver(ISSUES)
    key, warns = r.resolve("nonexistent_xyz")
    assert key == "nonexistent_xyz"
    assert any("WARNING" in w or "could not be resolved" in w for w in warns)
