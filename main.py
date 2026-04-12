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
from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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

# CORS origins: default to Vite dev server; override in production
_default_origins = f"http://{VITE_DEV_HOST}:{VITE_DEV_PORT},http://127.0.0.1:{VITE_DEV_PORT}"
_raw_origins = os.environ.get("ALLOWED_ORIGINS", _default_origins)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

print(f"[AtlasMind] Backend URL  : {ATLASMIND_URL}")
print(f"[AtlasMind] Listening on : {HOST}:{FRONTEND_PORT}")
print(f"[AtlasMind] CORS origins : {ALLOWED_ORIGINS}")

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
    query:   str
    limit:   int | None = None
    profile: str | None = None


# ── API routes ────────────────────────────────────────────────────────────────
@app.post("/api/query")
def run_query(req: QueryRequest):
    """Translate a chat query into a GET /query call against the AtlasMind server."""
    params = {"q": req.query}
    if req.limit:
        params["limit"] = req.limit
    if req.profile:
        params["profile"] = req.profile

    try:
        print(f"[AtlasMind] Querying: {ATLASMIND_URL}/query  params={params}")
        with httpx.Client(timeout=120) as client:
            resp = client.get(f"{ATLASMIND_URL}/query", params=params)
            resp.raise_for_status()

        # AtlasMind returns JSON — pass the parsed object straight through.
        # FastAPI serialises it correctly; never call str() on a dict (produces
        # Python single-quote format which the JS frontend cannot parse).
        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            return {"output": resp.json(), "error": None}
        return {"output": resp.text.strip(), "error": None}

    except httpx.ConnectError:
        return {
            "output": None,
            "error": "Backend not reachable — switch to Demo mode to explore your sprint data offline.",
        }
    except httpx.TimeoutException:
        return {"output": None, "error": "AtlasMind server timed out (120 s)."}
    except httpx.HTTPStatusError as exc:
        return {"output": None, "error": f"AtlasMind returned {exc.response.status_code}: {exc.response.text}"}
    except Exception as exc:
        return {"output": None, "error": str(exc)}


@app.get("/api/meta")
def meta():
    """Return server metadata (model name, etc.) from AtlasMind."""
    try:
        with httpx.Client(timeout=5) as client:
            resp = client.get(f"{ATLASMIND_URL}/meta")
            resp.raise_for_status()
            return resp.json()
    except Exception:
        return {}


@app.get("/api/health")
def health():
    """Check this server and whether AtlasMind is reachable."""
    atlasmind_ok = False
    try:
        with httpx.Client(timeout=5) as client:
            atlasmind_ok = client.get(f"{ATLASMIND_URL}/health").is_success
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
