<script lang="ts">
  // Split-panel view: chart (top/left) + AI results table (bottom/right).
  // Draggable divider resizes the split ratio.
  // Layout toggle switches between vertical and horizontal orientation.
  import type { ApiIssue } from './chartStore.svelte.js';
  import type { SpecEntry } from './specBuilder.js';
  import { chartStore } from './chartStore.svelte.js';
  import { buildAllSpecs, fromExplicitSpec } from './specBuilder.js';
  import { features } from '../features.svelte.js';
  import ChartRenderer from './ChartRenderer.svelte';
  import AIHierarchyView from './AIHierarchyView.svelte';

  // - Table data ---------------------------------------------------------------
  const issues        = $derived(chartStore.issues ?? []);
  const displayFields = $derived(chartStore.data?.display_fields ?? []);
  const hasTable      = $derived(issues.length > 0);

  // - Filters ------------------------------------------------------------------
  const DATE_KEYS = new Set(['created', 'resolutiondate', 'updated', 'duedate', 'resolutionDate', 'createdDate']);

  function isDateLike(key: string, sample: unknown): boolean {
    return DATE_KEYS.has(key) || DATE_KEYS.has(key.toLowerCase()) || /^\d{4}-\d{2}-\d{2}/.test(String(sample ?? ''));
  }

  function toDateKey(str: string): string | null {
    try {
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    } catch { return null; }
  }

  function fmtDateKey(key: string): string {
    if (!key || key === 'Not set') return key ?? 'Not set';
    const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return key;
    const [, y, mo, d] = m.map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  interface FilterInfo { values: string[]; isDate: boolean }

  const filterableMap = $derived.by((): Record<string, FilterInfo> => {
    const map: Record<string, FilterInfo> = {};
    if (!issues.length) return map;
    for (const key of displayFields) {
      const sample  = issues.find(i => i[key] != null)?.[key];
      const dateCol = isDateLike(key, sample);
      const keys    = issues.map(i => {
        const v = i[key];
        if (v == null || v === '') return 'Not set';
        if (dateCol) return toDateKey(String(v)) ?? 'Not set';
        return String(v);
      });
      const values = [...new Set(keys)].sort((a, b) => {
        if (a === 'Not set') return 1;
        if (b === 'Not set') return -1;
        return a.localeCompare(b);
      });
      if (values.length >= 2) map[key] = { values, isDate: dateCol };
    }
    return map;
  });

  let activeFilters = $state<Record<string, Set<string>>>({});
  let openFilter    = $state<string | null>(null);
  let filterSearch  = $state('');

  const filteredIssues = $derived.by((): ApiIssue[] => {
    const active = Object.entries(activeFilters).filter(([, s]) => s.size > 0);
    if (!active.length) return issues;
    return issues.filter(issue =>
      active.every(([key, vals]) => {
        const info = filterableMap[key];
        const raw  = issue[key];
        let val: string;
        if (raw == null || raw === '') val = 'Not set';
        else if (info?.isDate) val = toDateKey(String(raw)) ?? 'Not set';
        else val = String(raw);
        return vals.has(val);
      }),
    );
  });

  const hasActiveFilters = $derived(Object.values(activeFilters).some(s => s.size > 0));

  // - Chart specs --------------------------------------------------------------
  let reactToFilters = $state(false);

  const specs = $derived.by((): Record<string, SpecEntry> => {
    const src = reactToFilters && hasActiveFilters ? filteredIssues : issues;
    if (chartStore.chartSpec) {
      const opt = fromExplicitSpec(chartStore.chartSpec, features.charts.animation);
      return opt
        ? { explicit: { label: chartStore.chartSpec.title ?? 'Chart', icon: chartStore.chartSpec.type ?? 'bar', option: opt } }
        : {};
    }
    return buildAllSpecs(src, features.charts.maxItems, features.charts.animation);
  });

  const tabKeys = $derived(Object.keys(specs));

  let activeTab = $state<string | null>(null);
  $effect(() => {
    if (!tabKeys.length) return;
    if (!activeTab || !tabKeys.includes(activeTab)) {
      const preferred = tabKeys.find(k => k.startsWith(features.charts.defaultType));
      activeTab = preferred ?? tabKeys[0];
    }
  });

  const currentOption = $derived(activeTab ? specs[activeTab]?.option ?? {} : {});

  function openDropdown(col: string): void {
    openFilter   = openFilter === col ? null : col;
    filterSearch = '';
  }

  function toggleFilterValue(field: string, value: string): void {
    const next = new Set(activeFilters[field] ?? []);
    next.has(value) ? next.delete(value) : next.add(value);
    activeFilters = { ...activeFilters, [field]: next };
  }

  function clearColumnFilter(field: string): void {
    const { [field]: _, ...rest } = activeFilters;
    activeFilters = rest;
  }

  function clearAllFilters(): void { activeFilters = {}; }

  // - Column sort --------------------------------------------------------------
  let sortCol = $state<string | null>(null);
  let sortDir = $state<'asc' | 'desc'>('asc');

  function toggleSort(col: string): void {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = 'asc';
    }
  }

  const sortedIssues = $derived.by((): ApiIssue[] => {
    if (!sortCol) return filteredIssues;
    const col = sortCol;
    return [...filteredIssues].sort((a, b) => {
      const info = filterableMap[col];
      const av   = a[col] ?? '';
      const bv   = b[col] ?? '';
      if (info?.isDate || isDateLike(col, av)) {
        const ad = av ? new Date(String(av)).getTime() : 0;
        const bd = bv ? new Date(String(bv)).getTime() : 0;
        return sortDir === 'asc' ? ad - bd : bd - ad;
      }
      const an = Number(av), bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an;
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  });

  let tableMode = $state<'table' | 'hierarchy'>('table');

  $effect(() => {
    function onDoc(e: MouseEvent) { if (!(e.target as Element).closest('.cv-col-filter')) openFilter = null; }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  });

  // - Layout state -------------------------------------------------------------
  let layout    = $state<'vertical' | 'horizontal'>('vertical');
  let splitPct  = $state(55);
  let container = $state<HTMLDivElement | undefined>(undefined);
  let dragging  = $state(false);

  function onDividerDown(e: MouseEvent): void {
    e.preventDefault();
    dragging = true;

    function onMove(ev: MouseEvent): void {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (layout === 'vertical') {
        splitPct = Math.min(80, Math.max(20, ((ev.clientY - rect.top)  / rect.height) * 100));
      } else {
        splitPct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width)  * 100));
      }
    }

    function onUp(): void {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }

  function toggleLayout(): void {
    layout   = layout === 'vertical' ? 'horizontal' : 'vertical';
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
          <div class="cv-tabs-row">
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

          <!-- React-to-filters toggle -->
          <button
            class="cv-react-btn"
            class:active={reactToFilters}
            onclick={() => (reactToFilters = !reactToFilters)}
            title={reactToFilters ? 'Chart reacting to table filters — click to unlock' : 'Chart showing all data — click to sync with filters'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 2.5h8M2.5 5h5M4 7.5h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            {reactToFilters ? 'Synced' : 'Sync chart'}
            {#if reactToFilters && hasActiveFilters}
              <span class="cv-react-dot"></span>
            {/if}
          </button>

          </div>

          <div class="cv-chart-area">
            <ChartRenderer option={currentOption} height="100%" />
          </div>
        {:else}
          <div class="cv-empty-chart">No chart data</div>
        {/if}
      </div>

      <!-- Draggable divider -->
      <button
        type="button"
        class="cv-divider"
        class:cv-divider--h={layout === 'horizontal'}
        aria-label="Resize panels"
        onmousedown={onDividerDown}
        onkeydown={(e) => {
          const step = 5;
          if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  splitPct = Math.max(20, splitPct - step);
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') splitPct = Math.min(80, splitPct + step);
        }}
      >
        <span class="cv-divider-dots"></span>
      </button>

      <!-- Table pane -->
      <div class="cv-pane cv-pane--table">
        {#if hasTable}
          <div class="cv-table-header">
            <span class="cv-table-label">Results</span>
            {#if chartStore.data?.jql}
              <code class="cv-jql" title={chartStore.data.jql}>{chartStore.data.jql}</code>
            {/if}
            {#if chartStore.data?.jira_base_url && chartStore.data?.jql}
              <a
                class="cv-table-count cv-table-count--link"
                href="{chartStore.data.jira_base_url}/issues/?jql={encodeURIComponent(chartStore.data.jql)}"
                target="_blank"
                rel="noreferrer"
                title="Open in Jira"
              >
                {hasActiveFilters ? `${filteredIssues.length} of ` : ''}{chartStore.data?.shown ?? issues.length}{chartStore.data?.total ? ` / ${chartStore.data.total}` : ''}
              </a>
            {:else}
              <span class="cv-table-count">
                {hasActiveFilters ? `${filteredIssues.length} of ` : ''}{chartStore.data?.shown ?? issues.length}{chartStore.data?.total ? ` / ${chartStore.data.total}` : ''}
              </span>
            {/if}
            {#if hasActiveFilters}
              <button class="cv-clear-all" onclick={clearAllFilters} title="Clear all filters">✕ Clear filters</button>
            {/if}
            <!-- View mode toggle -->
            <div class="cv-view-toggle">
              <button
                class="cv-view-btn"
                class:active={tableMode === 'table'}
                onclick={() => (tableMode = 'table')}
                title="Table view"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1" y="1" width="8" height="2" rx=".5" fill="currentColor"/>
                  <rect x="1" y="4" width="8" height="2" rx=".5" fill="currentColor" opacity=".6"/>
                  <rect x="1" y="7" width="8" height="2" rx=".5" fill="currentColor" opacity=".35"/>
                </svg>
                Table
              </button>
              <button
                class="cv-view-btn"
                class:active={tableMode === 'hierarchy'}
                onclick={() => (tableMode = 'hierarchy')}
                title="Hierarchy view"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="2" cy="5" r="1.2" fill="currentColor"/>
                  <circle cx="5" cy="2.5" r="1.2" fill="currentColor"/>
                  <circle cx="5" cy="7.5" r="1.2" fill="currentColor"/>
                  <circle cx="8" cy="5" r="1.2" fill="currentColor"/>
                  <line x1="3.2" y1="5" x2="3.8" y2="2.5" stroke="currentColor" stroke-width="1"/>
                  <line x1="3.2" y1="5" x2="3.8" y2="7.5" stroke="currentColor" stroke-width="1"/>
                  <line x1="6.2" y1="2.5" x2="6.8" y2="5" stroke="currentColor" stroke-width="1"/>
                  <line x1="6.2" y1="7.5" x2="6.8" y2="5" stroke="currentColor" stroke-width="1"/>
                </svg>
                Hierarchy
              </button>
            </div>
          </div>

          {#if tableMode === 'hierarchy'}
            <AIHierarchyView
              issues={sortedIssues}
              jiraBaseUrl={chartStore.data?.jira_base_url ?? ''}
            />
          {:else}
          <div class="cv-table-wrap">
            <table class="cv-table">
              <thead>
                <tr>
                  <th onclick={() => toggleSort('key')} class="th-sortable" class:th-sorted={sortCol === 'key'}>
                    <div class="th-inner">
                      <span class="th-label">Key</span>
                      <span class="sort-icon">{sortCol === 'key' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </div>
                  </th>
                  <th onclick={() => toggleSort('summary')} class="th-sortable" class:th-sorted={sortCol === 'summary'}>
                    <div class="th-inner">
                      <span class="th-label">Summary</span>
                      <span class="sort-icon">{sortCol === 'summary' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </div>
                  </th>
                  {#each displayFields as col}
                    {@const colInfo   = filterableMap[col]}
                    {@const colFilter = activeFilters[col]}
                    {@const isFiltered = (colFilter?.size ?? 0) > 0}
                    <th class:th-filtered={isFiltered} class:th-sorted={sortCol === col} class="th-sortable" onclick={() => toggleSort(col)}>
                      <div class="th-inner">
                        <span class="th-label">{col[0].toUpperCase() + col.slice(1).replace(/_/g, ' ')}</span>
                        <span class="sort-icon">{sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        {#if colInfo}
                          <div class="cv-col-filter">
                            <button
                              class="col-filter-btn"
                              class:active={isFiltered}
                              onclick={(e) => { e.stopPropagation(); openDropdown(col); }}
                              onmousedown={(e) => e.stopPropagation()}
                              title="Filter {col}"
                            >
                              {#if isFiltered}
                                <span class="col-filter-badge">{colFilter.size}</span>
                              {:else}
                                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                                  <path d="M1 2h8M2.5 5h5M4 8h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                                </svg>
                              {/if}
                            </button>
                            {#if openFilter === col}
                              <div class="col-filter-menu">
                                <div class="col-filter-head">
                                  <span>{col[0].toUpperCase() + col.slice(1).replace(/_/g, ' ')}</span>
                                  {#if isFiltered}
                                    <button class="col-filter-reset" onclick={() => clearColumnFilter(col)}>Reset</button>
                                  {/if}
                                </div>
                                {#if colInfo.values.length > 8}
                                  <div class="col-filter-search">
                                    <input
                                      class="col-filter-input"
                                      type="text"
                                      placeholder="Search…"
                                      bind:value={filterSearch}
                                      onclick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                {/if}
                                <div class="col-filter-list">
                                {#each colInfo.values.filter(v => !filterSearch || fmtDateKey(v).toLowerCase().includes(filterSearch.toLowerCase())) as val}
                                  {@const checked = colFilter?.has(val) ?? false}
                                  <button
                                    class="col-filter-item"
                                    class:checked
                                    onclick={() => toggleFilterValue(col, val)}
                                  >
                                    <span class="col-filter-check" class:checked>
                                      {#if checked}
                                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                          <path d="M1 4l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                      {/if}
                                    </span>
                                    <span class="col-filter-val">{fmtDateKey(val)}</span>
                                    <span class="col-filter-count">
                                      {issues.filter(i => {
                                        const raw = i[col];
                                        const v = (raw == null || raw === '') ? 'Not set'
                                          : colInfo.isDate ? (toDateKey(String(raw)) ?? 'Not set')
                                          : String(raw);
                                        return v === val;
                                      }).length}
                                    </span>
                                  </button>
                                {/each}
                                </div>
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each sortedIssues as issue}
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
          {/if}
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
  .chart-view.dragging:has(.cv-split--h) { cursor: col-resize; }

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

  /* ── Tabs row ────────────────────────────────────────────────────────────── */
  .cv-tabs-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 6px;
  }

  /* ── Tabs ────────────────────────────────────────────────────────────────── */
  .cv-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex: 1;
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

  /* ── React-to-filters toggle ─────────────────────────────────────────────── */
  .cv-react-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 5px;
    border: 1px solid #1e293b;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #334155;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }

  .cv-react-btn:hover {
    color: #64748b;
    border-color: #334155;
  }

  .cv-react-btn.active {
    color: #818cf8;
    border-color: rgba(129, 140, 248, 0.4);
    background: rgba(129, 140, 248, 0.08);
  }

  .cv-react-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #818cf8;
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  /* ── Chart area ──────────────────────────────────────────────────────────── */
  .cv-chart-area {
    flex: 1;
    min-height: 0;
  }

  /* ── Divider ─────────────────────────────────────────────────────────────── */
  .cv-divider {
    all: unset;
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

  /* ── Column filters ──────────────────────────────────────────────────────── */
  .cv-clear-all {
    margin-left: auto;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-size: 10px;
    color: #334155;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .cv-clear-all:hover { color: #f87171; }

  /* th sort */
  .th-sortable { cursor: pointer; user-select: none; }
  .th-sortable:hover { color: #64748b !important; }
  .th-sorted { color: #818cf8 !important; background: rgba(129,140,248,0.06) !important; }

  .sort-icon {
    font-size: 9px;
    color: #1e3a5f;
    flex-shrink: 0;
    transition: color 0.12s;
    line-height: 1;
  }
  .th-sorted .sort-icon { color: #818cf8; }
  .th-sortable:hover .sort-icon { color: #475569; }

  /* th layout */
  .th-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .th-label { flex: 1; }
  .th-filtered { color: #818cf8 !important; background: rgba(129,140,248,0.06) !important; }

  /* filter trigger button inside th */
  .cv-col-filter { position: relative; }

  .col-filter-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: none;
    background: none;
    cursor: pointer;
    color: #2d3f55;
    padding: 0;
    transition: color 0.12s, background 0.12s;
    flex-shrink: 0;
  }
  .col-filter-btn:hover { color: #64748b; background: rgba(255,255,255,0.06); }
  .col-filter-btn.active { color: #818cf8; }

  .col-filter-badge {
    font-size: 9px;
    font-weight: 700;
    color: #818cf8;
    line-height: 1;
  }

  /* dropdown menu */
  .col-filter-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 160px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 7px;
    box-shadow: 0 10px 30px rgba(0,0,0,.6);
    z-index: 200;
    overflow: hidden;
  }

  .col-filter-list {
    max-height: 200px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e293b transparent;
  }

  .col-filter-search {
    padding: 5px 8px;
    border-bottom: 1px solid #1e293b;
  }

  .col-filter-input {
    width: 100%;
    background: #070f1c;
    border: 1px solid #1e293b;
    border-radius: 4px;
    color: #94a3b8;
    font-size: 11px;
    padding: 4px 7px;
    outline: none;
    box-sizing: border-box;
  }

  .col-filter-input::placeholder { color: #334155; }
  .col-filter-input:focus { border-color: #334155; }

  .col-filter-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #334155;
    border-bottom: 1px solid #1e293b;
  }

  .col-filter-reset {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 9.5px;
    color: #475569;
    padding: 0;
    transition: color 0.12s;
  }
  .col-filter-reset:hover { color: #f87171; }

  .col-filter-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: #64748b;
    text-align: left;
    transition: background 0.1s, color 0.1s;
  }
  .col-filter-item:hover { background: rgba(255,255,255,0.04); color: #94a3b8; }
  .col-filter-item.checked { color: #e2e8f0; }

  .col-filter-check {
    width: 13px;
    height: 13px;
    border-radius: 3px;
    border: 1px solid #1e293b;
    background: #070f1c;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #818cf8;
    transition: border-color 0.12s, background 0.12s;
  }
  .col-filter-check.checked {
    border-color: rgba(129,140,248,0.5);
    background: rgba(129,140,248,0.15);
  }

  .col-filter-val { flex: 1; }

  .col-filter-count {
    font-size: 9px;
    color: #1e3a5f;
    font-weight: 600;
  }

  /* ── View mode toggle ────────────────────────────────────────────────────── */
  .cv-view-toggle {
    display: flex;
    gap: 2px;
    margin-left: auto;
    background: rgba(255,255,255,0.03);
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 2px;
    flex-shrink: 0;
  }

  .cv-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 4px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #475569;
    transition: color 0.12s, background 0.12s;
  }
  .cv-view-btn:hover { color: #94a3b8; }
  .cv-view-btn.active {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.15);
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
  .cv-table-count--link {
    text-decoration: none;
    cursor: pointer;
  }
  .cv-table-count--link:hover {
    text-decoration: underline;
    color: #a5b4fc;
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
