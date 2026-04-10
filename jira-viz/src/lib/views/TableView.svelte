<script lang="ts">
  import type { IssueStatus } from '../data.js';
  import { STATUS_STYLE } from '../data.js';
  import { dataStore } from '../dataStore.svelte.js';
  import { chartStore } from '../charts/index.js';
  import { vizState } from '../state.svelte.js';

  interface TypeStyle { label: string; color: string; bg: string }

  const TYPE_STYLE: Record<string, TypeStyle> = {
    'Epic':     { label: 'Epic',     color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
    'Story':    { label: 'Story',    color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
    'Sub-task': { label: 'Sub-task', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  };

  // - Hierarchy mode (demo / CSV) -----------------------------------------------

  const adj = $derived.by((): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { from, to } of dataStore.connections) {
      (map[from] ??= []).push(to);
      (map[to]   ??= []).push(from);
    }
    return map;
  });

  function isRelated(id: string): boolean {
    const h = vizState.hoveredId;
    if (!h) return false;
    return id === h || (adj[h]?.includes(id) ?? false);
  }

  function isDimmed(id: string): boolean {
    return vizState.hoveredId !== null && !isRelated(id);
  }

  interface TableRow {
    id: string; title: string; status: IssueStatus; points: number;
    assignee: string; type: string; parent: string | null; indent: number;
  }

  const tableRows = $derived.by((): TableRow[] => {
    const rows: TableRow[] = [];
    for (const epic of dataStore.epics) {
      rows.push({ ...epic, type: 'Epic', parent: null, indent: 0 });
      for (const story of dataStore.stories.filter(s => s.epicId === epic.id)) {
        rows.push({ ...story, type: 'Story', parent: epic.id, indent: 1 });
        for (const st of dataStore.subtasks.filter(s => s.storyId === story.id)) {
          rows.push({ ...st, type: 'Sub-task', parent: story.id, indent: 2 });
        }
      }
    }
    return rows;
  });

  // - AI flat table mode --------------------------------------------------------

  const DISPLAY_ALIASES: Record<string, string> = {
    'resolved':        'resolutiondate',
    'resolution_date': 'resolutiondate',
    'due_date':        'duedate',
    'issue_type':      'issuetype',
  };

  const FIXED_COLS = new Set(['key', 'Key', 'summary', 'Summary']);

  const aiIssues = $derived(chartStore.issues ?? []);
  const rawDisplayFields = $derived(chartStore.data?.display_fields ?? []);
  // Always start with Key + Summary, then additional fields (no duplicates)
  const aiColumns = $derived([
    'Key', 'Summary',
    ...rawDisplayFields.filter(c => !FIXED_COLS.has(c)),
  ]);

  function resolveField(issue: Record<string, unknown>, col: string): unknown {
    if (col in issue) return issue[col];
    const lower = col.toLowerCase();
    if (lower in issue) return issue[lower];
    const snake = lower.replace(/ /g, '_');
    if (snake in issue) return issue[snake];
    const alias = DISPLAY_ALIASES[snake] ?? DISPLAY_ALIASES[lower];
    if (alias && alias in issue) return issue[alias];
    return undefined;
  }

  function fmtVal(val: unknown): string {
    if (val == null || val === '') return '—';
    if (Array.isArray(val)) {
      if (!val.length) return '—';
      return val.map(v => fmtSingle(v)).join(', ');
    }
    return fmtSingle(val);
  }

  function fmtSingle(val: unknown): string {
    if (val == null) return '—';
    if (typeof val === 'string') {
      // Greenhopper sprint toString
      if (val.includes('com.atlassian.greenhopper') || val.includes('Sprint@')) {
        return val.match(/\bname=([^,\]]+)/)?.[1]?.trim() ?? val;
      }
      return val || '—';
    }
    if (typeof val === 'object') {
      const o = val as Record<string, unknown>;
      if ('name' in o)        return String(o.name);
      if ('displayName' in o) return String(o.displayName);
      if ('value' in o)       return String(o.value);
      return JSON.stringify(val);
    }
    return String(val);
  }

  function isDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}/.test(s);
  }

  function fmtDate(s: string): string {
    try {
      return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    } catch { return s; }
  }
</script>

{#if dataStore.fromAI}
  <!-- ── AI flat table ──────────────────────────────────────────────────────── -->
  <div class="table-view">

    <!-- Source badge -->
    {#if chartStore.query}
      <div class="ai-source">
        <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
          <circle cx="7" cy="7" r="6" stroke="#818cf8" stroke-width="1.3"/>
          <path d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z" fill="#818cf8"/>
          <circle cx="7" cy="11" r=".7" fill="#818cf8"/>
        </svg>
        <span class="ai-query">{chartStore.query}</span>
        <span class="ai-count">{aiIssues.length} issues</span>
      </div>
    {/if}

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            {#each aiColumns as col}
              <th>{col}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each aiIssues as issue (issue.key)}
            <tr class="row">
              {#each aiColumns as col}
                {@const raw = resolveField(issue as Record<string, unknown>, col)}
                <td>
                  {#if col === 'Key' || col === 'key'}
                    {#if chartStore.data?.jira_base_url}
                      <a class="row-key" href="{chartStore.data.jira_base_url}/browse/{issue.key}" target="_blank" rel="noopener">{issue.key}</a>
                    {:else}
                      <span class="row-key">{issue.key}</span>
                    {/if}
                  {:else if col === 'Summary' || col === 'summary'}
                    <span class="row-summary">{fmtVal(raw)}</span>
                  {:else}
                    {@const str = fmtVal(raw)}
                    {#if str !== '—' && isDate(str)}
                      <span class="date-cell">{fmtDate(str)}</span>
                    {:else}
                      <span class="cell-val">{str}</span>
                    {/if}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

{:else}
  <!-- ── Demo / CSV hierarchy table ─────────────────────────────────────────── -->
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
                <span class="avatar">{row.assignee.split(' ').map((w: string) => w[0]).join('')}</span>
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
{/if}

<style>
  .table-view { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

  .ai-source {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 16px; flex-shrink: 0;
    font-size: 10px; color: #64748b;
    background: rgba(129, 140, 248, 0.05);
    border-bottom: 1px solid rgba(129, 140, 248, 0.1);
  }
  .ai-query { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-count {
    margin-left: auto; flex-shrink: 0;
    font-weight: 700; color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    padding: 1px 6px; border-radius: 999px;
  }

  .table-wrap { flex: 1; overflow: auto; border-top: 1px solid #1e293b; }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }

  thead tr { background: #0f172a; position: sticky; top: 0; z-index: 1; }
  thead tr { border-bottom: 1px solid #1e293b; }

  th {
    padding: 10px 14px; text-align: left;
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: #334155; white-space: nowrap;
  }

  .row { border-bottom: 1px solid #0f172a; cursor: default; transition: background 0.1s; }
  .row:last-child { border-bottom: none; }
  .row td { padding: 8px 14px; vertical-align: middle; }
  .row:hover { background: rgba(255,255,255,0.03); }

  .row-hl {
    background: rgba(255,255,255,0.03);
    outline: 1px solid var(--rc); outline-offset: -1px;
  }
  .row-dim { opacity: 0.2; }

  .type-pill {
    display: inline-block; font-size: 9.5px; font-weight: 700;
    letter-spacing: 0.04em; padding: 2px 7px; border-radius: 4px; white-space: nowrap;
  }

  .row-key {
    font-family: 'Consolas', monospace; font-size: 10.5px; font-weight: 700;
    color: #475569; white-space: nowrap; text-decoration: none;
  }
  a.row-key { color: #818cf8; }
  a.row-key:hover { text-decoration: underline; }

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

  .cell-val { color: #94a3b8; font-size: 11px; }
  .date-cell { color: #64748b; font-size: 11px; font-variant-numeric: tabular-nums; }
</style>
