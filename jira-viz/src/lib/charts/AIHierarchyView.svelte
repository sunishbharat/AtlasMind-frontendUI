<script lang="ts">
  // Hierarchy map for AI query results - mirrors HierarchyView.svelte visually
  // but takes an `issues` array prop instead of reading from dataStore.
  import { onMount } from 'svelte';
  import type { ApiIssue } from './chartStore.svelte.js';
  import { statusStyle } from '../statusColors.js';

  let { issues = [] as ApiIssue[], jiraBaseUrl = '' }: { issues?: ApiIssue[]; jiraBaseUrl?: string } = $props();

  // - Columns from unique issuetypes in the data ------------------------------
  const columns = $derived.by(() => {
    const typeMap = new Map<string, ApiIssue[]>();
    for (const issue of issues) {
      const t = String(issue.issuetype ?? issue.type ?? 'Unknown');
      if (!typeMap.has(t)) typeMap.set(t, []);
      typeMap.get(t)!.push(issue);
    }
    return [...typeMap.entries()].map(([label, items]) => ({ label, items }));
  });

  // - Connections: issues whose parent exists in the dataset ------------------
  const connections = $derived.by(() => {
    const allKeys = new Set(issues.map(i => i.key));
    const conns: { from: string; to: string }[] = [];
    for (const issue of issues) {
      const parentKey = String(issue.epic_link ?? issue.epic_key ?? issue.parent ?? '');
      if (parentKey && allKeys.has(parentKey))
        conns.push({ from: parentKey, to: String(issue.key) });
    }
    return conns;
  });

  const adj = $derived.by((): Record<string, string[]> => {
    const m: Record<string, string[]> = {};
    for (const { from, to } of connections) {
      (m[from] ??= []).push(to);
      (m[to]   ??= []).push(from);
    }
    return m;
  });

  let hoveredId = $state<string | null>(null);

  function isRelated(id: string): boolean {
    if (!hoveredId) return false;
    return id === hoveredId || (adj[hoveredId]?.includes(id) ?? false);
  }
  function isDimmed(id: string): boolean   { return hoveredId !== null && !isRelated(id); }
  function isConnHL(from: string, to: string): boolean {
    return hoveredId !== null && (from === hoveredId || to === hoveredId);
  }

  // - SVG bezier connections --------------------------------------------------
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

  $effect(() => {
    issues;
    requestAnimationFrame(computePositions);
  });

  function pathD(from: string, to: string): string | null {
    const a = positions[from], b = positions[to];
    if (!a || !b) return null;
    const mx = (a.right + b.left) / 2;
    return `M${a.right},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${b.left},${b.cy}`;
  }

  function pts(issue: ApiIssue): number | null {
    return (issue.story_points ?? issue.points ?? issue['story points'] ?? null) as number | null;
  }
</script>

<div class="hierarchy" bind:this={containerEl}>

  {#if !issues.length}
    <div class="empty">No issues to display</div>
  {:else}

    <!-- SVG connection overlay -->
    <svg class="overlay" width={svgW} height={svgH} aria-hidden="true">
      {#each connections as { from, to } (from + to)}
        {@const d = pathD(from, to)}
        {@const hl = isConnHL(from, to)}
        {#if d}
          <path
            {d}
            fill="none"
            class="conn"
            class:hl
            stroke={hl ? '#60a5fa' : 'rgba(148,163,184,0.12)'}
            stroke-width={hl ? 2 : 1}
          />
        {/if}
      {/each}
    </svg>

    <!-- Columns — one per unique issuetype -->
    <div class="cols" style="grid-template-columns: repeat({columns.length}, 1fr)">
      {#each columns as col (col.label)}
        <div class="col">
          <div class="col-label">{col.label} <span class="col-count">{col.items.length}</span></div>
          {#each col.items as issue (issue.key)}
            {@const s = statusStyle(issue.status)}
            <button
              class="card"
              class:hl={isRelated(issue.key)}
              class:dim={isDimmed(issue.key)}
              style="--c:{s.color};--bg:{s.bg}"
              use:ref={issue.key}
              onmouseenter={() => (hoveredId = issue.key)}
              onmouseleave={() => (hoveredId = null)}
            >
              {#if jiraBaseUrl}
                <a class="key" href="{jiraBaseUrl}/browse/{issue.key}" target="_blank" rel="noreferrer"
                  onclick={(e) => e.stopPropagation()}>{issue.key}</a>
              {:else}
                <span class="key">{issue.key}</span>
              {/if}
              <span class="title">{issue.summary ?? issue.title ?? '—'}</span>
              <div class="meta">
                <span class="badge" style="color:{s.color}">{issue.status ?? '—'}</span>
                {#if pts(issue) != null}<span class="pts">{pts(issue)}pt</span>{/if}
                {#if issue.assignee}<span class="assignee">{issue.assignee}</span>{/if}
              </div>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hierarchy { position: relative; flex: 1; overflow: auto; min-height: 0; }

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
    gap: 0 56px;
    padding: 16px 20px 20px;
    position: relative; z-index: 1;
    min-width: 0;
  }

  .col { display: flex; flex-direction: column; gap: 8px; }

  .col-label {
    display: flex; align-items: center; gap: 6px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #334155;
    padding-left: 2px; margin-bottom: 4px;
  }

  .col-count {
    font-size: 9px; font-weight: 700;
    color: #818cf8;
    background: rgba(129,140,248,0.1);
    padding: 1px 5px; border-radius: 999px;
  }

  .card {
    all: unset; cursor: pointer;
    display: flex; flex-direction: column; gap: 4px;
    padding: 10px 12px;
    background: #0d1b2e;
    border: 1px solid #1e293b;
    border-left: 3px solid var(--c);
    border-radius: 7px;
    transition: opacity 0.18s, box-shadow 0.18s, background 0.18s;
  }

  .card:hover, .card.hl {
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--c), 0 6px 20px rgba(0,0,0,0.4);
  }

  .card.dim { opacity: 0.15; }

  .key {
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em;
    color: #475569; font-family: 'Consolas', monospace;
    text-decoration: none;
  }
  .key:hover { color: #818cf8; text-decoration: underline; }

  .title {
    font-size: 12px; font-weight: 500; color: #cbd5e1;
    line-height: 1.45;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card.hl .title { color: #f1f5f9; }

  .meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; flex-wrap: wrap; }

  .badge { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; }

  .pts {
    font-size: 9px; color: #475569;
    background: #1e293b; padding: 1px 6px;
    border-radius: 999px; border: 1px solid #334155;
  }

  .assignee {
    font-size: 9px; color: #334155;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 80px;
  }

  .empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    font-size: 11px; color: #1e293b; height: 100%;
  }
</style>
