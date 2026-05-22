"""Path allowlist — default-deny routing guard.

Only paths the application explicitly serves are let through.
Everything else (credential scans, path traversal, WordPress probes,
MCP enumeration, actuator scans, etc.) receives a bare 404 before
any other middleware or route handler runs.

This is strictly more secure than a blocklist: unknown paths are denied
by default, so new attack vectors are automatically covered.
"""
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

_404 = Response(status_code=404)

# Exact paths that are always reachable
_EXACT: frozenset[str] = frozenset({
    "/",
    "/demo",
    "/live",
    "/favicon.svg",
    "/favicon.ico",
    "/api/health",
    "/api/health/debug",
    "/api/query",
    "/api/event",
    "/api/aggregate",
    "/api/meta",
})

# Path prefixes that are always reachable (SPA client-side routes + static assets)
_PREFIXES: tuple[str, ...] = (
    "/demo/",
    "/live/",
    "/assets/",
)

# Only reachable when DEBUG=True
_DEBUG_EXACT: frozenset[str] = frozenset({
    "/docs",
    "/redoc",
    "/openapi.json",
})


class PathAllowlistMiddleware:
    """Pure ASGI middleware - default-deny path guard.

    Rejects any request whose path is not in the known-good set with a
    plain 404, before body parsing, rate limiting, or auth runs.
    """

    def __init__(self, app: ASGIApp, debug: bool = False) -> None:
        self.app = app
        self._debug_paths = _DEBUG_EXACT if debug else frozenset()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "/")
        if (
            path in _EXACT
            or path in self._debug_paths
            or path.startswith(_PREFIXES)
        ):
            await self.app(scope, receive, send)
            return

        await _404(scope, receive, send)
