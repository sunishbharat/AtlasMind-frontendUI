from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from core.config import settings
from security.body_limit import BodySizeLimitMiddleware
from security.headers import SecurityHeadersMiddleware
from security.rate_limit import (
    RateLimitExceeded,
    SlowAPIMiddleware,
    _rate_limit_exceeded_handler,
    limiter,
)

__all__ = ["setup_security"]


def setup_security(app: FastAPI) -> None:
    """Register all security middleware. All config comes from core.config.settings.

    Starlette applies middleware in reverse registration order — the last
    add_middleware call wraps everything and executes first at request time.

    Execution order at request time (outermost → innermost):
      BodySizeLimitMiddleware     - rejects oversized bodies before any parsing
      SecurityHeadersMiddleware   - adds security response headers
      ProxyHeadersMiddleware      - resolves real client IP from X-Forwarded-For
      SlowAPIMiddleware            - per-IP / per-PAT rate limiting
      CORSMiddleware              - origin allowlist
    """
    # slowapi
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    # Real IP resolution — must run before rate limiter reads request.client.host
    app.add_middleware(
        ProxyHeadersMiddleware,
        trusted_hosts=settings.trusted_proxy_ips,
    )

    # Security response headers
    app.add_middleware(SecurityHeadersMiddleware)

    # Body size cap — outermost layer, rejects before anything else reads the body
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_size_bytes)
