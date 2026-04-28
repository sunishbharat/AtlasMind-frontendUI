"""
AtlasMind Frontend API server.

Bridges the Svelte UI to the AtlasMind FastAPI backend.
Each /api/query POST translates to a GET request against the AtlasMind server:

  This server (port 8001):
    uv run main.py                        # defaults to localhost:8000
    uv run main.py --local                # explicitly use localhost:8000
    uv run main.py --external <public_ip> # use remote AtlasMind at given IP (port 8000)

  Environment variables (take precedence over CLI flags):
    ATLASMIND_URL   - full URL of the AtlasMind backend (e.g. http://10.0.0.5:8000)
    ALLOWED_ORIGINS - comma-separated list of allowed CORS origins
                      (e.g. https://yourdomain.com,https://www.yourdomain.com)
    HOST            - bind address (default: 127.0.0.1; set to 0.0.0.0 in containers)
    PORT            - port to listen on (default: 8001)

Served endpoints:
  http://localhost:8001/demo        <- app in Demo mode (no AtlasMind needed)
  http://localhost:8001/live        <- app in Live mode (queries forwarded to AtlasMind)
  http://localhost:8001/api/health  <- health check
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure the directory containing main.py is on sys.path so that
# `config` is importable regardless of working directory or container setup.
sys.path.insert(0, str(Path(__file__).parent))

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from aggregator.field_map import apply_field_map as _apply_field_map
from auth import jira_headers as _jira_headers, startup_log as _auth_startup_log
from config.defaults import (
    ATLASMIND_BACKEND_HOST,
    ATLASMIND_BACKEND_PORT,
    FRONTEND_HOST as _DEFAULT_HOST,
    FRONTEND_PORT  as _DEFAULT_PORT,
    VITE_DEV_HOST,
    VITE_DEV_PORT,
)

# ── Config ─────────────────────────────────────────────────────────────────────
def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AtlasMind Frontend API server")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--local", action="store_true", help=f"Connect to AtlasMind on {ATLASMIND_BACKEND_HOST}:{ATLASMIND_BACKEND_PORT} (default)")
    group.add_argument("--external", metavar="IP", help=f"Connect to AtlasMind at the given IP address (port {ATLASMIND_BACKEND_PORT})")
    parser.add_argument("--no-aggregation", action="store_true", help="Disable the pandas aggregation pipeline (default: enabled)")
    return parser.parse_args()

_args = _parse_args()

# ATLASMIND_URL env var takes precedence; CLI flags are the fallback for local dev
if os.environ.get("ATLASMIND_URL"):
    ATLASMIND_URL = os.environ["ATLASMIND_URL"]
elif _args.external:
    ATLASMIND_URL = f"http://{_args.external}:{ATLASMIND_BACKEND_PORT}"
else:
    ATLASMIND_URL = f"http://{ATLASMIND_BACKEND_HOST}:{ATLASMIND_BACKEND_PORT}"

# Bind host: default to config value; containers should set HOST=0.0.0.0
HOST = os.environ.get("HOST", _DEFAULT_HOST)
FRONTEND_PORT = int(os.environ.get("PORT", _DEFAULT_PORT))

# Jira PAT config is managed by auth.py

# Aggregation pipeline: enabled by default; disable via --no-aggregation or AGGREGATION=false
_env_agg = os.environ.get("AGGREGATION", "").lower()
AGGREGATION_ENABLED: bool = (
    False if _env_agg in {"0", "false", "off"}
    else not _args.no_aggregation
)

if AGGREGATION_ENABLED:
    from aggregator import aggregate as _aggregate, AggregateRequest as _AggregateRequest

# CORS origins: default to Vite dev server; override in production
_default_origins = f"http://{VITE_DEV_HOST}:{VITE_DEV_PORT},http://127.0.0.1:{VITE_DEV_PORT}"
_raw_origins = os.environ.get("ALLOWED_ORIGINS", _default_origins)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

print(f"[AtlasMind] Backend URL  : {ATLASMIND_URL}")
print(f"[AtlasMind] Listening on : {HOST}:{FRONTEND_PORT}")
print(f"[AtlasMind] Jira PAT     : {_auth_startup_log()}")
print(f"[AtlasMind] CORS origins : {ALLOWED_ORIGINS}")
print(f"[AtlasMind] Aggregation  : {'enabled' if AGGREGATION_ENABLED else 'disabled'}")

DIST_DIR = Path(__file__).parent / "jira-viz" / "dist"

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="AtlasMind Frontend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ── Schema ────────────────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query:      str
    request_id: str | None = None  # forwarded to AtlasMind for cancel routing
    limit:      int | None = None
    profile:    str | None = None
    pat:        str | None = None  # user-supplied PAT from UI; overrides JIRA_PAT env var
    jira_url:   str | None = None  # user-supplied Jira server URL; overrides JIRA_URL env var

class EventRequest(BaseModel):
    event:      str   # "cancel" | "heartbeat"
    request_id: str


# ── API routes ────────────────────────────────────────────────────────────────
@app.post("/api/query")
async def run_query(req: QueryRequest):
    """Translate a chat query into a GET /query call against the AtlasMind server."""
    params = {"q": req.query}
    if req.request_id:
        params["request_id"] = req.request_id
    if req.limit:
        params["limit"] = req.limit
    if req.profile:
        params["profile"] = req.profile

    # Resolve timeout from /meta so it matches the backend's LLM timeout.
    llm_timeout = 120
    try:
        async with httpx.AsyncClient(timeout=5) as meta_client:
            meta_resp = await meta_client.get(f"{ATLASMIND_URL}/meta")
            if meta_resp.is_success:
                llm_timeout = meta_resp.json().get("llm_timeout") or llm_timeout
    except Exception:
        pass
    query_timeout = llm_timeout + 10  # buffer so backend error propagates cleanly

    try:
        fwd_headers = _jira_headers(req.pat, req.jira_url)
        print(f"[AtlasMind] Querying: {ATLASMIND_URL}/query  params={params}  timeout={query_timeout}s")
        async with httpx.AsyncClient(timeout=query_timeout) as client:
            resp = await client.get(f"{ATLASMIND_URL}/query", params=params, headers=fwd_headers)
            resp.raise_for_status()

        # AtlasMind returns JSON — pass the parsed object straight through.
        # FastAPI serialises it correctly; never call str() on a dict (produces
        # Python single-quote format which the JS frontend cannot parse).
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = resp.json()
            if isinstance(payload, dict) and payload.get("field_map") and payload.get("issues"):
                payload["issues"] = _apply_field_map(payload["issues"], payload["field_map"])
            return {"output": payload, "error": None}
        return {"output": resp.text.strip(), "error": None}

    except httpx.ConnectError:
        return {
            "output": None,
            "error": "Backend not reachable — switch to Demo mode to explore your sprint data offline.",
        }
    except httpx.TimeoutException:
        return {"output": None, "error": f"AtlasMind server timed out ({query_timeout} s)."}
    except httpx.HTTPStatusError as exc:
        return {"output": None, "error": f"AtlasMind returned {exc.response.status_code}: {exc.response.text}"}
    except Exception as exc:
        return {"output": None, "error": str(exc)}


@app.post("/api/event")
async def forward_event(req: EventRequest):
    """Forward a client event (cancel, heartbeat) to AtlasMind."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(f"{ATLASMIND_URL}/event", json=req.model_dump())
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError:
        return {"request_id": req.request_id, "accepted": False, "detail": "backend not reachable"}
    except Exception as exc:
        return {"request_id": req.request_id, "accepted": False, "detail": str(exc)}


@app.post("/api/aggregate")
async def run_aggregate(req: dict):
    """Pre-aggregate issues server-side using pandas. Returns chart-ready data.
    Returns 503 when disabled via --no-aggregation or AGGREGATION=false."""
    if not AGGREGATION_ENABLED:
        return JSONResponse(
            status_code=503,
            content={"error": "Aggregation pipeline disabled. Restart without --no-aggregation to enable."},
        )
    try:
        parsed = _AggregateRequest(**req)
        return _aggregate(parsed)
    except Exception as exc:
        return {
            "error": str(exc), "chart_type": req.get("chart_spec", {}).get("type", ""),
            "x_axis": [], "series": [], "pie_data": None, "scatter_data": None,
            "total_issues": 0, "fields_resolved": {}, "warnings": [str(exc)],
        }


@app.get("/api/meta")
async def meta():
    """Return server metadata (model name, etc.) from AtlasMind."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{ATLASMIND_URL}/meta")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {}


@app.get("/api/health")
async def health():
    """Check this server and whether AtlasMind is reachable."""
    atlasmind_ok = False
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            atlasmind_ok = (await client.get(f"{ATLASMIND_URL}/health")).is_success
    except Exception:
        pass

    return {
        "status":        "ok",
        "atlasmind_url": ATLASMIND_URL,
        "atlasmind_up":  atlasmind_ok,
        "dist_built":    DIST_DIR.exists(),
    }


# ── Static UI routes ──────────────────────────────────────────────────────────
def _index():
    index = DIST_DIR / "index.html"
    if not index.exists():
        return {"error": "UI not built. Run:  cd jira-viz && npm run build"}
    return FileResponse(index)

@app.get("/demo")
@app.get("/demo/{path:path}")
def serve_demo(path: str = ""):
    return _index()

@app.get("/")
@app.get("/live")
@app.get("/live/{path:path}")
def serve_live(path: str = ""):
    return _index()

if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=FRONTEND_PORT, reload=False)
