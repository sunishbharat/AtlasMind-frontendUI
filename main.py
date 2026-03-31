"""
AtlasMind Frontend API server.

Bridges the Svelte UI to the AtlasMind FastAPI backend.
Each /api/query POST translates to a GET request against the AtlasMind server:

  AtlasMind server (port 8000):
    uv run python main.py --server
    uv run python main.py --server --host 127.0.0.1 --port 9000

  This server (port 8001):
    uv run python main.py

  curl examples (direct to AtlasMind):
    curl "http://localhost:8000/query?q=list+5+bugs+in+KAFKA"
    curl "http://localhost:8000/query?q=open+issues+in+HADOOP&limit=20&profile=work"

Served endpoints:
  http://localhost:8001/demo        ← app in Demo mode (no AtlasMind needed)
  http://localhost:8001/live        ← app in Live mode (queries forwarded to AtlasMind)
  http://localhost:8001/api/health  ← health check
"""

from pathlib import Path

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Config ─────────────────────────────────────────────────────────────────────
ATLASMIND_URL = "http://localhost:8000"   # AtlasMind FastAPI server
FRONTEND_PORT = 8001                       # This server's port

DIST_DIR = Path(__file__).parent / "jira-viz" / "dist"

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="AtlasMind Frontend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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
            "error": (
                f"Cannot connect to AtlasMind server at {ATLASMIND_URL}.\n"
                "Start it with:\n\n  uv run python main.py --server"
            ),
        }
    except httpx.TimeoutException:
        return {"output": None, "error": "AtlasMind server timed out (120 s)."}
    except httpx.HTTPStatusError as exc:
        return {"output": None, "error": f"AtlasMind returned {exc.response.status_code}: {exc.response.text}"}
    except Exception as exc:
        return {"output": None, "error": str(exc)}


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
    uvicorn.run(app, host="127.0.0.1", port=FRONTEND_PORT, reload=False)
