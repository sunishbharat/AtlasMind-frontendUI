"""
aggregator/field_resolver.py
Resolves display-name field hints to actual keys present in Jira issue dicts.
Handles case variants, snake_case, known aliases, nested Jira objects, and
fuzzy substring scoring as a last resort.
"""

from __future__ import annotations

import re
from functools import cached_property
from typing import Any


KNOWN_ALIASES: dict[str, str] = {
    "type":             "issuetype",
    "issue_type":       "issuetype",
    "resolved":         "resolutiondate",
    "resolution_date":  "resolutiondate",
    "resolution":       "resolutiondate",
    "due_date":         "duedate",
    "due":              "duedate",
    "effort":           "effort_days",
    "level_of_effort":  "effort_days",
    "points":           "story_points",
    "sp":               "story_points",
    "story points":     "story_points",
    "story_pts":        "story_points",
    "assignee_name":    "assignee",
    "reporter_name":    "reporter",
    "fix_version":      "fixversions",
    "fix version":      "fixversions",
    "components":       "components",
    "epic":             "epic_link",
    "epic_name":        "epic_link",
    "sprint":           "sprint",
    "label":            "labels",
}

# Sub-keys to extract from Jira nested objects, in priority order
_JIRA_OBJECT_KEYS = ("displayName", "name", "value", "id", "key")


def _to_snake(s: str) -> str:
    """Normalise to snake_case — same algorithm as pyjanitor.clean_names()."""
    s = re.sub(r"[^\w\s]", "_", s.strip().lower())  # non-word, non-space chars → _
    s = re.sub(r"[\s_]+", "_", s)                    # spaces + underscores → single _
    return s.strip("_")


def _extract_jira_obj(val: Any) -> str | None:
    """Return a string from a Jira nested dict, or None if val is not a dict."""
    if not isinstance(val, dict):
        return None
    for sub in _JIRA_OBJECT_KEYS:
        if sub in val and val[sub] is not None:
            return str(val[sub])
    return None


class FieldResolver:
    """
    Resolves field name hints against a sample of Jira issue dicts.

    Usage:
        resolver = FieldResolver(issues)
        key, warnings = resolver.resolve("Assignee")
        # key -> "assignee", warnings -> []

    Optionally accepts field_map (display name → raw Jira key) from the server response
    so that custom fields like "Domain" → "customfield_1xxxx" resolve correctly.
    """

    def __init__(self, issues: list[dict[str, Any]], field_map: dict[str, str] | None = None) -> None:
        self._issues = issues
        self._field_map: dict[str, str] = field_map or {}
        self._cache: dict[str, tuple[str, list[str]]] = {}

    @cached_property
    def _all_keys(self) -> set[str]:
        keys: set[str] = set()
        for issue in self._issues[:50]:  # sample first 50 for speed
            keys.update(issue.keys())
        return keys

    @cached_property
    def _keys_lower(self) -> dict[str, str]:
        """Mapping of key.lower() -> original key."""
        return {k.lower(): k for k in self._all_keys}

    def resolve(self, hint: str) -> tuple[str, list[str]]:
        """
        Return (resolved_key, warnings).
        Result is cached - identical hints always return the same result.
        """
        if hint in self._cache:
            return self._cache[hint]
        result = self._resolve(hint)
        self._cache[hint] = result
        return result

    def _resolve(self, hint: str) -> tuple[str, list[str]]:
        warnings: list[str] = []

        # Step 0 - server-provided field_map (display name → raw Jira key)
        if hint in self._field_map:
            raw = self._field_map[hint]
            if raw in self._all_keys:
                return raw, warnings
            warnings.append(f"field_map maps '{hint}' → '{raw}' but key not found in issues")

        # Step 1 - exact match
        if hint in self._all_keys:
            return hint, warnings

        hint_lower = hint.lower().strip()

        # Step 2 - case-insensitive match
        if hint_lower in self._keys_lower:
            resolved = self._keys_lower[hint_lower]
            warnings.append(f"field '{hint}' matched case-insensitively to '{resolved}'")
            return resolved, warnings

        # Step 3 - snake_case conversion
        snake = _to_snake(hint)
        if snake in self._all_keys:
            warnings.append(f"field '{hint}' resolved via snake_case to '{snake}'")
            return snake, warnings
        if snake in self._keys_lower:
            resolved = self._keys_lower[snake]
            warnings.append(f"field '{hint}' resolved via snake_case to '{resolved}'")
            return resolved, warnings

        # Step 4 - known alias map
        for lookup in (hint_lower, snake):
            if lookup in KNOWN_ALIASES:
                alias = KNOWN_ALIASES[lookup]
                if alias in self._all_keys:
                    warnings.append(f"field '{hint}' resolved via alias to '{alias}'")
                    return alias, warnings
                alias_lower = alias.lower()
                if alias_lower in self._keys_lower:
                    resolved = self._keys_lower[alias_lower]
                    warnings.append(f"field '{hint}' resolved via alias to '{resolved}'")
                    return resolved, warnings

        # Step 5 - Jira nested object detection
        # Find a key whose values are dicts containing displayName/name/value
        hint_words = set(hint_lower.split())
        for key in self._all_keys:
            key_words = set(key.lower().split("_"))
            if hint_words & key_words:
                sample = self._sample_value(key)
                if _extract_jira_obj(sample) is not None:
                    warnings.append(
                        f"field '{hint}' resolved to nested Jira object at '{key}'"
                    )
                    return key, warnings

        # Step 6 - scan-and-score (substring word overlap)
        best_key, best_score = self._fuzzy_match(hint_lower, snake)
        if best_score > 0:
            warnings.append(
                f"field '{hint}' not found — using best fuzzy match '{best_key}' "
                f"(score {best_score})"
            )
            return best_key, warnings

        # Step 7 - give up, return hint unchanged
        warnings.append(
            f"WARNING: field '{hint}' could not be resolved — chart data may be empty"
        )
        return hint, warnings

    def _sample_value(self, key: str) -> Any:
        """Return the first non-None value for key across the issue sample."""
        for issue in self._issues[:20]:
            v = issue.get(key)
            if v is not None:
                return v
        return None

    def _fuzzy_match(self, hint_lower: str, snake: str) -> tuple[str, int]:
        hint_words = set(hint_lower.split()) | set(snake.split("_"))
        best_key = ""
        best_score = 0
        for key in self._all_keys:
            key_words = set(key.lower().split("_"))
            score = len(hint_words & key_words)
            if score > best_score:
                best_score = score
                best_key = key
        return best_key, best_score
