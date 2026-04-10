<script lang="ts">
  import type { ComponentType } from 'svelte';
  import HierarchyView from "./views/HierarchyView.svelte";
  import TableView from "./views/TableView.svelte";
  import ChatPanel from "./ChatPanel.svelte";
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
  let chatOpen    = $state(false);
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
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <polygon
            points="9,2 16,6 16,12 9,16 2,12 2,6"
            stroke="#818cf8"
            stroke-width="1.4"
            fill="rgba(129,140,248,0.08)"
          />
          <polygon
            points="9,5 13,7.5 13,11.5 9,14 5,11.5 5,7.5"
            fill="#818cf8"
            opacity="0.3"
          />
        </svg>
      </div>
      <span class="brand-tag">AtlasMind</span>
      <span class="brand-divider"></span>
      <div class="brand-title">
        <span class="brand-sprint">{sprintName}</span>
        <span class="brand-sub">Issue Explorer</span>
      </div>
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
  </div>

  <!-- ════════════════════════════════════════════════════════════════════════
       ROW 2 — Data Input  (user-editable: load / swap data)
  ═════════════════════════════════════════════════════════════════════════ -->
  <div class="hrow hrow-data">
    <span class="row-label">Data</span>
    <div class="row-sep"></div>

    <div class="data-right">
      <div class="data-right-row">
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

  <!-- ════════════════════════════════════════════════════════════════════════
       ROW 3 — Controls  (view selector + future filter dropdowns)
  ═════════════════════════════════════════════════════════════════════════ -->
  <div class="hrow hrow-controls">
    <span class="row-label">View</span>
    <div class="row-sep"></div>

    <!-- View tab buttons - chart view is excluded (switches automatically via AI) -->
    <div class="view-tabs">
      {#each VIEWS.filter(v => v.id !== 'chart') as view}
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

    <button
      class="ask-ai-btn"
      class:active={chatOpen}
      onclick={() => (chatOpen = !chatOpen)}
    >
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.3" />
        <path
          d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z"
          fill="currentColor"
        />
        <circle cx="7" cy="11" r=".7" fill="currentColor" />
      </svg>
      Ask AI
    </button>
  </div>

  <!-- ── Main content area (views + chat panel side by side) ───────────── -->
  <div class="main-area">
    <!-- Left: visualisation column -->
    <div class="content-col">
      <div class="views-grid" style="--cols:{activeViews.length}">
        {#each activeViews as view (view.id)}
          {@const Component = view.component}
          <div class="view-pane" class:multi={activeViews.length > 1}>
            {#if activeViews.length > 1}
              <div class="pane-bar">
                <span class="pane-icon">{view.icon}</span>
                <span class="pane-label">{view.label}</span>
                <button
                  class="pane-close"
                  onclick={() => removeView(view.id)}
                  aria-label="Close {view.label}"
                >
                  <svg width="9" height="9" viewBox="0 0 10 10"
                    ><path
                      d="M2 2l6 6M8 2l-6 6"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    /></svg
                  >
                </button>
              </div>
            {/if}
            <div class="pane-content">
              <Component />
            </div>
          </div>
        {/each}
      </div>

      <!-- Detail panel -->
      <div class="detail-panel">
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
        {:else}
          {#if chartStore.data?.jql}
            <div class="dp-jql">
              <span class="dp-jql-label">JQL</span>
              <code class="dp-jql-code" title={chartStore.data.jql}>{chartStore.data.jql}</code>
              {#if chartStore.data.jira_base_url}
                <a
                  class="dp-jql-link"
                  href="{chartStore.data.jira_base_url}/issues/?jql={encodeURIComponent(chartStore.data.jql)}"
                  target="_blank"
                  rel="noopener"
                  title="Open in Jira"
                >↗</a>
              {/if}
            </div>
          {:else}
            <span class="dp-hint">Hover a card to explore connections</span>
          {/if}
        {/if}
      </div>
    </div>

    <!-- Right: chat panel -->
    <ChatPanel open={chatOpen} />
  </div>
</div>

<div class="build-badge">Built {new Date(__BUILD_TIME__).toLocaleString()}</div>

<style>
  /* ── Shell ──────────────────────────────────────────────────────────────── */
  .shell {
    width: 100%;
    height: 100svh;
    background: #0c1220;
    color: #e2e8f0;
    font-family: system-ui, "Segoe UI", sans-serif;
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

  .brand-left {
    display: flex;
    align-items: center;
    gap: 12px;
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
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
    line-height: 1;
  }

  .brand-sub {
    font-size: 10px;
    color: #334155;
    letter-spacing: 0.04em;
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
    color: #64748b;
    line-height: 1;
  }

  .stat-pill-label {
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #334155;
  }

  .build-badge {
    position: fixed;
    bottom: 6px;
    left: 10px;
    font-size: 9px;
    color: #ffffff;
    opacity: 0.5;
    letter-spacing: 0.02em;
    pointer-events: none;
    z-index: 9999;
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
    color: #475569;
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
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #334155;
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
    color: #334155;
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
    color: #475569;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, background 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .view-tab:hover {
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.04);
  }

  .view-tab.active {
    color: #e2e8f0;
    background: rgba(129, 140, 248, 0.1);
    border-color: rgba(129, 140, 248, 0.2);
  }

  .view-tab-icon {
    font-size: 13px;
    color: #818cf8;
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
    letter-spacing: 0.05em;
    color: #475569;
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
    padding: 11px 32px;
    min-height: 52px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
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
    letter-spacing: 0.08em;
    color: #334155;
    font-family: monospace;
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
    color: #64748b;
    background: #0f172a;
    border: 1px solid #1e293b;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .dp-hint {
    font-size: 11px;
    color: #1e293b;
    font-style: italic;
  }

  .dp-jql {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    width: 100%;
  }
  .dp-jql-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #475569;
    flex-shrink: 0;
  }
  .dp-jql-code {
    font-family: 'Consolas', monospace;
    font-size: 11px;
    color: #94a3b8;
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
  .dp-jql-link:hover { text-decoration: underline; }
</style>
