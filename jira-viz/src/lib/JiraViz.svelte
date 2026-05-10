<script lang="ts">
  import type { ComponentType } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import Logo from "./Logo.svelte";
  import HierarchyView from "./views/HierarchyView.svelte";
  import TableView from "./views/TableView.svelte";
  import ChatPanel from "./ChatPanel.svelte";
  import DashboardV2 from "./dashboard/DashboardV2.svelte";
  import { STATUS_STYLE } from "./data.js";
  import { dataStore } from "./dataStore.svelte.js";
  import { vizState } from "./state.svelte.js";
  import { ChartView, chartStore } from "./charts/index.js";

  interface ViewDef {
    id: string;
    label: string;
    description: string;
    icon: string;
    component: ComponentType;
  }

  // - View registry -----------------------------------------------------------
  const VIEWS: ViewDef[] = [
    {
      id: "hierarchy",
      label: "Hierarchy Map",
      description: "Epic → Story → Sub-task connections",
      icon: "◈",
      component: HierarchyView,
    },
    {
      id: "table",
      label: "Issue Table",
      description: "Flat backlog list with hierarchy",
      icon: "▤",
      component: TableView,
    },
    {
      id: "chart",
      label: "AI Chart",
      description: "Chart from AI query results",
      icon: "◉",
      component: ChartView,
    },
    // { id: 'timeline', label: 'Timeline',       description: 'Gantt-style sprint view',             icon: '⟶', component: TimelineView  },
    // { id: 'burndown', label: 'Burndown Chart', description: 'Sprint progress over time',           icon: '↘', component: BurndownView  },
    // { id: 'workload', label: 'Workload',        description: 'Story points by assignee',            icon: '◫', component: WorkloadView  },
  ];

  // - View state --------------------------------------------------------------
  let chatOpen = $state(true); // Open by default in Ask AI
  let mainView = $state<"dashboard" | "chart">("dashboard");
  let hasChartData = $state(false); // Track if chart data was ever captured
  let lastAutoSwitchIssueCount = $state(0); // Track issues count at last auto-switch

  // - Query toggle state -------------------------------------------------------
  let queryOpen = $state(false);

  function toggleQueryPanel(): void {
    queryOpen = !queryOpen;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(QUERY_TOGGLE_KEY, String(queryOpen));
    }
  }

  // - Query syntax highlighting ------------------------------------------------
  const QUERY_KEYWORDS = [
    "SELECT",
    "FROM",
    "WHERE",
    "IN",
    "AND",
    "OR",
    "NOT",
    "IS",
    "EMPTY",
    "ORDER",
    "BY",
    "LIMIT",
    "GROUP",
    "HAVING",
    "ASC",
    "DESC",
    "JOIN",
    "ON",
    "AS",
    "DISTINCT",
    "COUNT",
    "SUM",
    "AVG",
    "MAX",
    "MIN",
  ];
  function highlightQuery(q: string): string {
    if (!q) return "";
    // Don't escape & or < - JQL from backend already has proper encoding
    let out = q;
    QUERY_KEYWORDS.forEach((kw) => {
      out = out.replace(
        new RegExp(`\\b${kw}\\b`, "gi"),
        `<span class="query-kw">${kw}</span>`,
      );
    });
    out = out.replace(/'([^']*)'/g, `<span class="query-val">'$1'</span>`);
    out = out.replace(
      /(&gt;=|&lt;=|&lt;&gt;|&gt;|&lt;|!=|=)/g,
      '<span class="query-op">$1</span>',
    );
    return out;
  }

  // Auto-switch to chart when issues count increases (new query)
  $effect(() => {
    const issueCount = chartStore.issues.length;
    if (issueCount > 0 && issueCount > lastAutoSwitchIssueCount && mainView === "dashboard") {
      mainView = "chart";
      hasChartData = true;
      lastAutoSwitchIssueCount = issueCount; // Remember we auto-switched for this batch
    }
  });

  function switchToChart() {
    mainView = "chart";
  }

  function switchToDashboard() {
    // Just switch view, don't clear chart data so we can toggle back
    mainView = "dashboard";
    // lastAutoSwitchIssueCount stays as-is - we only auto-switch when issues count increases
  }
  let aboutOpen = $state(false);
  let selectedIds = $state(new Set<string>(["hierarchy"]));

  const activeViews = $derived(VIEWS.filter((v) => selectedIds.has(v.id)));

  function toggleView(id: string): void {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    } else next.add(id);
    selectedIds = next;
  }

  function removeView(id: string): void {
    if (selectedIds.size === 1) return;
    const next = new Set(selectedIds);
    next.delete(id);
    selectedIds = next;
  }

  // Poll /api/meta every 30 s — covers both liveness and model metadata.
  // Badge goes green when backend is up, disappears when it goes down.
  $effect(() => {
    chartStore.pollMeta();
    const id = setInterval(() => chartStore.pollMeta(), 60_000);
    return () => clearInterval(id);
  });

  // Auto-switch to chart view when AI results arrive
  $effect(() => {
    if (chartStore.hasData) {
      selectedIds = new Set(["chart"]);
    }
  });

  // Sync AI query issues into the hierarchy view
  $effect(() => {
    if (chartStore.issues.length > 0) {
      dataStore.setFromApiIssues(chartStore.issues);
    }
  });

  // - CSV upload --------------------------------------------------------------
  let fileInput: HTMLInputElement;
  let uploading = $state(false);

  async function onFileChange(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;
    await dataStore.loadCSV(file);
    uploading = false;
    fileInput.value = "";
  }

  // - Sprint stats (reactive) -------------------------------------------------
  const allItems = $derived([
    ...dataStore.epics,
    ...dataStore.stories,
    ...dataStore.subtasks,
  ]);
  const done = $derived(allItems.filter((i) => i.status === "Done").length);
  const total = $derived(allItems.length);
  const pct = $derived(Math.round((done / total) * 100));
  const sprintName = $derived(dataStore.epics[0]?.sprint ?? "Sprint");
</script>

<div class="shell">
  <!-- ════════════════════════════════════════════════════════════════════════
       ROW 1 — Brand / Info  (read-only, non-interactive)
  ═════════════════════════════════════════════════════════════════════════ -->
  <div class="hrow hrow-brand" aria-label="Project info">
    <div class="brand-left">
      <div class="logo">
        <Logo />
      </div>
      <span class="brand-tag">AtlasMind</span>
      <span class="brand-divider"></span>
      <div class="brand-title">
        <span class="brand-sprint">Insight Engine</span>
        <span class="brand-sub">From data to decisions</span>
      </div>
    </div>

    <div class="nav-tabs">
      <span class="nav-label">Ask AI</span>
    </div>

    <div class="brand-stats">
      <div class="stat-pill">
        <span class="stat-pill-val">{dataStore.epics.length}</span>
        <span class="stat-pill-label">Epics</span>
      </div>
      <div class="stat-pill">
        <span class="stat-pill-val">{dataStore.stories.length}</span>
        <span class="stat-pill-label">Stories</span>
      </div>
      <div class="stat-pill">
        <span class="stat-pill-val">{dataStore.subtasks.length}</span>
        <span class="stat-pill-label">Sub-tasks</span>
      </div>

      <div class="brand-progress">
        <div class="progress-track">
          <div class="progress-fill" style="width:{pct}%"></div>
        </div>
        <span class="progress-label">{done}/{total} done</span>
        <span class="progress-pct">{pct}%</span>
      </div>
    </div>

    <div class="about-wrap">
      <button
        class="about-btn"
        class:active={aboutOpen}
        onclick={() => (aboutOpen = !aboutOpen)}
        title="About AtlasMind">?</button
      >
      {#if aboutOpen}
        <div class="about-panel" role="dialog" aria-label="About">
          <p class="about-title">AtlasMind · Insight Engine</p>
          <p class="about-desc">
            Jira visualization and AI-powered query dashboard.
          </p>
          <p class="about-footer">© 2026 Sunish Bharathan · MIT Licensed</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- ════════════════════════════════════════════════════════════════════════
       ROW 2 — Data Input  (user-editable: load / swap data)
  ═════════════════════════════════════════════════════════════════════════ -->
  <div class="hrow hrow-data">
    <div class="data-right">
      <div class="data-row">
        <span class="model-badge" class:offline={!chartStore.backendAlive}>
          <span class="model-dot" class:offline={!chartStore.backendAlive}
          ></span>
          {chartStore.lastMeta?.model_name ?? "Connecting..."}
        </span>
        <div class="row-sep"></div>
        <div class="data-controls">
          <div class="data-source">
            {#if dataStore.csvFilename}
              <span class="ds-dot ds-dot--file"></span>
              <svg width="11" height="11" viewBox="0 0 12 12"
                ><path
                  d="M2 1h5l3 3v7H2V1z"
                  stroke="currentColor"
                  stroke-width="1.2"
                  fill="none"
                  stroke-linejoin="round"
                /><path
                  d="M7 1v3h3"
                  stroke="currentColor"
                  stroke-width="1.2"
                  fill="none"
                /></svg
              >
              <span class="ds-name">{dataStore.csvFilename}</span>
              <button
                class="ds-clear"
                onclick={() => dataStore.resetToSample()}
                title="Reset to sample data"
              >
                <svg width="9" height="9" viewBox="0 0 9 9"
                  ><path
                    d="M1.5 1.5l6 6M7.5 1.5l-6 6"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  /></svg
                >
              </button>
            {:else}
              <span class="ds-dot ds-dot--sample"></span>
              <span class="ds-name ds-name--sample">Sample data</span>
            {/if}
          </div>

          <div class="row-sep"></div>

          <button
            class="upload-btn"
            onclick={() => fileInput.click()}
            disabled={uploading}
          >
            {#if uploading}
              <span class="spinner"></span>
              Parsing…
            {:else}
              <svg width="12" height="12" viewBox="0 0 12 12"
                ><path
                  d="M6 8V2M3 5l3-3 3 3"
                  stroke="currentColor"
                  stroke-width="1.5"
                  fill="none"
                  stroke-linecap="round"
                /><path
                  d="M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  fill="none"
                  stroke-linecap="round"
                /></svg
              >
              Upload CSV
            {/if}
          </button>

          <input
            bind:this={fileInput}
            type="file"
            accept=".csv"
            style="display:none"
            onchange={onFileChange}
          />
        </div>

        {#if dataStore.csvError}
          <div class="data-error">
            <svg width="12" height="12" viewBox="0 0 12 12"
              ><circle
                cx="6"
                cy="6"
                r="5"
                stroke="#f87171"
                stroke-width="1.2"
                fill="none"
              /><path
                d="M6 3.5v3M6 8v.5"
                stroke="#f87171"
                stroke-width="1.2"
                stroke-linecap="round"
              /></svg
            >
            <span>{dataStore.csvError}</span>
            <button
              class="error-close"
              onclick={() => (dataStore.csvError = null)}>×</button
            >
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ════════════════════════════════════════════════════════════════════════
       ROW 3 — Controls  (view selector + future filter dropdowns)
  ═════════════════════════════════════════════════════════════════════════ -->
  <div class="hrow hrow-controls">
    <span class="row-label">View</span>
    <div class="row-sep"></div>

    <!-- View tab buttons - chart view is excluded (switches automatically via AI) -->
    <div class="view-tabs">
      {#each VIEWS.filter((v) => v.id !== "chart") as view}
        {@const active = selectedIds.has(view.id)}
        <button
          class="view-tab"
          class:active
          onclick={() => toggleView(view.id)}
          title={view.description}
        >
          <span class="view-tab-icon">{view.icon}</span>
          {view.label}
        </button>
      {/each}
    </div>

    <div class="ai-area">
      {#if chartStore.lastMeta?.model_name}
        <span class="model-badge" class:offline={!chartStore.backendAlive}>
          <span class="model-dot" class:offline={!chartStore.backendAlive}
          ></span>
          {chartStore.lastMeta.model_name}{chartStore.lastMeta.llm_timeout !=
          null
            ? ` · ${chartStore.lastMeta.llm_timeout}s`
            : ""}
        </span>
      {/if}
      <button
        class="ask-ai-btn"
        class:active={chatOpen}
        onclick={() => (chatOpen = !chatOpen)}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            stroke-width="1.3"
          />
          <path
            d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z"
            fill="currentColor"
          />
          <circle cx="7" cy="11" r=".7" fill="currentColor" />
        </svg>
        Ask AI
      </button>
    </div>
  </div>

  <!-- ── Main content area (dashboard + chat panel side by side) ───────────── -->
  <div class="main-area">
    <!-- Left: dashboard or chart column -->
    <div class="content-col">
      <!-- Always show header with toggle -->
      <div class="content-header">
        <span class="content-title"
          >{mainView === "chart" ? "AI Chart Result" : "Dashboard View"}</span
        >
        <div
          class="ai-chart-toggle"
          role="switch"
          aria-checked={mainView === "chart"}
        >
          <button
            type="button"
            class="ai-toggle-label"
            class:active={mainView === "dashboard"}
            onclick={switchToDashboard}
            disabled={mainView === "dashboard"}
          >
            <i class="ti ti-layout-dashboard icon"></i>
            Dashboard
            <span class="dot"></span>
          </button>
          <button
            type="button"
            class="ai-toggle-label"
            class:active={mainView === "chart"}
            onclick={() => chartStore.hasData && (mainView = "chart")}
            disabled={!hasChartData || mainView === "chart"}
          >
            <i class="ti ti-sparkles icon"></i>
            AI Chart
            <span class="dot"></span>
          </button>
          <div
            class="ai-toggle-slider"
            class:dashboard={mainView === "dashboard"}
            class:ai-chart={mainView === "chart"}
            style="left:{mainView === 'chart' ? '50%' : '0'}"
          ></div>
        </div>
      </div>

      {#key mainView}
        {#if mainView === "chart"}
          <div
            class="ai-chart-view"
            in:scale={{ duration: 250, start: 0.96, easing: quintOut }}
            out:fade={{ duration: 150 }}
          >
            <ChartView isActive={mainView === "chart"} />
          </div>
        {:else}
          <div
            class="dashboard-view"
            in:scale={{ duration: 250, start: 0.96, easing: quintOut }}
            out:fade={{ duration: 150 }}
          >
            <DashboardV2 isActive={mainView === "dashboard"} />
          </div>
        {/if}
      {/key}

      <!-- Detail panel -->
      <div class="detail-panel">
        <div class="dp-content">
          {#if vizState.hoveredId}
            {@const issue = dataStore.allIssues[vizState.hoveredId]}
            {@const s = STATUS_STYLE[issue?.status ?? "To Do"]}
            <div class="dp-inner">
              <span class="dp-key">{issue.id}</span>
              <span class="dp-title">{issue.title}</span>
              <div class="dp-chips">
                <span
                  class="dp-chip"
                  style="color:{s.color}; border-color:{s.color}40"
                  >{issue.status}</span
                >
                <span class="dp-chip">{issue.points} story pts</span>
                <span class="dp-chip">{issue.assignee}</span>
                {#if issue.epicId}<span class="dp-chip"
                    >Epic: {dataStore.allIssues[issue.epicId]?.title}</span
                  >{/if}
                {#if issue.storyId}<span class="dp-chip"
                    >Story: {dataStore.allIssues[issue.storyId]?.title}</span
                  >{/if}
              </div>
            </div>
          {/if}

          <!-- Build date - visible in both views -->
          <div class="dp-query-row">
            <span class="dp-build-date">Built {new Date(__BUILD_TIME__).toLocaleString()}</span>
            {#if mainView === "chart" && chartStore.data?.jql}
              {#if queryOpen}
                <span class="dp-query-label">JQL:</span>
                <code class="dp-query-code">{chartStore.data.jql}</code>
              {/if}
              <button
                class="dp-query-toggle"
                class:active={queryOpen}
                onclick={toggleQueryPanel}
                aria-label="Toggle query"
                aria-expanded={queryOpen}
                title={chartStore.data.jql}
              >
                <span class="dp-query-dot"></span>
                {queryOpen ? "query ×" : "query"}
              </button>
            {/if}
          </div>
          {#if mainView === "chart" && chartStore.data?.jql}
            <div
              class="dp-query-panel"
              class:open={queryOpen}
              aria-hidden={!queryOpen}
            >
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            </div>
          {:else}{/if}
        </div>
      </div>
    </div>

    <!-- Right: chat panel -->
    <ChatPanel open={chatOpen} />
  </div>
</div>

<span class="build-badge"
  >Built {new Date(__BUILD_TIME__).toLocaleString()}</span
>

<style>
  /* ── Shell ──────────────────────────────────────────────────────────────── */
  .shell {
    width: 100%;
    height: 100svh;
    background: #0c1220;
    color: #e2e8f0;
    font-family: "Inter", system-ui, "Segoe UI", sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     HEADER ROWS — shared base
  ══════════════════════════════════════════════════════════════════════════ */
  .hrow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 32px;
    flex-shrink: 0;
    border-bottom: 1px solid #1a2540;
  }

  /* ── Row 1: Brand / Info ────────────────────────────────────────────────── */
  .hrow-brand {
    background: #08111e;
    padding-top: 14px;
    padding-bottom: 14px;
    user-select: none;
    pointer-events: none; /* truly non-interactive */
  }

  .about-wrap {
    position: relative;
    margin-left: 12px;
    pointer-events: all;
    user-select: none;
  }

  .about-btn {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid #1e293b;
    background: transparent;
    color: #475569;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.15s,
      color 0.15s;
  }
  .about-btn:hover,
  .about-btn.active {
    border-color: #818cf8;
    color: #818cf8;
  }

  .about-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 220px;
    background: #0d1b2e;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 12px 14px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .about-title {
    font-size: 11px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0;
  }

  .about-desc {
    font-size: 10.5px;
    color: #7a9ab8;
    margin: 0;
    line-height: 1.6;
  }

  .about-footer {
    font-size: 10px;
    color: #4e6884;
    margin: 0;
    padding-top: 6px;
    border-top: 1px solid #1e293b;
  }

  .brand-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .nav-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 16px;
    pointer-events: auto;
  }

  .nav-label {
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: white;
    background: #1f6feb;
    border-radius: 4px;
  }

  .nav-tab {
    padding: 5px 12px;
    border: none;
    background: transparent;
    color: #8b949e;
    font-size: 12px;
    cursor: pointer;
    border-radius: 4px;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .nav-tab:hover {
    background: #21262d;
    color: #e6edf3;
  }
  .nav-tab.active {
    background: #1f6feb;
    color: white;
  }

  .logo {
    display: flex;
    align-items: center;
  }

  .brand-tag {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    border: 1px solid rgba(129, 140, 248, 0.2);
    padding: 3px 9px;
    border-radius: 4px;
  }

  .brand-divider {
    width: 1px;
    height: 20px;
    background: #1e293b;
  }

  .brand-title {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .brand-sprint {
    font-size: 11px;
    font-weight: 500;
    color: #c8d6e8;
    line-height: 1;
  }

  .brand-sub {
    font-size: 10px;
    color: #5a7a99;
    letter-spacing: 0.03em;
  }

  .brand-stats {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .stat-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .stat-pill-val {
    font-size: 15px;
    font-weight: 700;
    color: #94a3b8;
    line-height: 1;
  }

  .stat-pill-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #4e6884;
  }

  .build-badge {
    display: none; /* Moved to query row */
  }

  .brand-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 16px;
    border-left: 1px solid #1e293b;
  }

  .progress-track {
    width: 90px;
    height: 3px;
    background: #1e293b;
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #22c55e);
    border-radius: 999px;
    transition: width 0.4s ease;
  }

  .progress-label {
    font-size: 11px;
    color: #6b8aaa;
  }
  .progress-pct {
    font-size: 12px;
    font-weight: 700;
    color: #22c55e;
    min-width: 32px;
  }

  /* ── Row 2: Data Input ──────────────────────────────────────────────────── */
  .hrow-data {
    background: #0c1220;
    padding-top: 8px;
    padding-bottom: 8px;
    min-height: 44px;
  }

  .row-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #4e6884;
    flex-shrink: 0;
    min-width: 44px;
  }

  .row-sep {
    width: 1px;
    height: 16px;
    background: #1e293b;
    flex-shrink: 0;
  }

  .data-source {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ds-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .ds-dot--sample {
    background: #334155;
  }
  .ds-dot--file {
    background: #22c55e;
  }

  .ds-name {
    font-size: 12px;
    color: #64748b;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ds-name--sample {
    color: #4e6884;
    font-style: italic;
  }

  .ds-clear {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    color: #475569;
    transition:
      color 0.15s,
      background 0.15s;
  }

  .ds-clear:hover {
    color: #94a3b8;
    background: #1e293b;
  }

  .data-right {
    margin-left: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .data-right-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .data-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .data-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .upload-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #94a3b8;
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
    white-space: nowrap;
  }

  .upload-btn:hover:not(:disabled) {
    border-color: #475569;
    color: #e2e8f0;
    background: #243044;
  }
  .upload-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid #334155;
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .data-error {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 5px;
    padding: 4px 10px;
    border-radius: 5px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.18);
    font-size: 11px;
    color: #fca5a5;
    max-width: 340px;
  }

  .data-error span {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-close {
    all: unset;
    cursor: pointer;
    color: #f87171;
    font-size: 14px;
    line-height: 1;
    opacity: 0.6;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .error-close:hover {
    opacity: 1;
  }

  /* ── Row 3: Controls / Dropdowns ────────────────────────────────────────── */
  .hrow-controls {
    display: none; /* DashboardV2 has its own nav tabs */
    background: #0c1220;
    padding-top: 8px;
    padding-bottom: 8px;
    min-height: 44px;
    border-bottom-width: 2px;
  }

  .view-tabs {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .view-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: #6b8aaa;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition:
      color 0.15s,
      background 0.15s,
      border-color 0.15s;
    white-space: nowrap;
  }

  .view-tab:hover {
    color: #b0c4d8;
    background: rgba(255, 255, 255, 0.05);
  }

  .view-tab.active {
    color: #e8eef5;
    background: rgba(129, 140, 248, 0.12);
    border-color: rgba(129, 140, 248, 0.28);
  }

  .view-tab-icon {
    font-size: 13px;
    color: #818cf8;
  }

  /* ── Model badge + Ask AI wrapper ───────────────────────────────────────── */
  .ai-area {
    margin-left: auto;
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .model-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10.5px;
    font-family: "Inter", system-ui, sans-serif;
    font-weight: 500;
    color: #22c55e;
    background: rgba(34, 197, 94, 0.07);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 4px;
    flex-shrink: 0;
    padding: 2px 7px;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .model-badge.offline {
    color: #475569;
    background: rgba(71, 85, 105, 0.07);
    border-color: rgba(71, 85, 105, 0.25);
  }

  .model-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
    animation: model-pulse 2s ease-in-out infinite;
  }

  .model-dot.offline {
    background: #475569;
    animation: none;
    opacity: 0.6;
  }

  @keyframes model-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  /* ── Ask AI button ──────────────────────────────────────────────────────── */
  .ask-ai-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 13px;
    background: #131e2e;
    border: 1px solid #1e293b;
    border-radius: 6px;
    color: #818cf8;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition:
      border-color 0.15s,
      background 0.15s,
      color 0.15s;
  }

  .ask-ai-btn:hover {
    border-color: rgba(129, 140, 248, 0.4);
    background: rgba(129, 140, 248, 0.08);
  }

  .ask-ai-btn.active {
    background: rgba(129, 140, 248, 0.12);
    border-color: rgba(129, 140, 248, 0.35);
    color: #a5b4fc;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MAIN AREA — views + chat side by side
  ══════════════════════════════════════════════════════════════════════════ */
  .main-area {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
    overflow: hidden;
  }

  .content-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .ai-chart-view,
  .dashboard-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .content-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: linear-gradient(180deg, #0f1623 0%, #0c1220 100%);
    border-bottom: 1px solid rgba(99, 110, 180, 0.15);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }

  .content-title {
    font-size: 13px;
    font-weight: 500;
    color: #6a8ac4;
    letter-spacing: 0.3px;
  }

  .ai-chart-title {
    font-size: 12px;
    font-weight: 500;
    color: #e6edf3;
  }

  .ai-chart-toggle {
    display: flex;
    position: relative;
    width: 182px;
    height: 31px;
    background: #0f1623;
    border: 1px solid #1e2d4a;
    border-radius: 999px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    transition: border-color 0.2s ease;
  }
  .ai-chart-toggle:hover {
    border-color: #2e4a7a;
  }

  .ai-chart-toggle[aria-checked="true"] {
    border-color: rgba(124, 58, 237, 0.3);
    box-shadow:
      inset -4px 0 0 rgba(124, 58, 237, 0.3),
      inset 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  .ai-chart-toggle[aria-checked="false"] {
    border-color: rgba(42, 92, 173, 0.3);
    box-shadow:
      inset -4px 0 0 rgba(42, 92, 173, 0.3),
      inset 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  .ai-toggle-slider {
    position: absolute;
    top: 2px;
    left: 2px;
    width: calc(50% - 2px);
    height: 27px;
    border-radius: 999px;
    pointer-events: none;
    transition: left 350ms cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 1;
  }
  .ai-toggle-slider.dashboard {
    background: linear-gradient(135deg, #1a3a6e 0%, #2a5cad 100%);
    box-shadow:
      0 4px 12px rgba(42, 92, 173, 0.4),
      inset 0 1px 1px rgba(255, 255, 255, 0.15);
  }
  .ai-toggle-slider.ai-chart {
    background: linear-gradient(135deg, #3a1a6e 0%, #7c3aed 100%);
    box-shadow:
      0 4px 12px rgba(124, 58, 237, 0.45),
      inset 0 1px 1px rgba(255, 255, 255, 0.15);
  }

  .ai-toggle-label {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 10px;
    font-weight: 500;
    color: #4a6a9a;
    cursor: pointer;
    z-index: 2;
    transition: color 0.2s ease;
    background: transparent;
    border: none;
  }
  .ai-toggle-label:hover {
    color: #6a8ac4;
  }
  .ai-toggle-label.active {
    color: #e6edf3;
  }
  .ai-toggle-label:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .ai-toggle-label .icon {
    font-size: 11px;
  }
  .ai-toggle-label .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  .ai-toggle-label.active .dot {
    opacity: 1;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     VIEWS GRID
  ══════════════════════════════════════════════════════════════════════════ */
  .views-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    min-height: 0;
    overflow: auto;
  }

  .view-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .view-pane.multi {
    border-right: 1px solid #1a2540;
  }
  .view-pane.multi:last-child {
    border-right: none;
  }

  .pane-bar {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 16px;
    background: #08111e;
    border-bottom: 1px solid #1a2540;
    flex-shrink: 0;
  }

  .pane-icon {
    font-size: 12px;
    color: #818cf8;
  }
  .pane-label {
    flex: 1;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #6b8aaa;
  }

  .pane-close {
    all: unset;
    cursor: pointer;
    color: #1e293b;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    transition:
      color 0.15s,
      background 0.15s;
  }

  .pane-close:hover {
    color: #64748b;
    background: #1e293b;
  }

  .pane-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     DETAIL PANEL
  ══════════════════════════════════════════════════════════════════════════ */
  .detail-panel {
    border-top: 1px solid #1a2540;
    background: #08111e;
    padding: 8px 16px;
    min-height: 52px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .detail-title {
    font-size: 11px;
    font-weight: 500;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dp-inner {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .dp-key {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #5a7a99;
    font-family: "Consolas", monospace;
  }
  .dp-title {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
  }
  .dp-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .dp-chip {
    font-size: 10.5px;
    color: #7a9ab8;
    background: #0f1a2b;
    border: 1px solid #243452;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .dp-content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dp-jql {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    width: 100%;
  }
  .dp-jql-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #6b8aaa;
    flex-shrink: 0;
  }
  .dp-jql-code {
    font-family: "Consolas", monospace;
    font-size: 11.5px;
    color: #a8c0d8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .dp-jql-link {
    font-size: 12px;
    color: #818cf8;
    text-decoration: none;
    flex-shrink: 0;
    line-height: 1;
  }
  .dp-jql-link:hover {
    text-decoration: underline;
  }

  .dp-query-row {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 12px;
  }

  .dp-build-date {
    font-size: 9px;
    color: #4e6884;
    flex-shrink: 0;
  }

  .dp-jql-tag {
    font-family: "Consolas", monospace;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }

  .dp-jql-preview {
    flex: 1;
    font-family: "Consolas", monospace;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    cursor: default;
  }

  .dp-query-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 6px;
    margin-left: auto;
    background: transparent;
    border: 0.5px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    font-family: monospace;
    font-size: 9px;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    transition:
      border-color 0.15s,
      color 0.15s,
      background 0.15s;
    flex-shrink: 0;
  }

  .dp-query-toggle:hover {
    border-color: rgba(255, 255, 255, 0.28);
    color: rgba(255, 255, 255, 0.65);
    background: rgba(255, 255, 255, 0.04);
  }

  .dp-query-toggle.active {
    border-color: rgba(120, 170, 220, 0.4);
    color: #7aaad8;
    background: rgba(55, 138, 221, 0.08);
  }

  .dp-query-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    transition: background 0.15s;
  }

  .dp-query-toggle.active .dp-query-dot {
    background: #7aaad8;
  }

  .dp-query-panel {
    max-height: 0;
    overflow: hidden;
    padding: 0 12px;
    background: #070d16;
    border-top: 0.5px solid transparent;
    transition:
      max-height 0.2s ease,
      padding 0.2s ease,
      border-color 0.2s ease;
  }

  .dp-query-panel.open {
    max-height: 60px;
    padding: 6px 12px 8px;
    border-top-color: rgba(255, 255, 255, 0.06);
  }

  .dp-query-label {
    font-family: "Consolas", monospace;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    flex-shrink: 0;
  }

  .dp-query-code {
    font-family: "Consolas", monospace;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    line-height: 1.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.query-kw) {
    color: #7ca9e0;
  }
  :global(.query-val) {
    color: #e0a97c;
  }
  :global(.query-op) {
    color: rgba(255, 255, 255, 0.3);
  }
</style>
