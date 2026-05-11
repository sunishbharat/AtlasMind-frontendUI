<script lang="ts">
  import Logo from './Logo.svelte';
  import ChartRenderer from './charts/ChartRenderer.svelte';
  import { buildBar, buildPie, buildSingleLine } from './charts/specBuilder.js';

  let currentQuery = $state(0);
  let displayedText = $state('');
  let isTyping = $state(true);

  const queries = [
    { q: 'Which team has the most unresolved blockers?', chart: 'bar' },
    { q: 'Show bug trends over the last 3 months', chart: 'line' },
    { q: 'What\'s our sprint velocity for Q4?', chart: 'pie' },
  ];

  const features = [
    {
      icon: '💬',
      title: 'Plain English, no SQL',
      desc: 'Ask "Which team has the most unresolved blockers?" and get a chart — not a query builder.',
    },
    {
      icon: '📊',
      title: 'Instant visualisations',
      desc: 'Bar charts, pie charts, trend lines, and burndowns — generated automatically from your question.',
    },
    {
      icon: '🔒',
      title: 'Your data stays in Jira',
      desc: 'AtlasMind queries your project data live. It never stores, indexes, or shares it.',
    },
  ];

  // Sample data for demo charts
  const MOCK_DATA = {
    bar: [['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18]] as [string, number][],
    pie: [['Open', 124], ['In Progress', 89], ['Resolved', 58], ['Closed', 13]] as [string, number][],
    line: [['Jan', 45], ['Feb', 62], ['Mar', 78], ['Apr', 55], ['May', 89], ['Jun', 72]] as [string, number][],
  };

  function buildDemoChart(type: string) {
    switch (type) {
      case 'bar':
        return buildBar(MOCK_DATA.bar, 'Team Workload', 20, true);
      case 'pie':
        return buildPie(MOCK_DATA.pie, 'Issue Status', 10, true);
      case 'line':
        return buildSingleLine(MOCK_DATA.line, 'Bug Trends', true);
      default:
        return buildBar(MOCK_DATA.bar, 'Team Workload', 20, true);
    }
  }

  $effect(() => {
    const query = queries[currentQuery];
    let i = 0;
    displayedText = '';
    isTyping = true;

    const typeInterval = setInterval(() => {
      if (i < query.q.length) {
        displayedText = query.q.slice(0, i + 1);
        i++;
      } else {
        clearInterval(typeInterval);
        isTyping = false;
        setTimeout(() => {
          currentQuery = (currentQuery + 1) % queries.length;
        }, 3000);
      }
    }, 50);

    return () => clearInterval(typeInterval);
  });

  function goToDashboard() {
    window.location.hash = '#/dashboard';
    window.location.reload();
  }
</script>

<div class="landing">
  <!-- Nav -->
  <nav class="nav">
    <Logo variant="full" />
    <div class="nav-links">
      <a href="https://github.com/sunishbharat/atlasMind-Lite" target="_blank" class="nav-link">GitHub</a>
      <button class="cta-btn" onclick={goToDashboard}>
        Open the dashboard →
      </button>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="badges">
      <span class="badge">Open Source</span>
      <span class="badge">Free Forever</span>
      <span class="badge">No Account Required</span>
    </div>
    <h1 class="headline">Ask your Jira data anything. Get answers in seconds.</h1>
    <p class="subheadline">
      No dashboards to build. No SQL to write. No account to create.
      Type a question in plain English — AtlasMind turns your Jira backlog
      into instant charts and insights. Free and open source, forever.
    </p>
    <button class="primary-cta" onclick={goToDashboard}>
      Open the dashboard →
    </button>
    <p class="reassurance">No signup. No installation. Works in your browser.</p>
  </section>

  <!-- Query Demo -->
  <section class="demo">
    <div class="demo-window">
      <div class="demo-header">
        <span class="demo-dot"></span>
        <span class="demo-dot"></span>
        <span class="demo-dot"></span>
      </div>
      <div class="demo-content">
        <div class="demo-query">
          <span class="query-icon">›</span>
          <span class="query-text">{displayedText}</span>
          {#if isTyping}
            <span class="cursor">|</span>
          {/if}
        </div>
        <div class="demo-response">
          <div class="demo-chart">
            <ChartRenderer option={buildDemoChart(queries[currentQuery].chart)} height="200px" />
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature Cards -->
  <section class="features">
    {#each features as feature}
      <div class="feature-card">
        <span class="feature-icon">{feature.icon}</span>
        <h3 class="feature-title">{feature.title}</h3>
        <p class="feature-desc">{feature.desc}</p>
      </div>
    {/each}
  </section>

  <!-- OSS Trust Strip -->
  <section class="trust">
    <p class="trust-tagline">Read the source, run it yourself, or contribute — it's all on GitHub.</p>
  </section>

  <!-- Footer CTA -->
  <footer class="footer">
    <p class="footer-cta">Nothing to install. Nothing to pay. Nothing to sign up for.</p>
    <button class="primary-cta" onclick={goToDashboard}>
      Open the dashboard →
    </button>
    <p class="footer-legal">
      © 2026 AtlasMind · MIT Licensed ·
      <a href="https://github.com/sunishbharat/atlasMind-Lite" target="_blank" rel="noopener">GitHub</a>
    </p>
  </footer>
</div>

<style>
  .landing {
    min-height: 100vh;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Inter', system-ui, sans-serif;
  }

  /* Nav */
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid #21262d;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .nav-link {
    color: #8b949e;
    text-decoration: none;
    font-size: 0.875rem;
  }

  .nav-link:hover {
    color: #e6edf3;
  }

  .cta-btn {
    background: #238636;
    color: #fff;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .cta-btn:hover {
    background: #2ea043;
  }

  /* Hero */
  .hero {
    text-align: center;
    padding: 4rem 2rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .badges {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .badge {
    background: #21262d;
    color: #8b949e;
    padding: 0.375rem 0.75rem;
    border-radius: 20px;
    font-size: 0.75rem;
    border: 1px solid #30363d;
  }

  .headline {
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0 0 1rem 0;
    line-height: 1.2;
  }

  .subheadline {
    font-size: 1.125rem;
    color: #8b949e;
    line-height: 1.6;
    margin: 0 0 2rem 0;
  }

  .primary-cta {
    background: #4B6EF5;
    color: #fff;
    border: none;
    padding: 0.875rem 1.5rem;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .primary-cta:hover {
    background: #5a7bf7;
  }

  .reassurance {
    margin: 1rem 0 0 0;
    font-size: 0.875rem;
    color: #6e7681;
  }

  /* Demo */
  .demo {
    padding: 2rem;
    max-width: 700px;
    margin: 0 auto;
  }

  .demo-window {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    overflow: hidden;
  }

  .demo-header {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #21262d;
    border-bottom: 1px solid #30363d;
  }

  .demo-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #484f58;
  }

  .demo-content {
    padding: 1.5rem;
  }

  .demo-query {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-family: monospace;
    margin-bottom: 1rem;
  }

  .query-icon {
    color: #4B6EF5;
    font-size: 1.5rem;
  }

  .query-text {
    color: #e6edf3;
  }

  .cursor {
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }

  .demo-response {
    background: #0d1117;
    border-radius: 8px;
    padding: 1rem;
  }

  .demo-chart {
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .demo-chart :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }

  /* Features */
  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
    padding: 3rem 2rem;
    max-width: 1000px;
    margin: 0 auto;
  }

  .feature-card {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 12px;
    padding: 1.5rem;
  }

  .feature-icon {
    font-size: 2rem;
    display: block;
    margin-bottom: 1rem;
  }

  .feature-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.75rem 0;
  }

  .feature-desc {
    font-size: 0.875rem;
    color: #8b949e;
    margin: 0;
    line-height: 1.5;
  }

  /* Trust */
  .trust {
    text-align: center;
    padding: 2rem;
    border-top: 1px solid #21262d;
    border-bottom: 1px solid #21262d;
  }

  .trust-tagline {
    color: #8b949e;
    font-size: 0.875rem;
    margin: 0;
  }

  /* Footer */
  .footer {
    text-align: center;
    padding: 3rem 2rem;
  }

  .footer-cta {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 1.5rem 0;
  }

  .footer-legal {
    margin: 2rem 0 0 0;
    font-size: 0.75rem;
    color: #6e7681;
  }

  .footer-legal a {
    color: #8b949e;
    text-decoration: none;
  }

  .footer-legal a:hover {
    color: #e6edf3;
    text-decoration: underline;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .hero {
      padding: 2rem 1rem;
    }

    .headline {
      font-size: 1.75rem;
    }

    .features {
      grid-template-columns: 1fr;
      padding: 2rem 1rem;
    }

    .nav {
      padding: 1rem;
    }
  }
</style>