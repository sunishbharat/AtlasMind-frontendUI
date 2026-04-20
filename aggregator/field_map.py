"""
aggregator/field_map.py
Utilities for renaming raw Jira customfield keys to their display names.
"""

from __future__ import annotations


def apply_field_map(issues: list[dict], field_map: dict[str, str]) -> list[dict]:
    """Rename raw Jira keys (customfield_1xxxx) → display names so that
    every display_fields entry is the exact key in the issue dict."""
    if not field_map or not issues:
        return issues
    raw_to_display = {v: k for k, v in field_map.items()}
    return [{raw_to_display.get(k, k): v for k, v in issue.items()} for issue in issues]
