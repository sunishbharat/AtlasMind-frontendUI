"""Rate limiting via slowapi.

Key function is PAT-first:
- If the request carries an X-Jira-Token header, the first 16 chars are used as
  the bucket key. This means each user gets their own budget even when 50 people
  share a corporate NAT (single external IP).
- Falls back to request.client.host when no token is present. IP is already
  resolved by ProxyHeadersMiddleware (registered in setup_security), so
  request.client.host is always the real client IP, not the proxy IP.

Storage URI defaults to in-memory. Set RATE_LIMIT_STORAGE_URI=redis://... for
cross-worker state when running multiple uvicorn workers.
"""
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.requests import Request

from core.config import settings

__all__ = [
    "limiter",
    "RateLimitExceeded",
    "_rate_limit_exceeded_handler",
    "SlowAPIMiddleware",
]


def _key_func(request: Request) -> str:
    """PAT-first bucketing — handles corporate NAT transparently."""
    token = request.headers.get("X-Jira-Token", "")
    if token:
        return f"pat:{token[:16]}"
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=_key_func,
    default_limits=[settings.rate_limit_default],
    storage_uri=settings.rate_limit_storage_uri,
)
