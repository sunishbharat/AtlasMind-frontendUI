# AtlasMind Frontend UI

Interactive Jira sprint visualiser built with **Svelte 5 + Vite**. Displays epics, stories, and sub-tasks as a linked hierarchy, table, and more — with an AI chat panel that can query the [AtlasMind](../AtlasMind) backend.

---

## Project structure

```
AtlasMind-frontendUI/
├── main.py          # FastAPI bridge server (connects UI → AtlasMind backend)
├── pyproject.toml   # Python dependencies (fastapi, uvicorn)
├── jira-viz/        # Svelte 5 application
│   ├── src/
│   │   └── lib/
│   │       ├── JiraViz.svelte       # Main shell (header, layout, CSV upload)
│   │       ├── ChatPanel.svelte     # AI chat panel (Demo / Live mode)
│   │       ├── dataStore.svelte.js  # Reactive data store + CSV parser
│   │       ├── state.svelte.js      # Shared hover state
│   │       ├── data.js              # Built-in sample sprint data
│   │       └── views/
│   │           ├── HierarchyView.svelte  # Epic → Story → Sub-task map
│   │           └── TableView.svelte      # Flat backlog table
│   └── vite.config.js   # Proxies /api → localhost:8000
└── .venv/           # Python virtual environment (created by uv)
```

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| [Node.js](https://nodejs.org) ≥ 18 | Svelte dev server |
| [uv](https://docs.astral.sh/uv/) | Python package manager |
| [AtlasMind](../AtlasMind) | Backend (only needed for Live chat mode) |

---

## Running the app

### Option A — Served endpoints (recommended)

One server, two URLs. Build the UI once, then start the API server:

```powershell
# 1. Build the Svelte app
cd jira-viz
npm install
npm run build

# 2. Start the AtlasMind backend (port 8000)
cd ..\AtlasMind
uv run python main.py --server

# 3. Start the frontend API + static server (port 8001)
cd ..\AtlasMind-frontendUI
uv sync
uv run python main.py
```

| URL | Mode |
|-----|------|
| `http://localhost:8001/demo` | Demo — mock AI, no Jira connection needed |
| `http://localhost:8001/live` | Live — queries forwarded to AtlasMind → Jira |
| `http://localhost:8001/api/health` | Health check (shows if AtlasMind is reachable) |

The app automatically starts in the correct mode based on which URL you open.

---

### Option B — Vite dev server (hot-reload during development)

```bash
cd jira-viz
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Use the **Demo / Live** toggle pill in the chat panel header to switch modes. For Live mode, also start the API server in a second terminal:

```powershell
# Second terminal
uv sync
uv run python main.py
```

---

## Using the app

### Visualisation views

Select one or more views from the **View** dropdown (Row 3 of the header):

| View | Description |
|------|-------------|
| Hierarchy Map | Epic → Story → Sub-task with animated SVG connections |
| Issue Table | Flat backlog with indented hierarchy and hover sync |

Hover any card or table row to highlight its connections across all active views.

### Loading your own data

Click **Upload CSV** (Row 2) and select a `.csv` file with the following columns:

| Column | Required | Notes |
|--------|----------|-------|
| `id` | Yes | e.g. `PROJ-1` |
| `type` | Yes | `Epic`, `Story`, or `Sub-task` |
| `title` | Yes | Issue summary |
| `status` | Yes | `Done`, `In Progress`, or `To Do` |
| `points` | Yes | Story points (integer) |
| `assignee` | Yes | Full name |
| `parentId` | Stories + Sub-tasks | Epic key for stories; Story key for sub-tasks |
| `sprint` | No | Displayed in the header, e.g. `Sprint 12` |

Click **×** next to the filename to reset back to sample data.

### AI Chat panel

Open with the **Ask AI** button (Row 3, right side). Type a question and press **Enter**.

- **Demo mode** — answers from the currently loaded sprint data (no backend needed)
- **Live mode** — sends the query to AtlasMind, which generates JQL and queries Jira

Example queries for Live mode:
```
list all open bugs in project ATLAS
show issues assigned to me updated this week
find resolved issues that took more than 5 days
```

---

## Build for production

```bash
cd jira-viz
npm run build
# Output in jira-viz/dist/
```

To serve the build alongside the API server, configure a reverse proxy (nginx, Caddy) to route `/api/*` to `localhost:8000` and everything else to the static `dist/` folder.
