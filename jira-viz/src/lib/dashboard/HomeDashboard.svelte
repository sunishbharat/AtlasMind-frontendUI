<script lang="ts">
  interface Props { onAskAI: () => void }
  let { onAskAI }: Props = $props();

  // -- Data types -------------------------------------------------------------

  interface ProjectData {
    readonly key:          string;
    readonly label:        string;
    readonly version:      string;
    readonly open:         number;
    readonly closed:       number;
    readonly desc:         string;
    readonly bugs:         number;
    readonly improvements: number;
    readonly tasks:        number;
  }

  interface LifecycleRow {
    readonly label: string;
    readonly pct:   number;
    readonly color: string;
  }

  interface Release {
    readonly name:     string;
    readonly date:     string;
    readonly count:    string;
    readonly upcoming: boolean;
  }

  interface TimelineDot {
    readonly ver:      string;
    readonly released: boolean;
  }

  // -- Static mock data -------------------------------------------------------

  const PROJECTS: ProjectData[] = [
    {
      key: 'kafka', label: 'Kafka', version: 'v3.7.0', open: 412, closed: 1204,
      desc: 'Distributed event streaming platform. High-throughput, fault-tolerant messaging for real-time pipelines.',
      bugs: 58, improvements: 28, tasks: 14,
    },
    {
      key: 'zookeeper', label: 'Zookeeper', version: 'v3.9.2', open: 187, closed: 934,
      desc: 'Centralized coordination service for distributed systems — configuration, naming, synchronization.',
      bugs: 45, improvements: 35, tasks: 20,
    },
    {
      key: 'hive', label: 'Hive', version: 'v4.0.0', open: 301, closed: 1102,
      desc: 'Data warehouse infrastructure providing summarization and SQL-like querying over Hadoop.',
      bugs: 52, improvements: 30, tasks: 18,
    },
    {
      key: 'hdfs', label: 'HDFS', version: 'v3.3.6', open: 218, closed: 876,
      desc: 'Distributed file system providing high-throughput access to large-scale application data.',
      bugs: 38, improvements: 42, tasks: 20,
    },
  ];

  const LIFECYCLE: LifecycleRow[] = [
    { label: '0–2 days',  pct: 62, color: '#1D9E75' },
    { label: '3–7 days',  pct: 22, color: '#378ADD' },
    { label: '8–30 days', pct: 11, color: '#EF9F27' },
    { label: '>30 days',  pct:  5, color: '#E24B4A' },
  ];

  const RELEASES: Release[] = [
    { name: 'Kafka 3.7.0',   date: 'Mar 14, 2025', count: '142 issues',  upcoming: false },
    { name: 'Kafka 3.6.1',   date: 'Jan 28, 2025', count: '67 issues',   upcoming: false },
    { name: 'Zookeeper 3.9', date: 'Dec 12, 2024', count: '93 issues',   upcoming: false },
    { name: 'Kafka 3.8.0',   date: 'Upcoming',     count: '~80 planned', upcoming: true  },
  ];

  const TIMELINE_DOTS: TimelineDot[] = [
    { ver: '3.4.0', released: true  },
    { ver: '3.5.0', released: true  },
    { ver: '3.6.0', released: true  },
    { ver: '3.7.0', released: true  },
    { ver: '3.8.0', released: false },
  ];

  // -- Reactive state ---------------------------------------------------------

  let toggledProjects = $state(new Set<string>(['kafka']));
  let spotlightKey    = $state('kafka');

  const spotlight = $derived(
    PROJECTS.find(p => p.key === spotlightKey) ?? PROJECTS[0]
  );

  function toggleProject(key: string): void {
    const next = new Set(toggledProjects);
    if (next.has(key)) {
      if (next.size === 1) return; // keep at least one active
      next.delete(key);
    } else {
      next.add(key);
    }
    toggledProjects = next;
  }
</script>

<div class="dash">

  <!-- TOP BAR -->
  <header class="topbar">
    <div class="logo">atlas<span>mind</span></div>
    <nav class="nav">
      <button class="nav-item active" type="button">
        <i class="ti ti-layout-dashboard" aria-hidden="true"></i>
        Dashboard
      </button>
      <button class="nav-item" type="button" onclick={onAskAI}>
        <i class="ti ti-message" aria-hidden="true"></i>
        Ask AI
      </button>
      <button class="nav-item" type="button" disabled>
        <i class="ti ti-chart-bar" aria-hidden="true"></i>
        Reports
      </button>
    </nav>
    <div class="spacer"></div>
    <div class="controls">
      <div class="ctrl-btn">
        <i class="ti ti-apps" aria-hidden="true"></i>
        Projects
        <span class="proj-count">4</span>
        <i class="ti ti-chevron-down" aria-hidden="true"></i>
      </div>
      <div class="ctrl-btn">
        <i class="ti ti-calendar" aria-hidden="true"></i>
        Last 90 days
        <i class="ti ti-chevron-down" aria-hidden="true"></i>
      </div>
      <div class="ctrl-btn">
        <i class="ti ti-refresh" aria-hidden="true"></i>
        Refresh
      </div>
    </div>
  </header>

  <!-- MAIN CONTENT -->
  <main class="main">

    <!-- ---- A: KPI SUMMARY ------------------------------------------------- -->
    <div class="section-label">Overview</div>
    <div class="kpi-row">

      <div class="kpi-card">
        <div class="kpi-icon kpi-info"><i class="ti ti-users" aria-hidden="true"></i></div>
        <div class="kpi-label">Active contributors</div>
        <div class="kpi-value">284</div>
        <div class="kpi-delta up">↑ 12% vs prior period</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon kpi-warn"><i class="ti ti-circle-plus" aria-hidden="true"></i></div>
        <div class="kpi-label">New issues</div>
        <div class="kpi-value">1,847</div>
        <div class="kpi-sub">60% bugs · 25% improvements · 15% tasks</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon kpi-success"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <div class="kpi-label">Resolved issues</div>
        <div class="kpi-value">1,612</div>
        <div class="kpi-sub">Avg resolution time: 5.2 days</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon kpi-danger"><i class="ti ti-refresh-alert" aria-hidden="true"></i></div>
        <div class="kpi-label">Reopen rate</div>
        <div class="kpi-value">7%</div>
        <div class="kpi-delta neutral">↔ stable vs prior period</div>
      </div>

    </div>

    <!-- ---- B: ACTIVITY & FLOW --------------------------------------------- -->
    <div class="section-label">Activity &amp; flow</div>
    <div class="activity-row">

      <!-- Left 60% - Activity over time -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Activity over time</span>
          <div class="legend">
            <div class="leg-item"><div class="dot" style="background:#378ADD"></div>Created</div>
            <div class="leg-item"><div class="dot" style="background:#1D9E75"></div>Resolved</div>
            <div class="leg-item"><div class="dot" style="background:#D85A30"></div>Reopened</div>
          </div>
        </div>

        <div class="chart-area">
          <svg class="chart-svg" viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
            <!-- Grid lines -->
            <line x1="0" y1="20"  x2="360" y2="20"  stroke="rgba(255,255,255,0.07)" stroke-width="0.5"/>
            <line x1="0" y1="45"  x2="360" y2="45"  stroke="rgba(255,255,255,0.07)" stroke-width="0.5"/>
            <line x1="0" y1="70"  x2="360" y2="70"  stroke="rgba(255,255,255,0.07)" stroke-width="0.5"/>
            <!-- Created - blue stacked area -->
            <path d="M0,55 C30,40 60,35 90,30 C120,25 150,38 180,28 C210,18 240,20 270,15 C300,10 330,22 360,18 L360,90 L0,90 Z"
              fill="#378ADD" fill-opacity="0.1" stroke="#378ADD" stroke-width="1.5" fill-rule="evenodd"/>
            <!-- Resolved - green stacked area -->
            <path d="M0,65 C30,60 60,52 90,48 C120,44 150,55 180,45 C210,35 240,38 270,32 C300,26 330,36 360,30 L360,90 L0,90 Z"
              fill="#1D9E75" fill-opacity="0.1" stroke="#1D9E75" stroke-width="1.5"/>
            <!-- Reopened - dashed coral line -->
            <path d="M0,82 C30,80 60,83 90,78 C120,73 150,80 180,76 C210,72 240,75 270,71 C300,67 330,73 360,70"
              fill="none" stroke="#D85A30" stroke-width="1" stroke-dasharray="3 2"/>
            <!-- Month axis labels -->
            <text x="0"   y="88" font-size="7" fill="#64748b" font-family="Inter,sans-serif">Jan</text>
            <text x="60"  y="88" font-size="7" fill="#64748b" font-family="Inter,sans-serif">Feb</text>
            <text x="120" y="88" font-size="7" fill="#64748b" font-family="Inter,sans-serif">Mar</text>
            <text x="180" y="88" font-size="7" fill="#64748b" font-family="Inter,sans-serif">Apr</text>
            <text x="240" y="88" font-size="7" fill="#64748b" font-family="Inter,sans-serif">May</text>
            <text x="300" y="88" font-size="7" fill="#64748b" font-family="Inter,sans-serif">Jun</text>
          </svg>
        </div>

        <div class="proj-toggles">
          <span class="toggle-label">Toggle:</span>
          {#each PROJECTS as p (p.key)}
            <button
              class="proj-toggle"
              class:active={toggledProjects.has(p.key)}
              type="button"
              onclick={() => toggleProject(p.key)}
            >{p.label}</button>
            {#if p !== PROJECTS[PROJECTS.length - 1]}<span class="toggle-sep">·</span>{/if}
          {/each}
        </div>
      </div>

      <!-- Right 40% - Issue lifecycle -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Issue lifecycle</span>
          <span class="pill pill-warn">18 long-running</span>
        </div>

        <div class="lc-rows">
          {#each LIFECYCLE as row (row.label)}
            <div class="lc-row">
              <div class="lc-label">{row.label}</div>
              <div class="bar-track">
                <div class="bar-fill" style="width:{row.pct}%;background:{row.color}"></div>
              </div>
              <div class="lc-val">{row.pct}%</div>
            </div>
          {/each}
        </div>

        <div class="lc-summary">
          <div class="lc-stat"><strong>3.0d</strong>Median resolution</div>
          <div class="lc-stat"><strong>18</strong>Open &gt;30d</div>
          <div class="lc-stat"><strong>1:1.1</strong>Create/resolve ratio</div>
        </div>
      </div>

    </div>

    <!-- ---- C: QUALITY & HEALTH -------------------------------------------- -->
    <div class="section-label">Quality &amp; project health</div>
    <div class="bottom-row">

      <!-- Release timeline -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Release timeline</span>
          <span class="pill pill-done">5 releases</span>
        </div>

        <div class="tl-track">
          <div class="tl-line"></div>
          <div class="tl-dots-row">
            {#each TIMELINE_DOTS as d (d.ver)}
              <div class="tl-dot-wrap">
                <div class="tl-dot" class:released={d.released} class:upcoming={!d.released}></div>
                <div class="tl-ver" class:upcoming-text={!d.released}>{d.ver}</div>
              </div>
            {/each}
          </div>
        </div>

        <div class="tl-releases">
          {#each RELEASES as rel (rel.name)}
            <div class="tl-rel" class:upcoming-rel={rel.upcoming}>
              <span class="rel-name">{rel.name}</span>
              <span class="rel-date">{rel.date}</span>
              <span class="rel-cnt">{rel.count}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Project health radar -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Project health radar</span>
        </div>

        <div class="radar-wrap">
          <svg viewBox="0 0 160 148" width="160" height="148" aria-hidden="true">
            <!-- Axis labels -->
            <text x="80"  y="11"  text-anchor="middle" font-size="8" fill="#64748b" font-family="Inter,sans-serif">Throughput</text>
            <text x="154" y="70"  text-anchor="end"    font-size="8" fill="#64748b" font-family="Inter,sans-serif">Stability</text>
            <text x="126" y="140" text-anchor="end"    font-size="8" fill="#64748b" font-family="Inter,sans-serif">Responsiveness</text>
            <text x="34"  y="140" text-anchor="start"  font-size="8" fill="#64748b" font-family="Inter,sans-serif">Activity</text>
            <text x="6"   y="70"  text-anchor="start"  font-size="8" fill="#64748b" font-family="Inter,sans-serif">Quality</text>
            <!-- Grid rings (outer → inner) -->
            <polygon points="80,20 138,58 117,122 43,122 22,58"  fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <polygon points="80,40 119,65 103,107 57,107 41,65"  fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <polygon points="80,58 100,72 89,93 71,93 60,72"     fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <!-- Axis spokes from centre (80,65) -->
            <line x1="80" y1="20"  x2="80"  y2="65"  stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <line x1="80" y1="65"  x2="138" y2="58"  stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <line x1="80" y1="65"  x2="117" y2="122" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <line x1="80" y1="65"  x2="43"  y2="122" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <line x1="80" y1="65"  x2="22"  y2="58"  stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>
            <!-- Kafka - solid blue polygon -->
            <polygon points="80,28 128,60 110,115 50,115 32,62"
              fill="#378ADD" fill-opacity="0.15" stroke="#378ADD" stroke-width="1.2"/>
            <!-- Hive - dashed amber polygon -->
            <polygon points="80,35 112,64 100,104 60,104 48,64"
              fill="#EF9F27" fill-opacity="0.15" stroke="#EF9F27" stroke-width="1" stroke-dasharray="3 2"/>
          </svg>
        </div>

        <div class="radar-legend">
          <span class="radar-leg-item">
            <span class="leg-swatch solid" style="background:#378ADD"></span>Kafka
          </span>
          <span class="radar-leg-item">
            <span class="leg-swatch dashed" style="border-top-color:#EF9F27"></span>Hive
          </span>
        </div>
      </div>

      <!-- Project spotlight -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Project spotlight</span>
          <select class="proj-select" bind:value={spotlightKey}>
            {#each PROJECTS as p (p.key)}
              <option value={p.key}>{p.label}</option>
            {/each}
          </select>
        </div>

        <div class="card-desc">{spotlight.desc}</div>

        <div class="spotlight-meta">
          <span class="meta-pill">
            <i class="ti ti-tag" aria-hidden="true"></i>{spotlight.version}
          </span>
          <span class="pill pill-open">{spotlight.open} open</span>
          <span class="pill pill-done">{spotlight.closed} closed</span>
        </div>

        <div class="sp-bars">
          <div class="sp-row">
            <div class="sp-label">Bugs</div>
            <div class="sp-track"><div class="sp-fill" style="width:{spotlight.bugs}%;background:#E24B4A"></div></div>
            <div class="sp-num">{spotlight.bugs}%</div>
          </div>
          <div class="sp-row">
            <div class="sp-label">Improvmt</div>
            <div class="sp-track"><div class="sp-fill" style="width:{spotlight.improvements}%;background:#378ADD"></div></div>
            <div class="sp-num">{spotlight.improvements}%</div>
          </div>
          <div class="sp-row">
            <div class="sp-label">Tasks</div>
            <div class="sp-track"><div class="sp-fill" style="width:{spotlight.tasks}%;background:#1D9E75"></div></div>
            <div class="sp-num">{spotlight.tasks}%</div>
          </div>
        </div>

        <div class="sparkline-wrap">
          <div class="sparkline-label">Issue activity — last 12 weeks</div>
          <svg viewBox="0 0 200 28" width="100%" height="28" aria-hidden="true">
            <defs>
              <linearGradient id="spk-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stop-color="#378ADD" stop-opacity="0.22"/>
                <stop offset="100%" stop-color="#378ADD" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <polygon
              points="0,22 18,18 36,20 54,12 72,15 90,8 108,10 126,6 144,11 162,8 180,5 200,3 200,28 0,28"
              fill="url(#spk-grad)" stroke="none"/>
            <polyline
              points="0,22 18,18 36,20 54,12 72,15 90,8 108,10 126,6 144,11 162,8 180,5 200,3"
              fill="none" stroke="#378ADD" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
        </div>
      </div>

    </div><!-- /bottom-row -->

  </main>
</div>

<style>
  /* -- Design tokens scoped to .dash ---------------------------------------- */
  .dash {
    --c-bg:         #0c1220;
    --c-bg-card:    #0f1623;
    --c-bg-raised:  #131e31;
    --c-text:       #e2e8f0;
    --c-muted:      #94a3b8;
    --c-sub:        #64748b;
    --c-info:       #378ADD;
    --c-success:    #1D9E75;
    --c-warn:       #EF9F27;
    --c-danger:     #E24B4A;
    --c-border:     rgba(255, 255, 255, 0.07);
    --c-border-mid: rgba(255, 255, 255, 0.13);
    --r-md: 6px;
    --r-lg: 10px;

    display: flex;
    flex-direction: column;
    min-height: 100svh;
    background: var(--c-bg);
    color: var(--c-text);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
  }

  /* -- Top bar --------------------------------------------------------------- */
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 0.5px solid var(--c-border);
    background: var(--c-bg-card);
    flex-shrink: 0;
  }

  .logo {
    font-weight: 500;
    font-size: 14px;
    letter-spacing: -0.2px;
    flex-shrink: 0;
  }
  .logo span { color: var(--c-muted); font-weight: 400; }

  .nav { display: flex; gap: 2px; margin-left: 8px; }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: var(--r-md);
    font-size: 12px;
    color: var(--c-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.14s, color 0.14s;
  }
  .nav-item:hover:not(:disabled) { background: var(--c-bg-raised); color: var(--c-text); }
  .nav-item.active               { background: var(--c-bg-raised); color: var(--c-text); font-weight: 500; }
  .nav-item:disabled             { opacity: 0.4; cursor: default; }

  .spacer { flex: 1; }

  .controls { display: flex; align-items: center; gap: 6px; }

  .ctrl-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 0.5px solid var(--c-border);
    border-radius: var(--r-md);
    font-size: 11px;
    color: var(--c-muted);
    background: var(--c-bg-card);
    cursor: pointer;
    white-space: nowrap;
    transition: border-color 0.14s, color 0.14s;
    user-select: none;
  }
  .ctrl-btn:hover { border-color: var(--c-border-mid); color: var(--c-text); }

  .proj-count {
    background: rgba(55, 138, 221, 0.18);
    color: var(--c-info);
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 500;
  }

  /* -- Main scroll area ------------------------------------------------------ */
  .main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px 20px;
    flex: 1;
    overflow-y: auto;
  }

  /* -- Section labels -------------------------------------------------------- */
  .section-label {
    font-size: 10px;
    font-weight: 500;
    color: var(--c-sub);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: -4px;
  }

  /* -- Shared card shell ----------------------------------------------------- */
  .card {
    background: var(--c-bg-card);
    border-radius: var(--r-lg);
    border: 0.5px solid var(--c-border);
    padding: 14px;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 8px;
  }
  .card-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--c-text);
    white-space: nowrap;
  }
  .card-desc {
    font-size: 10px;
    color: var(--c-muted);
    line-height: 1.55;
    margin-bottom: 8px;
  }

  /* -- Pills ----------------------------------------------------------------- */
  .pill {
    display: inline-flex;
    align-items: center;
    font-size: 9px;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .pill-warn    { background: rgba(239, 159,  39, 0.15); color: var(--c-warn);    }
  .pill-done    { background: rgba( 29, 158, 117, 0.15); color: var(--c-success); }
  .pill-open    { background: rgba( 55, 138, 221, 0.13); color: var(--c-info);    }

  /* -- A: KPI row ------------------------------------------------------------ */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .kpi-card {
    background: var(--c-bg-card);
    border-radius: var(--r-lg);
    border: 0.5px solid var(--c-border);
    padding: 12px 14px;
    transition: border-color 0.14s;
  }
  .kpi-card:hover { border-color: var(--c-border-mid); }

  .kpi-icon          { font-size: 16px; margin-bottom: 6px; }
  .kpi-icon.kpi-info    { color: var(--c-info);    }
  .kpi-icon.kpi-warn    { color: var(--c-warn);    }
  .kpi-icon.kpi-success { color: var(--c-success); }
  .kpi-icon.kpi-danger  { color: var(--c-danger);  }

  .kpi-label {
    font-size: 10px;
    color: var(--c-muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .kpi-value {
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
    margin-bottom: 4px;
  }
  .kpi-sub   { font-size: 10px; color: var(--c-sub); }
  .kpi-delta { font-size: 10px; font-weight: 500; }
  .kpi-delta.up      { color: var(--c-success); }
  .kpi-delta.down    { color: var(--c-danger);  }
  .kpi-delta.neutral { color: var(--c-warn);    }

  /* -- B: Activity row ------------------------------------------------------- */
  .activity-row {
    display: grid;
    grid-template-columns: 60fr 40fr;
    gap: 8px;
  }

  .legend { display: flex; gap: 10px; }
  .leg-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--c-muted);
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .chart-area {
    height: 90px;
    overflow: hidden;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .chart-svg { width: 100%; height: 100%; display: block; }

  .proj-toggles {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 8px;
    border-top: 0.5px solid var(--c-border);
    font-size: 10px;
    flex-wrap: wrap;
  }
  .toggle-label { color: var(--c-sub); }
  .toggle-sep   { color: var(--c-sub); pointer-events: none; }

  .proj-toggle {
    background: none;
    border: none;
    font-size: 10px;
    color: var(--c-sub);
    cursor: pointer;
    font-family: inherit;
    padding: 0;
    transition: color 0.12s;
  }
  .proj-toggle:hover  { color: var(--c-muted); }
  .proj-toggle.active { color: var(--c-info); font-weight: 500; }

  /* Lifecycle */
  .lc-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .lc-row  { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .lc-label { width: 64px; color: var(--c-muted); flex-shrink: 0; }

  .bar-track {
    flex: 1;
    background: var(--c-bg-raised);
    border-radius: 3px;
    height: 8px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }
  .lc-val { width: 28px; text-align: right; color: var(--c-muted); flex-shrink: 0; font-size: 10px; }

  .lc-summary {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 0.5px solid var(--c-border);
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .lc-stat { font-size: 10px; color: var(--c-sub); }
  .lc-stat strong { display: block; font-size: 13px; font-weight: 500; color: var(--c-text); }

  /* -- C: Bottom row --------------------------------------------------------- */
  .bottom-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    padding-bottom: 4px;
  }

  /* Release timeline */
  .tl-track { position: relative; height: 36px; margin: 8px 0 6px; }
  .tl-line  {
    position: absolute;
    top: 13px; left: 4px; right: 4px;
    height: 1px;
    background: var(--c-border-mid);
  }
  .tl-dots-row {
    display: flex;
    justify-content: space-between;
    padding: 0 4px;
  }
  .tl-dot-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .tl-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    border: 2px solid var(--c-border-mid);
    background: var(--c-bg-card);
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }
  .tl-dot.released { background: var(--c-success); border-color: transparent; }
  .tl-dot.upcoming { background: var(--c-bg-card); border-color: var(--c-warn); }

  .tl-ver { font-size: 9px; color: var(--c-sub); white-space: nowrap; }
  .tl-ver.upcoming-text { color: var(--c-warn); }

  .tl-releases { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .tl-rel {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--c-muted);
    gap: 4px;
  }
  .tl-rel.upcoming-rel { color: var(--c-warn); }
  .rel-name { font-weight: 500; color: var(--c-text); flex-shrink: 0; }
  .tl-rel.upcoming-rel .rel-name { color: var(--c-warn); }
  .rel-date { flex: 1; text-align: center; }
  .rel-cnt  { color: var(--c-sub); flex-shrink: 0; }

  /* Radar */
  .radar-wrap { display: flex; justify-content: center; margin: 4px 0; }
  .radar-legend {
    display: flex;
    justify-content: center;
    gap: 14px;
    font-size: 9px;
    color: var(--c-muted);
  }
  .radar-leg-item { display: flex; align-items: center; gap: 5px; }
  .leg-swatch {
    display: inline-block;
    width: 8px;
    flex-shrink: 0;
  }
  .leg-swatch.solid  { height: 2px; border-radius: 1px; }
  .leg-swatch.dashed { height: 0; border-top: 1.5px dashed; background: transparent; }

  /* Spotlight */
  .spotlight-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 10px;
  }
  .meta-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--c-muted);
  }

  .sp-bars { display: flex; flex-direction: column; gap: 5px; }
  .sp-row  { display: flex; align-items: center; gap: 6px; font-size: 10px; color: var(--c-muted); }
  .sp-label { width: 44px; flex-shrink: 0; }
  .sp-track {
    flex: 1; height: 6px;
    background: var(--c-bg-raised);
    border-radius: 3px;
    overflow: hidden;
  }
  .sp-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
  .sp-num  { width: 24px; text-align: right; flex-shrink: 0; }

  .sparkline-wrap {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 0.5px solid var(--c-border);
  }
  .sparkline-label { font-size: 10px; color: var(--c-sub); margin-bottom: 4px; }

  /* Project selector */
  .proj-select {
    appearance: none;
    background: var(--c-bg-raised);
    border: 0.5px solid var(--c-border);
    color: var(--c-muted);
    font-size: 10px;
    padding: 3px 8px;
    border-radius: var(--r-md);
    cursor: pointer;
    font-family: inherit;
    outline: none;
    transition: border-color 0.14s;
  }
  .proj-select:hover  { border-color: var(--c-border-mid); color: var(--c-text); }
  .proj-select option { background: #131e31; color: #e2e8f0; }
</style>
