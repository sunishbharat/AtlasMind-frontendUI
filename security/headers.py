from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Caddy owns HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
        # Content-Security-Policy, and Cross-Origin-Resource-Policy in production.
        # X-Robots-Tag is not set by Caddy — keep it here for all environments.
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
        return response
