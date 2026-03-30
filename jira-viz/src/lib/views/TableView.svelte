<script>
  import { STATUS_STYLE } from '../data.js'
  import { dataStore } from '../dataStore.svelte.js'
  import { vizState } from '../state.svelte.js'

  const TYPE_STYLE = {
    Epic:       { label: 'Epic',     color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
    Story:      { label: 'Story',    color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
    'Sub-task': { label: 'Sub-task', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  }

  // Adjacency for dimming — recomputed on data change
  const adj = $derived.by(() => {
    const map = {}
    for (const { from, to } of dataStore.connections) {
      ;(map[from] ??= []).push(to)
      ;(map[to] ??= []).push(from)
    }
    return map
  })

  function isRelated(id) {
    const h = vizState.hoveredId
    if (!h) return false
    return id === h || (adj[h]?.includes(id) ?? false)
  }

  function isDimmed(id) {
    return vizState.hoveredId !== null && !isRelated(id)
  }

  // Build hierarchical row order — recomputed on data change
  const tableRows = $derived.by(() => {
    const rows = []
    for (const epic of dataStore.epics) {
      rows.push({ ...epic, type: 'Epic', parent: null, indent: 0 })
      for (const story of dataStore.stories.filter(s => s.epicId === epic.id)) {
        rows.push({ ...story, type: 'Story', parent: epic.id, indent: 1 })
        for (const st of dataStore.subtasks.filter(s => s.storyId === story.id)) {
          rows.push({ ...st, type: 'Sub-task', parent: story.id, indent: 2 })
        }
      }
    }
    return rows
  })
</script>

<div class="table-view">
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Key</th>
          <th>Summary</th>
          <th>Status</th>
          <th>Points</th>
          <th>Assignee</th>
          <th>Parent</th>
        </tr>
      </thead>
      <tbody>
        {#each tableRows as row (row.id)}
          {@const ts = TYPE_STYLE[row.type]}
          {@const ss = STATUS_STYLE[row.status]}
          <tr
            class="row"
            class:row-hl={isRelated(row.id)}
            class:row-dim={isDimmed(row.id)}
            style="--rc:{ts.color}"
            onmouseenter={() => (vizState.hoveredId = row.id)}
            onmouseleave={() => (vizState.hoveredId = null)}
          >
            <td>
              <span class="type-pill" style="color:{ts.color}; background:{ts.bg}">{ts.label}</span>
            </td>
            <td><span class="row-key">{row.id}</span></td>
            <td>
              <span class="row-summary" style="padding-left:{row.indent * 20}px">
                {#if row.indent > 0}
                  <span class="indent-line" style="left:{(row.indent - 1) * 20 + 8}px"></span>
                {/if}
                {row.title}
              </span>
            </td>
            <td>
              <span class="status-dot" style="background:{ss.color}"></span>
              <span style="color:{ss.color}; font-size:11px; font-weight:600">{row.status}</span>
            </td>
            <td class="pts-cell">{row.points}</td>
            <td class="assignee-cell">
              <span class="avatar">{row.assignee.split(' ').map(w => w[0]).join('')}</span>
              {row.assignee}
            </td>
            <td>
              {#if row.parent}
                <span class="parent-key">{row.parent}</span>
              {:else}
                <span class="none">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .table-view { padding: 24px 32px 40px; flex: 1; }

  .table-wrap { border-radius: 8px; border: 1px solid #1e293b; overflow-x: auto; }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }

  thead tr { background: #0f172a; border-bottom: 1px solid #1e293b; }

  th {
    padding: 10px 14px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: #334155; white-space: nowrap;
  }

  .row { border-bottom: 1px solid #1e293b; cursor: pointer; transition: opacity 0.15s, background 0.15s; }
  .row:last-child { border-bottom: none; }
  .row td { padding: 10px 14px; vertical-align: middle; }

  .row:hover, .row.row-hl {
    background: rgba(255,255,255,0.03);
    outline: 1px solid var(--rc); outline-offset: -1px;
  }

  .row.row-dim { opacity: 0.2; }

  .type-pill {
    display: inline-block; font-size: 9.5px; font-weight: 700;
    letter-spacing: 0.04em; padding: 2px 7px; border-radius: 4px; white-space: nowrap;
  }

  .row-key { font-family: 'Consolas', monospace; font-size: 10.5px; font-weight: 700; color: #475569; white-space: nowrap; }

  .row-summary { color: #cbd5e1; font-weight: 450; position: relative; display: inline-block; }
  .row-hl .row-summary { color: #f1f5f9; }

  .indent-line {
    position: absolute; top: 50%; transform: translateY(-50%);
    width: 10px; height: 1px; background: #334155;
  }

  .status-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }

  .pts-cell { color: #64748b; font-weight: 600; text-align: center; }

  .assignee-cell { color: #94a3b8; display: flex; align-items: center; gap: 7px; white-space: nowrap; }

  .avatar {
    display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 50%;
    background: #1e293b; border: 1px solid #334155;
    font-size: 8px; font-weight: 700; color: #64748b; flex-shrink: 0;
  }

  .parent-key { font-family: 'Consolas', monospace; font-size: 10px; color: #475569; }
  .none { color: #1e293b; }
</style>
