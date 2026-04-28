# auth.py
# PAT-based auth helper for the FastAPI bridge.
# To remove auth: delete this file and remove the import + call in main.py.

import os

# Fallbacks for local/Docker deployments where credentials are set via env vars.
# In cloud deployments the per-request values from the UI take precedence.
_ENV_PAT = os.environ.get("JIRA_PAT", "")
_ENV_URL = os.environ.get("JIRA_URL", "")


def jira_headers(
    request_pat: str | None = None,
    request_url: str | None = None,
) -> dict[str, str]:
    """Return headers to forward to AtlasMind for Jira authentication.

    Priority for each field: per-request value from UI > env var > omitted.
    """
    headers: dict[str, str] = {}
    effective_pat = request_pat or _ENV_PAT
    effective_url = request_url or _ENV_URL
    if effective_pat:
        headers["X-Jira-Token"] = effective_pat
    if effective_url:
        headers["X-Jira-Url"] = effective_url
    return headers


def startup_log() -> str:
    pat_status = "set" if _ENV_PAT else "not set (expecting per-request token from UI)"
    url_status = _ENV_URL if _ENV_URL else "not set (expecting per-request URL from UI)"
    return f"PAT={pat_status}  URL={url_status}"
