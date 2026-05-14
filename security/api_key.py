"""API key authentication using FastAPI's built-in APIKeyHeader.

Reads API_KEY from core.config.settings — zero hardcoded values.
When API_KEY is empty the dependency is a no-op (safe for local dev).
"""
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from core.config import settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(key: str | None = Security(_api_key_header)) -> None:
    if not settings.api_key:
        return  # auth disabled — API_KEY not configured
    if key != settings.api_key:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
