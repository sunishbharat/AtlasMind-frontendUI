<script lang="ts">
  import { onMount } from 'svelte';
  import { STATUS_STYLE } from '../data.js';
  import { dataStore } from '../dataStore.svelte.js';
  import { vizState } from '../state.svelte.js';

  // - Adjacency map - recomputed whenever connections change ------------------
  const adj = $derived.by((): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { from, to } of dataStore.connections) {
      (map[from] ??= []).push(to);
      (map[to]   ??= []).push(from);
    }
    return map;
  });

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

  // Recompute positions when data changes (CSV upload swaps cards)
  $effect(() => {
    dataStore.epics; dataStore.stories; dataStore.subtasks;
    requestAnimationFrame(computePositions);
  });

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

<div class="hierarchy" bind:this={containerEl}>

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

  <!-- Columns -->
  <div class="cols">

    <div class="col">
      <div class="col-label">Epics</div>
      {#each dataStore.epics as epic (epic.id)}
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
      {#each dataStore.stories as story (story.id)}
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
      {#each dataStore.subtasks as st (st.id)}
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
</div>

<style>
  .hierarchy { position: relative; flex: 1; }

  .overlay {
    position: absolute; top: 0; left: 0;
    pointer-events: none; overflow: visible; z-index: 0;
  }

  .conn { transition: stroke 0.15s, stroke-width 0.15s; }

  .conn.hl {
    stroke-dasharray: 4 9;
    animation: flow 0.7s linear infinite;
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
    border-radius: 7px; transition: opacity 0.18s, box-shadow 0.18s, background 0.18s;
  }

  .card:hover, .card.hl {
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--c), 0 8px 24px rgba(0,0,0,0.4);
  }

  .card.dim { opacity: 0.2; }

  .key { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; color: #475569; font-family: 'Consolas', monospace; }
  .title { font-size: 12.5px; font-weight: 500; color: #cbd5e1; line-height: 1.45; }
  .card.hl .title { color: #f1f5f9; }
  .meta { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .badge { font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; }
  .pts { font-size: 9.5px; color: #475569; background: #1e293b; padding: 1px 7px; border-radius: 999px; border: 1px solid #334155; }
</style>
