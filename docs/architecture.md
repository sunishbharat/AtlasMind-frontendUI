# AtlasMind Frontend - Architecture & Query Flow

## Port Map

| Service | Port | Started by |
|---|---|---|
| Svelte dev server (Vite) | 5173 | `npm run dev` (dev only) |
| Bridge / API server | 8001 | `uv run main.py` |
| AtlasMind AI backend | 8000 | separate process (not in this repo) |

**Production mode:** only port 8001 is active. FastAPI serves the pre-built `jira-viz/dist/` directly.  
**Dev mode:** both 5173 and 8001 run. Vite proxies `/api/*` to 8001.

---

## Key Files

| File | Role |
|---|---|
| `main.py` | FastAPI bridge server. Translates POST `/api/query` → GET `:8000/query` |
| `config/defaults.py` | Port/host constants used by `main.py` |
| `jira-viz/src/lib/JiraViz.svelte` | Root shell — 3-row layout, mounts all views, watches `chartStore.hasData` to auto-switch to chart tab |
| `jira-viz/src/lib/ChatPanel.svelte` | AI chat sidebar. Handles send/cancel, demo vs live mode, parses response type |
| `jira-viz/src/lib/charts/chartStore.svelte.ts` | Reactive bridge store — ChatPanel writes, ChartView reads |
| `jira-viz/src/lib/charts/specBuilder.ts` | Converts API issues → ECharts option objects |
| `jira-viz/src/lib/charts/ChartView.svelte` | Tab bar + ECharts renderer. Merges AI spec + auto-generated specs |
| `jira-viz/src/lib/dataStore.svelte.ts` | Holds Jira issues (CSV or sample data). Used by HierarchyView + TableView |
| `jira-viz/src/lib/state.svelte.ts` | Cross-component hover state (`vizState.hoveredId`) |
| `auth.py` | Auth helper. Reads `JIRA_PAT` env var; `jira_headers(req.pat)` returns the `X-Jira-Token` header dict forwarded to AtlasMind |
| `jira-viz/src/lib/auth.svelte.ts` | Svelte 5 PAT store singleton. Persists token in `localStorage`. Exposes `isAuthenticated`, `save()`, `clear()` |
| `jira-viz/src/lib/PatPrompt.svelte` | Self-contained PAT input component. Shown in ChatPanel when `liveMode && !authStore.isAuthenticated` |

---

## Query Flow (Live Mode)

### Example: "list 100 bugs from project Kafka"

```mermaid
flowchart TD
    A([User types query + presses Enter]) --> B

    B["ChatPanel.send()\n- append user bubble\n- loading = true\n- requestId = randomUUID()"]
    B --> C

    C["POST :8001/api/query\nbody: { query, request_id, pat? }"]
    C --> D

    subgraph bridge ["main.py (port 8001)"]
        D["Build params { q, request_id }"]
        D --> D2["auth.py: jira_headers(req.pat)\n→ X-Jira-Token header if PAT present"]
        D2 --> E["GET :8000/meta\n→ read llm_timeout"]
        E --> F["GET :8000/query?q=...\nheaders: { X-Jira-Token }\ntimeout = llm_timeout + 10s"]
    end

    F --> G

    subgraph atlasmind ["AtlasMind AI (port 8000)"]
        G["LLM processes query\n→ generates JQL\n→ fetches Jira issues"]
    end

    G --> H["Returns JSON\n{ type, jql, issues[], chart_spec, meta }"]
    H --> I["main.py wraps:\n{ output: {...}, error: null }"]
    I --> J

    subgraph chatpanel ["ChatPanel.svelte"]
        J{"data.output.type?"}
        J -- jql --> K["Add table-summary bubble\nsummariseResult()"]
        J -- general --> L["Add plain text bubble"]
        J -- error --> M["Add error bubble"]
        K --> N["chartStore.setFromResponse()"]
    end

    N --> O

    subgraph chartstore ["chartStore (reactive)"]
        O["issues = 100 objects\nchartSpec = bar/pie spec\nhasData = true"]
    end

    O --> P["JiraViz $effect fires\n→ activeView = AI Chart tab"]
    P --> Q["ChartView renders\n- AI tab: explicit chart_spec\n- Other tabs: auto-generated specs"]
```

---

## Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant CP as ChatPanel<br/>(Svelte :5173)
    participant BR as Bridge Server<br/>(main.py :8001)
    participant AM as AtlasMind AI<br/>(:8000)
    participant CS as chartStore
    participant JV as JiraViz

    User->>CP: types query + presses Enter
    CP->>CP: loading = true, requestId = randomUUID()
    CP->>BR: POST /api/query { query, request_id }

    BR->>AM: GET /meta
    AM-->>BR: { llm_timeout: 120 }

    BR->>AM: GET /query?q=list+100+bugs+from+project+Kafka
    Note over AM: LLM generates JQL<br/>fetches Jira issues

    AM-->>BR: { type:"jql", issues:[...], chart_spec:{...}, meta:{...} }
    BR-->>CP: { output: {...}, error: null }

    CP->>CP: check output.type === "jql"
    CP->>CP: add table-summary bubble to messages[]

    CP->>CS: setFromResponse(output)
    CS->>CS: issues = [...], chartSpec = {...}, hasData = true

    CS-->>JV: hasData changed (reactive $effect)
    JV->>JV: activeView = "AI Chart"
    JV->>User: chart renders automatically

    Note over User,JV: If user clicks Cancel mid-flight...
    User->>CP: clicks Cancel button
    CP->>BR: POST /api/event { event:"cancel", request_id }
    BR->>AM: POST /event { event:"cancel", request_id }
    AM-->>BR: { accepted: true }
    AM-->>CP: { answer: "Error: Query cancelled." }
    CP->>User: "Query cancelled." bubble
```

---

## Bar Chart Creation - Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant CP as ChatPanel
    participant CS as chartStore
    participant CV as ChartView
    participant SB as specBuilder.ts
    participant CR as ChartRenderer<br/>(ECharts)

    User->>CP: "show bugs by assignee"
    CP->>CP: POST /api/query → AtlasMind returns<br/>{ type:"jql", issues:[...], chart_spec:{ type:"bar", x_field:"assignee", y_field:"count" } }

    CP->>CS: setFromResponse(output)
    CS->>CS: issues = [100 bug objects]
    CS->>CS: chartSpec = { type:"bar", x_field:"assignee", y_field:"count" }
    CS->>CS: hasData = true

    CS-->>CV: reactive $derived re-evaluates specs

    Note over CV: specs $derived block runs (ChartView.svelte:175)

    CV->>SB: fromExplicitSpec(chartStore.chartSpec, issues)
    Note over SB: x_field "assignee" is not a date field<br/>y_field "count" → isCountField = true<br/>color_field is null → no grouping<br/>→ single-series fallback path

    SB->>SB: countByField(issues, "assignee")<br/>→ [["Alice",34],["Bob",28],["Carol",18]...]

    SB->>SB: buildBar(entries, "Issues by assignee", maxItems)
    Note over SB: slices to maxItems (20)<br/>maps palette gradient per bar<br/>builds full EChartsOption object

    SB-->>CV: EChartsOption { xAxis, yAxis, series:[{type:"bar",...}] }

    CV->>CV: specs["explicit"] = { label:"Chart", icon:"bar", option }
    CV->>SB: buildAllSpecs(issues) - auto tabs
    SB-->>CV: { bar_status, pie_status, bar_assignee, trend, burndown, ... }

    CV->>CV: tabKeys = ["explicit","bar_status","pie_status",...]
    CV->>CV: activeTab = "explicit" (first / preferred)
    CV->>CV: currentOption = specs["explicit"].option

    CV->>CR: option={...EChartsOption...}
    CR->>CR: echartsInstance.setOption(option)
    CR-->>User: bar chart renders with gradient bars<br/>x-axis: assignee names<br/>y-axis: bug counts
```

---

## Response Branching

```mermaid
flowchart LR
    R{"Response type"} -- "type === jql" --> S["Table summary bubble\n+ chartStore update\n+ chart auto-renders"]
    R -- "type === general" --> T["Plain text bubble\nchartStore.updateMeta() only"]
    R -- "error present" --> U["Error bubble\nNo chart update"]
    R -- "cancelled" --> V["'Query cancelled.' bubble"]
```

---

## Reactive State Stores

All stores are Svelte 5 rune-based classes exported as singletons.

```mermaid
flowchart LR
    CP["ChatPanel"] -- "setFromResponse()" --> CS["chartStore"]
    CS -- "issues, chartSpec, hasData" --> CV["ChartView"]
    CS -- "hasData watcher" --> JV["JiraViz\n(auto-switches tab)"]

    DS["dataStore"] -- "epics, stories, subtasks" --> HV["HierarchyView"]
    DS --> TV["TableView"]
    DS --> CP

    VS["vizState\nhoveredId"] -- "hover highlight" --> HV
    VS --> JV

    AS["authStore\njira_pat (localStorage)"] -- "pat in fetch body" --> CP
```

### `chartStore` fields

| Field | Type | Purpose |
|---|---|---|
| `issues` | `ApiIssue[]` | Issues from latest query (preserved on zero-result responses) |
| `chartSpec` | `ChartSpec \| null` | Explicit chart spec from server (`chart_spec` snake_case) |
| `data` | `QueryResponse \| null` | Full raw server response |
| `query` | `string` | Query text that produced the result |
| `noResults` | `boolean` | True when last query returned 0 issues |
| `lastMeta` | `ServerMeta \| null` | Model name + LLM timeout from latest response |
| `backendAlive` | `boolean` | Updated by `/api/meta` polling |
| `hasData` | `boolean` (getter) | `issues.length > 0` — watched by JiraViz to auto-switch tabs |
| `authStore.pat` | `string` (`auth.svelte.ts`) | PAT store — `isAuthenticated`, `save()`, `clear()` |

---

## Demo vs Live Mode

Toggled by the **Demo / Live** button in ChatPanel header.

| | Demo | Live |
|---|---|---|
| How detected | path does NOT start with `/live` | path starts with `/live` |
| Query handling | Local keyword matcher `respond()` against `dataStore` | POST to `/api/query` → AtlasMind |
| Backend needed | No | Yes (port 8000) |
| Chart updates | No | Yes (on `type === "jql"` response) |

---

## Authentication

### Strategy

PAT (Personal Access Token) with `Authorization: Bearer <token>`.
Confirmed via Rovo that the Jira Server instance uses `WWW-Authenticate: Bearer`.

### Flow

```
User enters PAT in PatPrompt → saved to localStorage → sent as pat in POST body
  → main.py: auth.py jira_headers(req.pat) → X-Jira-Token header
  → AtlasMind (port 8000): reads X-Jira-Token → Authorization: Bearer <PAT> → Jira REST API
```

### Priority

| Source | When used |
|---|---|
| `req.pat` (from UI, per-request) | Cloud deployment — user enters PAT in PatPrompt |
| `JIRA_PAT` env var (fallback) | Docker/local deployment — set at container start |
| Neither | No auth header sent — works for public Jira (e.g. Apache) |

### New Files

| File | Purpose |
|---|---|
| `auth.py` | Single function `jira_headers(pat)` — all header logic lives here |
| `jira-viz/src/lib/auth.svelte.ts` | PAT rune store — `save()`, `clear()`, `isAuthenticated` |
| `jira-viz/src/lib/PatPrompt.svelte` | PAT input UI — shown once in Live mode; drop in or remove independently |

### To Remove Auth Entirely

1. Delete `auth.py`, `auth.svelte.ts`, `PatPrompt.svelte`
2. In `main.py`: remove `from auth import ...`; replace `_jira_headers(req.pat)` with `{}`
3. In `ChatPanel.svelte`: remove `import { authStore }` and `import PatPrompt`
4. In `ChatPanel.svelte`: remove `pat: authStore.pat` from the fetch body

### Deployment Notes

- **Cloud (AWS):** HTTPS via ALB + ACM is required — PAT travels in the HTTPS-encrypted request body. User enters PAT once in `PatPrompt`; stored in `localStorage`.
- **Local / Docker:** Set `JIRA_PAT` env var — `docker run -e JIRA_PAT=xxx ghcr.io/yourorg/atlasmind:latest`. `PatPrompt` is skipped because `auth.py` uses the env var fallback.
- **Public Jira:** Omit `JIRA_PAT` entirely — no auth header is sent; read-only public APIs work unauthenticated.

---

## Cancel Flow

```mermaid
flowchart TD
    A([User clicks Cancel button]) --> B
    B["cancelQuery()\nChatPanel.svelte:218"] --> C
    C["queryEventClient.cancel(requestId)"] --> D
    D["POST :8001/api/event\n{ event: 'cancel', request_id }"] --> E
    E["main.py forwards to\nPOST :8000/event"] --> F
    F["AtlasMind aborts LLM call\nreturns: { answer: 'Error: Query cancelled.' }"] --> G
    G([ChatPanel shows 'Query cancelled.' bubble])
```
