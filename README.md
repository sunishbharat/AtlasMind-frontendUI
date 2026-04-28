# AtlasMind Frontend UI

Interactive Jira sprint visualiser built with **Svelte 5 + Vite**. Displays epics, stories, and sub-tasks as a linked hierarchy, table, and AI-driven charts — with a chat panel that queries the [AtlasMind](../AtlasMind) backend.

---

## Project structure

```
AtlasMind-frontendUI/
├── main.py              # FastAPI bridge server (port 8001 → AtlasMind port 8000)
├── auth.py              # PAT auth helper — X-Jira-Token header forwarding
├── pyproject.toml       # Python deps (fastapi, uvicorn, httpx, pandas, pyjanitor, numpy)
├── config/              # Port/host constants
├── aggregator/          # Pandas aggregation engine (engine.py, field_resolver.py)
├── docs/                # Architecture diagrams and query flow docs
└── jira-viz/            # Svelte 5 application
    └── src/lib/
        ├── JiraViz.svelte           # Main shell (header, layout, view switching)
        ├── ChatPanel.svelte         # AI chat panel (Demo / Live mode)
        ├── PatPrompt.svelte         # PAT token input (shown in Live mode)
        ├── dataStore.svelte.ts      # Reactive data store + CSV parser
        ├── state.svelte.ts          # Shared hover state
        ├── auth.svelte.ts           # PAT auth store (localStorage)
        ├── data.ts                  # Built-in sample sprint data
        ├── views/
        │   ├── HierarchyView.svelte # Epic → Story → Sub-task map
        │   └── TableView.svelte     # Flat backlog table
        └── charts/
            ├── ChartView.svelte     # Tab bar + ECharts renderer
            ├── ChartPanel.svelte    # Chart layout wrapper
            ├── ChartRenderer.svelte # ECharts instance lifecycle
            ├── chartStore.svelte.ts # Bridge store (ChatPanel → ChartView)
            ├── specBuilder.ts       # Issues → ECharts option objects
            └── theme.ts             # Colour palette + gradient helpers
```

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Node.js](https://nodejs.org) ≥ 18 | Svelte dev server |
| [uv](https://docs.astral.sh/uv/) | Python package manager |
| [AtlasMind](../AtlasMind) | Backend AI server (only needed for Live mode) |

---

## Running the app

### Option A — Served endpoints (recommended)

Build the UI once, then start the bridge server. The bridge serves the built UI and proxies API calls to AtlasMind.

```bash
# 1. Build the Svelte app
cd jira-viz
npm install
npm run build

# 2. Start the AtlasMind backend (port 8000) — separate repo
cd ../AtlasMind
uv run python main.py

# 3. Start the bridge server (port 8001)
cd ../AtlasMind-frontendUI
uv sync
uv run main.py
```

| URL | Mode |
|-----|------|
| `http://localhost:8001/demo` | Demo — local mock data, no AtlasMind needed |
| `http://localhost:8001/live` | Live — queries forwarded to AtlasMind → Jira |
| `http://localhost:8001/api/health` | Health check |

### Option B — Vite dev server (hot-reload during development)

```bash
cd jira-viz
npm install
npm run dev          # http://localhost:5173
```

Also start the bridge in a second terminal:

```bash
uv run main.py
```

Use the **Demo / Live** toggle in the chat panel header to switch modes.

---

## Configuration

All settings are optional — defaults work for local development.

| Env var | Default | Purpose |
|---------|---------|---------|
| `ATLASMIND_URL` | `http://localhost:8000` | AtlasMind backend URL |
| `JIRA_PAT` | _(none)_ | Fallback PAT for Docker/local (UI entry takes precedence) |
| `JIRA_URL` | _(none)_ | Jira server base URL forwarded to AtlasMind |
| `ALLOWED_ORIGINS` | Vite dev server | Comma-separated CORS origins for production |
| `HOST` | `127.0.0.1` | Bridge server bind address (set to `0.0.0.0` in containers) |
| `PORT` | `8001` | Bridge server port |

CLI flags (alternative to env vars):

```bash
uv run main.py --external <IP>   # connect to AtlasMind at a remote IP
uv run main.py --no-aggregation  # disable pandas aggregation pipeline
```

---

## Authentication

In **Live mode**, a PAT (Personal Access Token) is required to query a private Jira instance.

1. Open the app at `/live`
2. Enter your Jira PAT in the token prompt that appears in the chat panel
3. The token is saved to `localStorage` and sent with every query

The bridge forwards it as `X-Jira-Token` to AtlasMind, which uses it to authenticate against the Jira REST API.

For Docker/server deployments, set `JIRA_PAT` as an environment variable instead — the UI prompt is skipped automatically.

---

## Using the app

### Visualisation views

| View | Description |
|------|-------------|
| Hierarchy Map | Epic → Story → Sub-task with animated SVG connections |
| Issue Table | Flat backlog with indented hierarchy and hover sync |
| AI Chart | Charts auto-generated from the last AI query result |

Hover any card or table row to highlight its connections across all active views.

### AI Chat panel

Click **Ask AI** (top-right) to open the chat panel.

- **Demo mode** — answers from locally loaded sample data, no backend needed
- **Live mode** — sends the query to AtlasMind, which generates JQL and queries Jira; results auto-render as charts

Example queries:
```
list all open bugs in project ATLAS
show issues assigned to me updated this week
bugs by assignee as a bar chart
```

When a Live query returns issues, the view switches automatically to the **AI Chart** tab. Additional auto-generated chart tabs (by status, priority, assignee, type) are shown alongside the AI-specified chart.

---

## Build for production

```bash
cd jira-viz
npm run build
# Output in jira-viz/dist/
```

The bridge server (`main.py`) serves `jira-viz/dist/` directly — no separate reverse proxy is needed.

For cloud deployment, set `HOST=0.0.0.0`, `ALLOWED_ORIGINS=https://yourdomain.com`, and `JIRA_PAT` (or rely on per-request PAT entry from the UI). HTTPS via a load balancer is recommended to protect the PAT in transit.
