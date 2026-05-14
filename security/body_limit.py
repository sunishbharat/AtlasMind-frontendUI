from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

_TOO_LARGE = Response(
    content=b'{"error":"Request body too large"}',
    status_code=413,
    media_type="application/json",
)


class BodySizeLimitMiddleware:
    """Pure ASGI middleware - enforces a hard cap on incoming request body size.

    Two-path enforcement:
    - Content-Length header present: reject immediately, no body read.
    - Chunked / no Content-Length: pre-buffer chunk-by-chunk; reject as soon as
      the running total exceeds max_bytes, before the route handler ever runs.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.lower(): v for k, v in scope.get("headers", [])}

        # Fast path - Content-Length present
        cl = headers.get(b"content-length")
        if cl is not None:
            try:
                if int(cl) > self.max_bytes:
                    await _TOO_LARGE(scope, receive, send)
                    return
            except ValueError:
                pass
            await self.app(scope, receive, send)
            return

        # Slow path - chunked / unknown length: pre-buffer with limit
        chunks: list[bytes] = []
        total = 0

        while True:
            message = await receive()
            if message["type"] != "http.request":
                # Non-body message (disconnect etc.) - pass through unchanged
                await self.app(scope, _replay(message, receive), send)
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_bytes:
                await _TOO_LARGE(scope, receive, send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        await self.app(scope, _replay_body(b"".join(chunks), receive), send)


def _replay(first_message: dict, receive: Receive) -> Receive:
    """Return a receive callable that yields first_message once then delegates."""
    sent = False

    async def _inner() -> dict:
        nonlocal sent
        if not sent:
            sent = True
            return first_message
        return await receive()

    return _inner


def _replay_body(body: bytes, receive: Receive) -> Receive:
    """Return a receive callable that yields the pre-buffered body then delegates."""
    sent = False

    async def _inner() -> dict:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return _inner
