<script>
  /**
   * AIHierarchyView.svelte
   * Hierarchy map for AI query results — mirrors HierarchyView.svelte visually
   * but takes an `issues` array prop instead of reading from dataStore.
   *
   * Props:
   *   issues        — array of Jira issue objects from chartStore
   *   jiraBaseUrl   — optional base URL for issue links
   */
  import { onMount } from 'svelte';

  let { issues = [], jiraBaseUrl = '' } = $props();

  // ── Status colour ─────────────────────────────────────────────────────────
  const STATUS_COLOR = {
    'to do':       { color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
    'open':        { color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
    'backlog':     { color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
    'in progress': { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)' },
    'in review':   { color: '#818cf8', bg: 'rgba(129,140,248,0.08)' },
    'done':        { color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
    'closed':      { color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
    'resolved':    { color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
    'blocked':     { color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
  };

  function statusStyle(status = '') {
    return STATUS_COLOR[status.toLowerCase()] ?? { color: '#818cf8', bg: 'rgba(129,140,248,0.08)' };
  }

  // ── Build columns from unique issuetypes in the data ─────────────────────
  const columns = $derived.by(() => {
    const typeMap = new Map(); // preserves insertion order = server order
    for (const issue of issues) {
      const t = issue.issuetype ?? issue.type ?? 'Unknown';
      if (!typeMap.has(t)) typeMap.set(t, []);
      typeMap.get(t).push(issue);
    }
    return [...typeMap.entries()].map(([label, items]) => ({ label, items }));
  });

  // ── Connections: any issue whose parent exists in the dataset ─────────────
  const connections = $derived.by(() => {
    const allKeys = new Set(issues.map(i => i.key));
    const conns = [];
    for (const issue of issues) {
      const parentKey = issue.epic_link ?? issue.epic_key ?? issue.parent;
      if (parentKey && allKeys.has(parentKey))
        conns.push({ from: parentKey, to: issue.key });
    }
    return conns;
  });

  // ── Adjacency map for hover highlighting ──────────────────────────────────
  const adj = $derived.by(() => {
    const m = {};
    for (const { from, to } of connections) {
      (m[from] ??= []).push(to);
      (m[to]   ??= []).push(from);
    }
    return m;
  });

  // ── Hover state ───────────────────────────────────────────────────────────
  let hoveredId = $state(null);

  function isRelated(id) {
    if (!hoveredId) return false;
    return id === hoveredId || (adj[hoveredId]?.includes(id) ?? false);
  }
  function isDimmed(id) { return hoveredId !== null && !isRelated(id); }
  function isConnHL(from, to) {
    return hoveredId !== null && (from === hoveredId || to === hoveredId);
  }

  // ── SVG bezier connections ────────────────────────────────────────────────
  let containerEl;
  const nodeEls = {};
  let positions = $state({});
  let svgW = $state(0);
  let svgH = $state(0);

  function ref(el, id) {
    nodeEls[id] = el;
    return { destroy() { delete nodeEls[id]; } };
  }

  function computePositions() {
    if (!containerEl) return;
    const cr = containerEl.getBoundingClientRect();
    const p  = {};
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

  function pathD(from, to) {
    const a = positions[from], b = positions[to];
    if (!a || !b) return null;
    const mx = (a.right + b.left) / 2;
    return `M${a.right},${a.cy} C${mx},${a.cy} ${mx},${b.cy} ${b.left},${b.cy}`;
  }

  function pts(issue) {
    return issue.story_points ?? issue.points ?? issue['story points'] ?? null;
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

  .col-empty {
    font-size: 10.5px; color: #1e293b;
    padding: 8px 4px;
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
