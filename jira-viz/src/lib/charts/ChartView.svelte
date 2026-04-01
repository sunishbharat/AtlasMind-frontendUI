<script>
  /**
   * ChartView.svelte
   * Split-panel view: chart (top/left) + AI results table (bottom/right).
   * Draggable divider resizes the split ratio.
   * Layout toggle switches between vertical and horizontal orientation.
   */
  import { chartStore } from './chartStore.svelte.js';
  import { buildAllSpecs, fromExplicitSpec } from './specBuilder.js';
  import { features } from '../features.svelte.js';
  import ChartRenderer from './ChartRenderer.svelte';

  // ── Chart specs ───────────────────────────────────────────────────────────
  const specs = $derived.by(() => {
    if (chartStore.chartSpec) {
      const opt = fromExplicitSpec(chartStore.chartSpec, features.charts.animation);
      return opt
        ? { explicit: { label: chartStore.chartSpec.title ?? 'Chart', icon: chartStore.chartSpec.type ?? 'bar', option: opt } }
        : {};
    }
    return buildAllSpecs(chartStore.issues, features.charts.maxItems, features.charts.animation);
  });

  const tabKeys = $derived(Object.keys(specs));

  let activeTab = $state(null);
  $effect(() => {
    if (tabKeys.length) {
      const preferred = tabKeys.find(k => k.startsWith(features.charts.defaultType));
      activeTab = preferred ?? tabKeys[0];
    }
  });

  const currentOption = $derived(activeTab ? specs[activeTab]?.option ?? {} : {});

  // ── Table data ────────────────────────────────────────────────────────────
  const issues       = $derived(chartStore.issues ?? []);
  const displayFields = $derived(chartStore.data?.display_fields ?? []);
  const hasTable     = $derived(issues.length > 0);

  // ── Layout state ──────────────────────────────────────────────────────────
  // 'vertical'  → chart on top,  table on bottom
  // 'horizontal'→ chart on left, table on right
  let layout    = $state('vertical');
  let splitPct  = $state(55);          // % given to the chart pane

  // ── Drag-to-resize ────────────────────────────────────────────────────────
  let container;
  let dragging = $state(false);

  function onDividerDown(e) {
    e.preventDefault();
    dragging = true;

    function onMove(ev) {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (layout === 'vertical') {
        const pct = ((ev.clientY - rect.top) / rect.height) * 100;
        splitPct = Math.min(80, Math.max(20, pct));
      } else {
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;
        splitPct = Math.min(80, Math.max(20, pct));
      }
    }

    function onUp() {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function toggleLayout() {
    layout = layout === 'vertical' ? 'horizontal' : 'vertical';
    splitPct = 55;
  }
</script>

<div class="chart-view" class:dragging>
  {#if tabKeys.length || hasTable}

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="cv-header">
      {#if chartStore.query}
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
          <circle cx="7" cy="7" r="6" stroke="#818cf8" stroke-width="1.3"/>
          <path d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z" fill="#818cf8"/>
          <circle cx="7" cy="11" r=".7" fill="#818cf8"/>
        </svg>
        <span class="cv-query-text">{chartStore.query}</span>
        <span class="cv-count">{issues.length} issues</span>
      {/if}

      <!-- Layout toggle -->
      <button class="cv-layout-btn" onclick={toggleLayout} title="Toggle layout">
        {#if layout === 'vertical'}
          <!-- Horizontal split icon -->
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
            <rect x="1" y="7.5" width="12" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          Split Horizontal
        {:else}
          <!-- Vertical split icon -->
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5.5" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
            <rect x="7.5" y="1" width="5.5" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          Split Vertical
        {/if}
      </button>
    </div>

    <!-- ── Split container ────────────────────────────────────────────────── -->
    <div
      class="cv-split"
      class:cv-split--h={layout === 'horizontal'}
      bind:this={container}
    >

      <!-- Chart pane -->
      <div
        class="cv-pane cv-pane--chart"
        style="{layout === 'vertical' ? 'height' : 'width'}:{splitPct}%"
      >
        {#if tabKeys.length}
          <div class="cv-tabs">
            {#each tabKeys as key}
              <button
                class="cv-tab"
                class:active={activeTab === key}
                onclick={() => (activeTab = key)}
              >
                {#if specs[key].icon === 'pie'}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M5 5V1A4 4 0 1 0 9 5z" fill="currentColor" opacity=".6"/>
                    <path d="M5 5H9A4 4 0 0 0 5 1z" fill="currentColor"/>
                  </svg>
                {:else if specs[key].icon === 'line'}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <polyline points="1,8 3.5,4 6,6 9,1" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <rect x=".5" y="5"   width="2.5" height="4.5" rx=".5" fill="currentColor"/>
                    <rect x="3.8" y="2.5" width="2.5" height="7"   rx=".5" fill="currentColor"/>
                    <rect x="7"   y=".5"  width="2.5" height="9"   rx=".5" fill="currentColor"/>
                  </svg>
                {/if}
                {specs[key].label}
              </button>
            {/each}
          </div>

          <div class="cv-chart-area">
            <ChartRenderer option={currentOption} height="100%" />
          </div>
        {:else}
          <div class="cv-empty-chart">No chart data</div>
        {/if}
      </div>

      <!-- Draggable divider -->
      <div
        class="cv-divider"
        class:cv-divider--h={layout === 'horizontal'}
        role="separator"
        aria-orientation={layout === 'vertical' ? 'horizontal' : 'vertical'}
        onmousedown={onDividerDown}
      >
        <span class="cv-divider-dots"></span>
      </div>

      <!-- Table pane -->
      <div class="cv-pane cv-pane--table">
        {#if hasTable}
          <div class="cv-table-header">
            <span class="cv-table-label">Results</span>
            {#if chartStore.data?.jql}
              <code class="cv-jql" title={chartStore.data.jql}>{chartStore.data.jql}</code>
            {/if}
            {#if chartStore.data?.shown != null}
              <span class="cv-table-count">{chartStore.data.shown} / {chartStore.data.total}</span>
            {/if}
          </div>
          <div class="cv-table-wrap">
            <table class="cv-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Summary</th>
                  {#each displayFields as col}
                    <th>{col[0].toUpperCase() + col.slice(1).replace(/_/g, ' ')}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each issues as issue}
                  <tr>
                    <td class="cell-key">
                      {#if chartStore.data?.jira_base_url}
                        <a
                          href="{chartStore.data.jira_base_url}/browse/{issue.key}"
                          target="_blank"
                          rel="noreferrer"
                        >{issue.key}</a>
                      {:else}
                        {issue.key}
                      {/if}
                    </td>
                    <td class="cell-summary" title={issue.summary}>{issue.summary}</td>
                    {#each displayFields as col}
                      <td>{issue[col] || '—'}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="cv-empty-table">Table results will appear here</div>
        {/if}
      </div>

    </div>

  {:else}
    <!-- Empty state -->
    <div class="cv-empty">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity=".2">
        <rect x="4"  y="22" width="8"  height="14" rx="2" fill="#818cf8"/>
        <rect x="16" y="12" width="8"  height="24" rx="2" fill="#818cf8"/>
        <rect x="28" y="4"  width="8"  height="32" rx="2" fill="#818cf8"/>
      </svg>
      <p class="cv-empty-title">No results yet</p>
      <p class="cv-empty-hint">Ask a question in the AI chat — charts and table will appear here automatically.</p>
    </div>
  {/if}
</div>

<style>
  /* ── Shell ───────────────────────────────────────────────────────────────── */
  .chart-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 10px 14px 10px;
    box-sizing: border-box;
    gap: 8px;
    overflow: hidden;
  }

  .chart-view.dragging { user-select: none; cursor: row-resize; }
  .chart-view.dragging.cv-split--h { cursor: col-resize; }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .cv-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 0;
  }

  .cv-query-text {
    font-size: 11.5px;
    color: #64748b;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .cv-count {
    font-size: 10px;
    font-weight: 700;
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    padding: 2px 7px;
    border-radius: 999px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .cv-layout-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid #1e293b;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #475569;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .cv-layout-btn:hover {
    color: #94a3b8;
    border-color: #334155;
    background: rgba(255,255,255,0.03);
  }

  /* ── Split container ─────────────────────────────────────────────────────── */
  .cv-split {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;  /* vertical: stacked */
    gap: 0;
    overflow: hidden;
  }

  .cv-split--h {
    flex-direction: row;     /* horizontal: side-by-side */
  }

  /* ── Panes ───────────────────────────────────────────────────────────────── */
  .cv-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  /* chart pane uses explicit size from splitPct; table pane takes the rest */
  .cv-pane--chart { flex-shrink: 0; }
  .cv-pane--table { flex: 1; }

  /* ── Tabs ────────────────────────────────────────────────────────────────── */
  .cv-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex-shrink: 0;
    padding: 0 0 6px;
    border-bottom: 1px solid #1e293b;
  }

  .cv-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 500;
    color: #475569;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }
  .cv-tab:hover { color: #94a3b8; background: rgba(255,255,255,0.04); }
  .cv-tab.active {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    border-color: rgba(129, 140, 248, 0.25);
  }

  /* ── Chart area ──────────────────────────────────────────────────────────── */
  .cv-chart-area {
    flex: 1;
    min-height: 0;
  }

  /* ── Divider ─────────────────────────────────────────────────────────────── */
  .cv-divider {
    flex-shrink: 0;
    height: 6px;
    background: transparent;
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    position: relative;
  }

  .cv-divider:hover,
  .cv-divider:active {
    background: rgba(129, 140, 248, 0.08);
  }

  .cv-divider::before {
    content: '';
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 1px;
    background: #1e293b;
  }

  .cv-divider-dots {
    width: 28px;
    height: 3px;
    border-radius: 999px;
    background: #1e3a5f;
    position: relative;
    z-index: 1;
    transition: background 0.15s;
  }

  .cv-divider:hover .cv-divider-dots { background: #818cf8; }

  /* horizontal divider */
  .cv-divider--h {
    height: auto;
    width: 6px;
    cursor: col-resize;
    flex-direction: column;
  }

  .cv-divider--h::before {
    top: 0; bottom: 0; left: 50%; right: auto;
    transform: translateX(-50%);
    width: 1px;
    height: auto;
  }

  .cv-divider--h .cv-divider-dots {
    width: 3px;
    height: 28px;
  }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .cv-table-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 2px 5px;
    flex-shrink: 0;
    border-top: none;
    min-width: 0;
  }

  .cv-table-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #334155;
    flex-shrink: 0;
  }

  .cv-jql {
    font-family: 'Consolas', monospace;
    font-size: 9.5px;
    color: #334155;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .cv-table-count {
    font-size: 10px;
    font-weight: 700;
    color: #818cf8;
    flex-shrink: 0;
  }

  .cv-table-wrap {
    flex: 1;
    overflow: auto;
    border: 1px solid #1e293b;
    border-radius: 5px;
    scrollbar-width: thin;
    scrollbar-color: #1e293b transparent;
  }

  .cv-table {
    border-collapse: collapse;
    font-size: 10px;
    width: 100%;
    white-space: nowrap;
  }

  .cv-table thead tr { background: #0f172a; }

  .cv-table th {
    padding: 5px 10px;
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #334155;
    border-bottom: 1px solid #1e293b;
    position: sticky;
    top: 0;
    background: #0f172a;
  }

  .cv-table td {
    padding: 5px 10px;
    color: #94a3b8;
    border-bottom: 1px solid #0f172a;
    vertical-align: middle;
  }

  .cv-table tbody tr:last-child td { border-bottom: none; }
  .cv-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

  .cell-key a {
    color: #818cf8;
    text-decoration: none;
    font-weight: 700;
    font-family: 'Consolas', monospace;
  }
  .cell-key a:hover { text-decoration: underline; }

  .cell-summary {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #cbd5e1;
  }

  /* ── Mini empty states ───────────────────────────────────────────────────── */
  .cv-empty-chart,
  .cv-empty-table {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #1e293b;
  }

  /* ── Full empty state ────────────────────────────────────────────────────── */
  .cv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    padding: 32px;
  }

  .cv-empty-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #334155;
  }

  .cv-empty-hint {
    margin: 0;
    font-size: 11.5px;
    color: #1e293b;
    line-height: 1.6;
    max-width: 260px;
  }
</style>
