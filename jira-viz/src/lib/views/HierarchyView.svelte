<script lang="ts">
  import { onMount } from 'svelte';
  import { STATUS_STYLE } from '../data.js';
  import { dataStore } from '../dataStore.svelte.js';
  import { chartStore } from '../charts/index.js';
  import { vizState } from '../state.svelte.js';
  import ChartRenderer from '../charts/ChartRenderer.svelte';
  import { StackedBarChart } from '../charts/StackedBarChart.js';
  import type { ApiIssue } from '../charts/chartStore.svelte.js';

  // TODO: remove — temporary stacked bar demo on hierarchy view
  const demoStackedOpt = $derived.by(() => {
    const issues = [
      ...dataStore.epics    as unknown as ApiIssue[],
      ...dataStore.stories  as unknown as ApiIssue[],
      ...dataStore.subtasks as unknown as ApiIssue[],
    ];
    return StackedBarChart.fromIssues(issues, 'assignee', 'status', 'count', 'Status by Assignee (demo)');
  });

  // - Adjacency map - recomputed whenever connections change ------------------
  const adj = $derived.by((): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { from, to } of dataStore.connections) {
      (map[from] ??= []).push(to);
      (map[to]   ??= []).push(from);
    }
    return map;
  });

  // Sort each column: issues with connections first (most connections → top)
  const connCount = (id: string) => adj[id]?.length ?? 0;
  const sortedEpics    = $derived([...dataStore.epics   ].sort((a, b) => connCount(b.id) - connCount(a.id)));
  const sortedStories  = $derived([...dataStore.stories ].sort((a, b) => connCount(b.id) - connCount(a.id)));
  const sortedSubtasks = $derived([...dataStore.subtasks].sort((a, b) => connCount(b.id) - connCount(a.id)));

  // - DOM refs and positions --------------------------------------------------
  let containerEl: HTMLDivElement;
  const nodeEls: Record<string, HTMLButtonElement> = {};
  interface NodePos { left: number; right: number; cy: number }
  let positions = $state<Record<string, NodePos>>({});
  let svgW = $state(0);
  let svgH = $state(0);

  function ref(el: HTMLButtonElement, id: string) {
    nodeEls[id] = el;
    return { destroy() { delete nodeEls[id]; } };
  }

  function computePositions(): void {
    if (!containerEl) return;
    const cr = containerEl.getBoundingClientRect();
    const p: Record<string, NodePos> = {};
    for (const [id, el] of Object.entries(nodeEls)) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      p[id] = { left: r.left - cr.left, right: r.right - cr.left, cy: r.top - cr.top + r.height / 2 };
    }
    positions = p;
    svgW = containerEl.offsetWidth;
    svgH = containerEl.offsetHeight;
  }

  onMount(() => {
    requestAnimationFrame(computePositions);
    const ro = new ResizeObserver(computePositions);
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  // Recompute positions when sorted order changes (connections or data swap)
  $effect(() => {
    sortedEpics; sortedStories; sortedSubtasks;
    requestAnimationFrame(computePositions);
  });

  const maxColCount = $derived(Math.max(
    dataStore.epics.length,
    dataStore.stories.length,
    dataStore.subtasks.length,
  ));

  const densityClass = $derived(
    maxColCount > 20 ? 'density-dense' :
    maxColCount > 8  ? 'density-compact' :
    '',
  );

  function isRelated(id: string): boolean {
    const h = vizState.hoveredId;
    if (!h) return false;
    return id === h || (adj[h]?.includes(id) ?? false);
  }

  function isDimmed(id: string): boolean {
    return vizState.hoveredId !== null && !isRelated(id);
  }

  function isConnHL(from: string, to: string): boolean {
    const h = vizState.hoveredId;
    if (!h) return false;
    return from === h || to === h;
  }

  function pathD(from: string, to: string): string | null {
    const a = positions[from], b = positions[to];
    if (!a || !b) return null;
    const mx = (a.right + b.left) / 2;
    return `M${a.right},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${b.left},${b.cy}`;
  }
</script>

<div class="hierarchy {densityClass}" bind:this={containerEl}>

  <!-- SVG connection overlay -->
  <svg class="overlay" width={svgW} height={svgH} aria-hidden="true">
    {#each dataStore.connections as { from, to } (from + to)}
      {@const d = pathD(from, to)}
      {@const hl = isConnHL(from, to)}
      {#if d}
        <path
          {d}
          fill="none"
          class="conn"
          class:hl
          stroke={hl ? '#60a5fa' : 'rgba(148,163,184,0.15)'}
          stroke-width={hl ? 2 : 1}
        />
      {/if}
    {/each}
  </svg>

  <!-- AI source badge -->
  {#if dataStore.fromAI && chartStore.query}
    <div class="ai-source">
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
        <circle cx="7" cy="7" r="6" stroke="#818cf8" stroke-width="1.3"/>
        <path d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z" fill="#818cf8"/>
        <circle cx="7" cy="11" r=".7" fill="#818cf8"/>
      </svg>
      <span>{chartStore.query}</span>
      <span class="ai-count">{dataStore.epics.length + dataStore.stories.length + dataStore.subtasks.length} issues</span>
    </div>
  {/if}

  <!-- Columns -->
  <div class="cols">

    <div class="col">
      <div class="col-label">Epics</div>
      {#each sortedEpics as epic (epic.id)}
        {@const s = STATUS_STYLE[epic.status]}
        <button
          class="card"
          class:hl={isRelated(epic.id)}
          class:dim={isDimmed(epic.id)}
          style="--c:{s.color}; --bg:{s.bg}"
          use:ref={epic.id}
          onmouseenter={() => (vizState.hoveredId = epic.id)}
          onmouseleave={() => (vizState.hoveredId = null)}
        >
          <span class="key">{epic.id}</span>
          <span class="title">{epic.title}</span>
          <div class="meta">
            <span class="badge" style="color:{s.color}">{epic.status}</span>
            <span class="pts">{epic.points}pt</span>
          </div>
        </button>
      {/each}
    </div>

    <div class="col">
      <div class="col-label">Stories</div>
      {#each sortedStories as story (story.id)}
        {@const s = STATUS_STYLE[story.status]}
        <button
          class="card"
          class:hl={isRelated(story.id)}
          class:dim={isDimmed(story.id)}
          style="--c:{s.color}; --bg:{s.bg}"
          use:ref={story.id}
          onmouseenter={() => (vizState.hoveredId = story.id)}
          onmouseleave={() => (vizState.hoveredId = null)}
        >
          <span class="key">{story.id}</span>
          <span class="title">{story.title}</span>
          <div class="meta">
            <span class="badge" style="color:{s.color}">{story.status}</span>
            <span class="pts">{story.points}pt</span>
          </div>
        </button>
      {/each}
    </div>

    <div class="col">
      <div class="col-label">Sub-tasks</div>
      {#each sortedSubtasks as st (st.id)}
        {@const s = STATUS_STYLE[st.status]}
        <button
          class="card"
          class:hl={isRelated(st.id)}
          class:dim={isDimmed(st.id)}
          style="--c:{s.color}; --bg:{s.bg}"
          use:ref={st.id}
          onmouseenter={() => (vizState.hoveredId = st.id)}
          onmouseleave={() => (vizState.hoveredId = null)}
        >
          <span class="key">{st.id}</span>
          <span class="title">{st.title}</span>
          <div class="meta">
            <span class="badge" style="color:{s.color}">{st.status}</span>
            <span class="pts">{st.points}pt</span>
          </div>
        </button>
      {/each}
    </div>

  </div>

  <!-- TODO: remove — temporary stacked bar demo -->
  {#if demoStackedOpt}
    <div class="demo-stacked">
      <div class="demo-stacked-label">Stacked Bar Demo</div>
      <ChartRenderer option={demoStackedOpt} height="200px" />
    </div>
  {/if}
</div>

<style>
  .hierarchy { position: relative; flex: 1; overflow-y: auto; }

  .ai-source {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 16px;
    font-size: 10px;
    color: #64748b;
    background: rgba(129, 140, 248, 0.05);
    border-bottom: 1px solid rgba(129, 140, 248, 0.1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ai-source span { overflow: hidden; text-overflow: ellipsis; }
  .ai-count {
    margin-left: auto;
    flex-shrink: 0;
    font-weight: 700;
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    padding: 1px 6px;
    border-radius: 999px;
  }

  .overlay {
    position: absolute; top: 0; left: 0;
    pointer-events: none; overflow: visible; z-index: 0;
  }

  .conn { transition: stroke 0.2s, stroke-width 0.2s, filter 0.2s; }

  .conn.hl {
    stroke-dasharray: 4 9;
    animation: flow 0.7s linear infinite;
    filter: drop-shadow(0 0 4px rgba(96, 165, 250, 0.7));
  }

  @keyframes flow { to { stroke-dashoffset: -13; } }

  .cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0 72px;
    padding: 28px 32px 32px;
    position: relative; z-index: 1;
  }

  .col { display: flex; flex-direction: column; gap: 10px; }

  .col-label {
    font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: #334155;
    padding-left: 2px; margin-bottom: 6px;
  }

  .card {
    all: unset; cursor: pointer;
    display: flex; flex-direction: column; gap: 5px;
    padding: 11px 13px; background: #131e2e;
    border: 1px solid #1e293b; border-left: 3px solid var(--c);
    border-radius: 7px; transition: opacity 0.18s, box-shadow 0.22s ease-out, background 0.18s, transform 0.18s ease-out;
  }

  .card:hover, .card.hl {
    background: var(--bg);
    transform: translateY(-1px);
    box-shadow:
      0 0 0 1px var(--c),
      0 0 12px rgba(129, 140, 248, 0.22),
      0 0 28px rgba(129, 140, 248, 0.10),
      inset 0 0 12px rgba(129, 140, 248, 0.06),
      0 10px 28px rgba(0, 0, 0, 0.5);
  }

  .card.dim { opacity: 0.15; transform: none; }

  .key { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; color: #475569; font-family: 'Consolas', monospace; }
  .title { font-size: 12.5px; font-weight: 500; color: #cbd5e1; line-height: 1.45; }
  .card.hl .title { color: #f1f5f9; }
  .meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .badge { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; }
  .pts { font-size: 9.5px; color: #475569; background: #1e293b; padding: 1px 7px; border-radius: 999px; border: 1px solid #334155; }

  /* ── Density: compact (9-20 items per column) ───────────────────────────── */
  .density-compact .cols  { padding: 16px 20px; gap: 0 48px; }
  .density-compact .col   { gap: 6px; }
  .density-compact .col-label { margin-bottom: 3px; }
  .density-compact .card  { padding: 7px 10px; gap: 3px; }
  .density-compact .title { font-size: 11px; }
  .density-compact .key   { font-size: 8.5px; }
  .density-compact .meta  { margin-top: 1px; gap: 5px; }
  .density-compact .badge { font-size: 8.5px; }
  .density-compact .pts   { font-size: 8.5px; }

  /* ── Density: dense (21+ items per column) ──────────────────────────────── */
  .density-dense .cols  { padding: 8px 14px; gap: 0 32px; }
  .density-dense .col   { gap: 3px; }
  .density-dense .col-label { margin-bottom: 2px; font-size: 9px; }
  .density-dense .card  { padding: 4px 8px; gap: 2px; border-radius: 5px; }
  .density-dense .title { font-size: 9.5px; line-height: 1.3; }
  .density-dense .key   { font-size: 7.5px; }
  .density-dense .meta  { margin-top: 0; gap: 4px; }
  .density-dense .badge { font-size: 7.5px; }
  .density-dense .pts   { font-size: 7.5px; padding: 0 5px; }

  /* TODO: remove — temporary stacked bar demo */
  .demo-stacked {
    margin: 12px 16px;
    border: 1px dashed #1e293b;
    border-radius: 6px;
    padding: 8px;
  }
  .demo-stacked-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #334155;
    margin-bottom: 4px;
  }
</style>
