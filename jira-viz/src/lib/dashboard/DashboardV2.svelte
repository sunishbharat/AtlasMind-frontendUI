<script lang="ts">
  import { buildPie, buildBar, buildGroupedTrend } from '../charts/specBuilder.js';
  import ChartRenderer from '../charts/ChartRenderer.svelte';

  // - Types --------------------------------------------------------------------
  type ChartType = 'pie' | 'donut' | 'treemap' | 'bar' | 'stacked' | 'horizontal' | 'line';
  type Dimension = 'status' | 'priority' | 'assignee' | 'project';
  type Metric = 'count' | 'story_points' | 'resolution_time';

  // - Dropdown options ---------------------------------------------------------
  const PIE_CHART_TYPES = [
    { value: 'pie', label: 'Pie' },
    { value: 'donut', label: 'Donut' },
    { value: 'treemap', label: 'Treemap' },
  ];

  const DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'project', label: 'Project' },
  ];

  const METRICS: { value: Metric; label: string }[] = [
    { value: 'count', label: 'Count' },
    { value: 'story_points', label: 'Story Points' },
    { value: 'resolution_time', label: 'Avg Resolution Time' },
  ];

  const BAR_CHART_TYPES = [
    { value: 'bar', label: 'Bar' },
    { value: 'stacked', label: 'Stacked Bar' },
    { value: 'horizontal', label: 'Horizontal' },
    { value: 'line', label: 'Line' },
  ];

  const X_AXIS_OPTIONS = [
    { value: 'date', label: 'Date' },
    { value: 'sprint', label: 'Sprint' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'project', label: 'Project' },
    { value: 'label', label: 'Label' },
  ];

  // - Mock data ----------------------------------------------------------------
  const PIE_DATA: Record<Dimension, [string, number][]> = {
    status: [
      ['Open', 124], ['In Progress', 89], ['Resolved', 58], ['Closed', 13],
    ],
    priority: [
      ['Critical', 34], ['High', 89], ['Medium', 112], ['Low', 49],
    ],
    assignee: [
      ['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18],
    ],
    project: [
      ['Kafka', 92], ['Zookeeper', 71], ['Hive', 65], ['HDFS', 56],
    ],
  };

  const BAR_DATA: Record<string, [string, number][]> = {
    date: [
      ['Jan', 45], ['Feb', 52], ['Mar', 38], ['Apr', 61], ['May', 55], ['Jun', 48],
    ],
    assignee: [
      ['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18],
    ],
    project: [
      ['Kafka', 92], ['Zookeeper', 71], ['Hive', 65], ['HDFS', 56],
    ],
    label: [
      ['bug', 142], ['feature', 78], ['improvement', 42], ['task', 22],
    ],
  };

  const TEAM_DATA = [
    { name: 'Alice Chen', avatar: 'A', issues: 45, trend: [12, 15, 18, 14, 20, 22, 25] },
    { name: 'Bob Martinez', avatar: 'B', issues: 38, trend: [8, 10, 12, 11, 14, 16, 15] },
    { name: 'Charlie Kim', avatar: 'C', issues: 29, trend: [5, 7, 8, 10, 12, 11, 14] },
    { name: 'Diana Lee', avatar: 'D', issues: 22, trend: [4, 5, 6, 8, 9, 10, 11] },
  ];

  const LIFECYCLE = [
    { label: '0-2 days', pct: 62, color: '#238636' },
    { label: '3-7 days', pct: 22, color: '#1f6feb' },
    { label: '8-30 days', pct: 11, color: '#d29922' },
    { label: '>30 days', pct: 5, color: '#da3633' },
  ];

  const RELEASES = [
    { name: 'Kafka 3.7.0', date: 'Mar 14, 2025', count: '142', upcoming: false },
    { name: 'Kafka 3.6.1', date: 'Jan 28, 2025', count: '67', upcoming: false },
    { name: 'Zookeeper 3.9', date: 'Dec 12, 2024', count: '93', upcoming: false },
    { name: 'Kafka 3.8.0', date: 'Upcoming', count: '~80', upcoming: true },
  ];

  const PROJECTS = ['Kafka', 'Zookeeper', 'Hive', 'HDFS'];

  // - Reactive state ------------------------------------------------------------
  let pieChartType = $state<'pie' | 'donut' | 'treemap'>('pie');
  let pieDimension = $state<Dimension>('project');
  let pieMetric = $state<Metric>('count');

  let barChartType = $state<'bar' | 'stacked' | 'horizontal' | 'line'>('bar');
  let barXAxis = $state<string>('date');
  let barYAxis = $state<Metric>('count');

  let selectedProject = $state('kafka');
  let activityToggled = $state(new Set<string>(['kafka']));
  let radarProject = $state('kafka');

  // - Derived chart options -----------------------------------------------------
  const pieOption = $derived(
    buildPie(PIE_DATA[pieDimension], `${pieDimension} (${pieMetric})`, 10, true)
  );

  const barOption = $derived(
    buildBar(
      BAR_DATA[barXAxis]?.map(([k]) => k) ?? [],
      [{ name: barYAxis, data: BAR_DATA[barXAxis]?.map(([, v]) => v) ?? [] }],
      `${barXAxis} - ${barYAxis}`,
      true
    )
  );

  const activityOption = $derived(
    buildGroupedTrend(
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      [
        { name: 'Created', data: [45, 52, 38, 61, 55, 48] },
        { name: 'Resolved', data: [38, 45, 42, 55, 50, 42] },
        { name: 'Reopened', data: [5, 8, 6, 7, 4, 3] },
      ],
      'Activity'
    )
  );

  // - Helpers ------------------------------------------------------------------
  function toggleActivityProject(key: string): void {
    const next = new Set(activityToggled);
    if (next.has(key)) { if (next.size > 1) next.delete(key); }
    else next.add(key);
    activityToggled = next;
  }

  function renderSparkline(points: number[]): string {
    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const width = 60;
    const height = 20;
    const step = width / (points.length - 1);
    const coords = points.map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`);
    return coords.join(' ');
  }
</script>

<div class="dash-v2">
  <!-- Top Bar - just controls, header is in JiraViz -->
  <header class="topbar">
    <div class="spacer"></div>
    <div class="controls">
      <select class="ctrl-select">
        <option>All Projects</option>
        <option>Kafka</option>
        <option>Zookeeper</option>
        <option>Hive</option>
        <option>HDFS</option>
      </select>
      <select class="ctrl-select">
        <option>Last 90 days</option>
        <option>Last 30 days</option>
        <option>Last 7 days</option>
        <option>Custom</option>
      </select>
      <button class="ctrl-btn" type="button">
        <i class="ti ti-refresh" aria-hidden="true"></i>
      </button>
    </div>
  </header>

  <main class="main">
    <!-- Row 1: Overview (3 columns) -->
    <section class="row">
      <!-- Col 1: Pie Chart -->
      <div class="card">
        <div class="card-header">
          <select class="chart-select" bind:value={pieChartType}>
            {#each PIE_CHART_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
          </select>
          <select class="chart-select" bind:value={pieDimension}>
            {#each DIMENSIONS as d}<option value={d.value}>{d.label}</option>{/each}
          </select>
          <select class="chart-select" bind:value={pieMetric}>
            {#each METRICS as m}<option value={m.value}>{m.label}</option>{/each}
          </select>
        </div>
        <div class="chart-area">
          <ChartRenderer option={pieOption} height="180px" />
        </div>
      </div>

      <!-- Col 2: Bar Chart -->
      <div class="card">
        <div class="card-header">
          <select class="chart-select" bind:value={barChartType}>
            {#each BAR_CHART_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
          </select>
          <select class="chart-select" bind:value={barXAxis}>
            {#each X_AXIS_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
          </select>
          <select class="chart-select" bind:value={barYAxis}>
            {#each METRICS as m}<option value={m.value}>{m.label}</option>{/each}
          </select>
        </div>
        <div class="chart-area">
          <ChartRenderer option={barOption} height="180px" />
        </div>
      </div>

      <!-- Col 3: Team Activity -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Team Activity</span>
          <div class="team-toggle">
            <button class="toggle-btn active">This Week</button>
            <button class="toggle-btn">This Month</button>
          </div>
        </div>
        <div class="team-list">
          {#each TEAM_DATA as member}
            <div class="team-row">
              <div class="avatar">{member.avatar}</div>
              <div class="team-info">
                <div class="team-name">{member.name}</div>
                <div class="team-meta">{member.issues} issues</div>
              </div>
              <svg class="sparkline" viewBox="0 0 60 20" aria-hidden="true">
                <polyline points={renderSparkline(member.trend)} fill="none" stroke="#1f6feb" stroke-width="1.5" />
              </svg>
            </div>
          {/each}
        </div>
        <div class="team-stats">
          <div class="stat"><strong>4</strong>Active</div>
          <div class="stat"><strong>33.5</strong>Avg/Person</div>
          <div class="stat"><strong>Alice</strong>Top</div>
        </div>
      </div>
    </section>

    <!-- Row 2: Activity & Flow (65/35) -->
    <section class="row row-65-35">
      <!-- Col 1: Activity Over Time -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Activity Over Time</span>
          <div class="legend">
            <span class="leg-item"><span class="dot" style="background:#1f6feb"></span>Created</span>
            <span class="leg-item"><span class="dot" style="background:#238636"></span>Resolved</span>
            <span class="leg-item"><span class="dot" style="background:#da3633"></span>Reopened</span>
          </div>
        </div>
        <div class="chart-area">
          <ChartRenderer option={activityOption} height="140px" />
        </div>
        <div class="proj-toggles">
          {#each PROJECTS as p}
            <button
              class="proj-toggle"
              class:active={activityToggled.has(p.toLowerCase())}
              onclick={() => toggleActivityProject(p.toLowerCase())}
            >{p}</button>
          {/each}
        </div>
      </div>

      <!-- Col 2: Issue Lifecycle -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Issue Lifecycle</span>
          <span class="badge badge-warn">18 long-running</span>
        </div>
        <div class="lc-rows">
          {#each LIFECYCLE as row}
            <div class="lc-row">
              <span class="lc-label">{row.label}</span>
              <div class="bar-track"><div class="bar-fill" style="width:{row.pct}%;background:{row.color}"></div></div>
              <span class="lc-val">{row.pct}%</span>
            </div>
          {/each}
        </div>
        <div class="lc-stats">
          <div class="stat-chip"><strong>3.0d</strong>Median</div>
          <div class="stat-chip"><strong>18</strong>&gt;30d</div>
          <div class="stat-chip"><strong>1:1.1</strong>Ratio</div>
        </div>
      </div>
    </section>

    <!-- Row 3: Quality & Health (3 columns) -->
    <section class="row">
      <!-- Col 1: Release Timeline -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Release Timeline</span>
          <span class="badge badge-done">5 releases</span>
        </div>
        <div class="tl-track">
          <div class="tl-line"></div>
          {#each RELEASES as rel, i}
            <div class="tl-dot" class:released={!rel.upcoming} class:upcoming={rel.upcoming} style="left:{i * 25}%"></div>
          {/each}
        </div>
        <div class="tl-list">
          {#each RELEASES as rel}
            <div class="tl-item" class:upcoming={rel.upcoming}>
              <span class="tl-name">{rel.name}</span>
              <span class="tl-date">{rel.date}</span>
              <span class="tl-count">{rel.count}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Col 2: Project Health Radar -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Project Health Radar</span>
          <select class="proj-select" bind:value={radarProject}>
            {#each PROJECTS as p}<option value={p.toLowerCase()}>{p}</option>{/each}
          </select>
        </div>
        <div class="radar-area">
          <svg viewBox="0 0 100 90" aria-hidden="true">
            <!-- Grid -->
            <polygon points="50,10 85,35 70,80 30,80 15,35" fill="none" stroke="#30363d" stroke-width="0.5"/>
            <polygon points="50,25 70,37 62,65 38,65 30,37" fill="none" stroke="#30363d" stroke-width="0.5"/>
            <polygon points="50,40 60,45 55,55 45,55 40,45" fill="none" stroke="#30363d" stroke-width="0.5"/>
            <!-- Axes -->
            <line x1="50" y1="45" x2="50" y2="10" stroke="#30363d" stroke-width="0.5"/>
            <line x1="50" y1="45" x2="85" y2="35" stroke="#30363d" stroke-width="0.5"/>
            <line x1="50" y1="45" x2="70" y2="80" stroke="#30363d" stroke-width="0.5"/>
            <line x1="50" y1="45" x2="30" y2="80" stroke="#30363d" stroke-width="0.5"/>
            <line x1="50" y1="45" x2="15" y2="35" stroke="#30363d" stroke-width="0.5"/>
            <!-- Labels -->
            <text x="50" y="6" text-anchor="middle" font-size="6" fill="#8b949e">Throughput</text>
            <text x="90" y="35" text-anchor="start" font-size="6" fill="#8b949e">Quality</text>
            <text x="75" y="85" text-anchor="middle" font-size="6" fill="#8b949e">Stability</text>
            <text x="25" y="85" text-anchor="middle" font-size="6" fill="#8b949e">Activity</text>
            <text x="10" y="35" text-anchor="end" font-size="6" fill="#8b949e">Responsive</text>
            <!-- Data polygon -->
            <polygon points="50,15 78,38 65,72 35,72 22,38" fill="#1f6feb" fill-opacity="0.15" stroke="#1f6feb" stroke-width="1"/>
          </svg>
        </div>
      </div>

      <!-- Col 3: Project Spotlight -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Project Spotlight</span>
          <select class="proj-select" bind:value={selectedProject}>
            {#each PROJECTS as p}<option value={p.toLowerCase()}>{p}</option>{/each}
          </select>
        </div>
        <div class="spotlight-desc">
          Distributed event streaming platform. High-throughput, fault-tolerant messaging.
        </div>
        <div class="spotlight-meta">
          <span class="pill pill-open">412 open</span>
          <span class="pill pill-done">1204 closed</span>
        </div>
        <div class="sp-bars">
          <div class="sp-row"><span class="sp-label">Bugs</span><div class="sp-track"><div class="sp-fill" style="width:58%;background:#da3633"></div></div><span class="sp-val">58%</span></div>
          <div class="sp-row"><span class="sp-label">Improv</span><div class="sp-track"><div class="sp-fill" style="width:28%;background:#1f6feb"></div></div><span class="sp-val">28%</span></div>
          <div class="sp-row"><span class="sp-label">Tasks</span><div class="sp-track"><div class="sp-fill" style="width:14%;background:#238636"></div></div><span class="sp-val">14%</span></div>
        </div>
        <div class="spotlight-spark">
          <span class="spark-label">12 weeks</span>
          <svg viewBox="0 0 80 16" aria-hidden="true">
            <polyline points="0,12 13,10 26,8 40,11 53,6 66,8 80,4" fill="none" stroke="#1f6feb" stroke-width="1.5"/>
          </svg>
        </div>
      </div>
    </section>
  </main>
</div>

<style>
  .dash-v2 {
    --bg: #0d1117;
    --bg-card: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --accent-green: #238636;
    --accent-blue: #1f6feb;
    --accent-amber: #d29922;
    --accent-red: #da3633;

    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: #08111e;
    border-bottom: 1px solid var(--border);
  }

  .brand-left { display: flex; align-items: center; gap: 12px; }

  .logo { display: flex; align-items: center; }

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
    height: 24px;
    background: var(--border);
  }

  .brand-title { display: flex; flex-direction: column; gap: 1px; }
  .brand-sprint { font-size: 12px; font-weight: 500; color: var(--text); }
  .brand-sub { font-size: 9px; color: var(--text-muted); }

  .spacer { flex: 1; }

  .controls { display: flex; gap: 6px; }

  .ctrl-select, .chart-select, .proj-select {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
  }

  .main { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }

  .row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
  .row-65-35 { grid-template-columns: 65fr 35fr; }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .card-title { font-size: 12px; font-weight: 500; }

  .chart-select { font-size: 10px; padding: 2px 6px; }

  .chart-area { min-height: 140px; }

  .legend { display: flex; gap: 10px; margin-left: auto; font-size: 10px; color: var(--text-muted); }
  .leg-item { display: flex; align-items: center; gap: 4px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; }

  /* Team Activity */
  .team-toggle { display: flex; gap: 2px; margin-left: auto; }
  .toggle-btn {
    padding: 2px 8px;
    font-size: 9px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 3px;
    cursor: pointer;
  }
  .toggle-btn.active { background: var(--accent-blue); color: white; border-color: var(--accent-blue); }

  .team-list { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
  .team-row { display: flex; align-items: center; gap: 8px; }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent-blue);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 500;
  }
  .team-info { flex: 1; }
  .team-name { font-size: 11px; }
  .team-meta { font-size: 9px; color: var(--text-muted); }
  .sparkline { width: 60px; height: 20px; }

  .team-stats { display: flex; gap: 12px; border-top: 1px solid var(--border); padding-top: 8px; font-size: 10px; }
  .stat { color: var(--text-muted); }
  .stat strong { color: var(--text); }

  /* Lifecycle */
  .badge { font-size: 9px; padding: 2px 6px; border-radius: 8px; }
  .badge-warn { background: rgba(210, 153, 34, 0.2); color: var(--accent-amber); }
  .badge-done { background: rgba(35, 134, 54, 0.2); color: var(--accent-green); }

  .lc-rows { display: flex; flex-direction: column; gap: 6px; }
  .lc-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .lc-label { width: 50px; color: var(--text-muted); }
  .bar-track { flex: 1; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .lc-val { width: 30px; text-align: right; color: var(--text-muted); }

  .lc-stats { display: flex; gap: 10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); }
  .stat-chip { font-size: 10px; color: var(--text-muted); }
  .stat-chip strong { color: var(--text); }

  /* Project toggles */
  .proj-toggles { display: flex; gap: 6px; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
  .proj-toggle {
    padding: 3px 10px;
    font-size: 10px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 3px;
    cursor: pointer;
  }
  .proj-toggle.active { background: var(--accent-blue); color: white; border-color: var(--accent-blue); }

  /* Timeline */
  .tl-track { position: relative; height: 20px; margin: 8px 0; }
  .tl-line { position: absolute; top: 8px; left: 4px; right: 4px; height: 2px; background: var(--border); }
  .tl-dot { position: absolute; top: 4px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--border); }
  .tl-dot.released { background: var(--accent-green); border-color: var(--accent-green); }
  .tl-dot.upcoming { border-color: var(--accent-amber); }

  .tl-list { display: flex; flex-direction: column; gap: 4px; }
  .tl-item { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); }
  .tl-item.upcoming { color: var(--accent-amber); }
  .tl-name { color: var(--text); }

  /* Radar */
  .radar-area { display: flex; justify-content: center; padding: 8px 0; }
  .radar-area svg { width: 100px; height: 90px; }

  /* Spotlight */
  .spotlight-desc { font-size: 10px; color: var(--text-muted); margin-bottom: 8px; }
  .spotlight-meta { display: flex; gap: 8px; margin-bottom: 10px; }
  .pill { font-size: 9px; padding: 2px 8px; border-radius: 8px; }
  .pill-open { background: rgba(31, 111, 235, 0.2); color: var(--accent-blue); }
  .pill-done { background: rgba(35, 134, 54, 0.2); color: var(--accent-green); }

  .sp-bars { display: flex; flex-direction: column; gap: 4px; }
  .sp-row { display: flex; align-items: center; gap: 6px; font-size: 10px; }
  .sp-label { width: 36px; color: var(--text-muted); }
  .sp-track { flex: 1; height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; }
  .sp-fill { height: 100%; border-radius: 3px; }
  .sp-val { width: 28px; text-align: right; color: var(--text-muted); }

  .spotlight-spark { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--border); }
  .spark-label { font-size: 9px; color: var(--text-muted); display: block; margin-bottom: 4px; }
  .spotlight-spark svg { width: 80px; height: 16px; }

  @media (max-width: 768px) {
    .row, .row-65-35 { grid-template-columns: 1fr; }
  }
</style>