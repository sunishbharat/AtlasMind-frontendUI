<script lang="ts">
  import { buildPie, buildBar } from '../charts/specBuilder.js';
  import ChartCard from './ChartCard.svelte';
  import { dashboardStore } from './dashboardStore.svelte.js';
  import { authStore } from '../auth.svelte.js';
  import { aggregateIssues } from './aggregateUtils.js';
  import type { ChartConfig } from './dashboardTypes.js';

  // - Types --------------------------------------------------------------------
  type Dimension = 'status' | 'priority' | 'assignee' | 'project' | 'issuetype';

  // - Dropdown options ---------------------------------------------------------
  const PIE_DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'project', label: 'Project' },
    { value: 'issuetype', label: 'Type' },
  ];

  const BAR_X_OPTIONS = [
    { value: 'assignee', label: 'Assignee' },
    { value: 'project', label: 'Project' },
    { value: 'priority', label: 'Priority' },
    { value: 'status', label: 'Status' },
    { value: 'issuetype', label: 'Type' },
  ];

  // - Mock data ----------------------------------------------------------------
  const MOCK_PIE: Record<Dimension, [string, number][]> = {
    status: [['Open', 124], ['In Progress', 89], ['Resolved', 58], ['Closed', 13]],
    priority: [['Critical', 34], ['High', 89], ['Medium', 112], ['Low', 49]],
    assignee: [['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18]],
    project: [['Kafka', 92], ['Zookeeper', 71], ['Hive', 65], ['HDFS', 56]],
    issuetype: [['Story', 78], ['Bug', 45], ['Task', 32], ['Epic', 15]],
  };

  const MOCK_BAR: Record<string, [string, number][]> = {
    assignee: [['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18]],
    project: [['Kafka', 92], ['Zookeeper', 71], ['Hive', 65], ['HDFS', 56]],
    priority: [['Critical', 34], ['High', 89], ['Medium', 112], ['Low', 49]],
    status: [['Open', 124], ['In Progress', 89], ['Resolved', 58], ['Closed', 13]],
    issuetype: [['Story', 78], ['Bug', 45], ['Task', 32], ['Epic', 15]],
  };

  // - Config: add/remove/reorder charts here ----------------------------------
  const DASHBOARD_CHARTS: ChartConfig[] = [
    {
      id: 'pie',
      title: 'Pie Chart',
      type: 'pie',
      defaultDimension: 'status',
      options: PIE_DIMENSIONS,
      builder: buildPie as (data: [string, number][], dim: string, maxItems?: number, gradient?: boolean) => object,
      mockData: MOCK_PIE as Record<string, [string, number][]>,
    },
    {
      id: 'bar',
      title: 'Bar Chart',
      type: 'bar',
      defaultDimension: 'assignee',
      options: BAR_X_OPTIONS,
      builder: buildBar as (data: [string, number][], dim: string, maxItems?: number, gradient?: boolean) => object,
      mockData: MOCK_BAR as Record<string, [string, number][]>,
    },
  ];

  // - State per chart ---------------------------------------------------------
  const dimensions = $state<Record<string, string>>({});

  // Initialize dimensions from config
  $effect(() => {
    for (const cfg of DASHBOARD_CHARTS) {
      if (cfg.defaultDimension && !(cfg.id in dimensions)) {
        dimensions[cfg.id] = cfg.defaultDimension;
      }
    }
  });

  // - Query trigger -----------------------------------------------------------
  async function triggerQuery(chartId: string, query: string): Promise<void> {
    if (!query.trim()) return;

    dashboardStore.setLoading(chartId, true);
    dashboardStore.setQuery(chartId, query);

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, pat: authStore.pat || undefined }),
      });
      const data = await res.json();
      console.log('[Dashboard] query response:', data.output?.type, '| issues:', data.output?.issues?.length);

      if (data.output?.type === 'jql' && data.output.issues?.length) {
        // Use shared utility - no need to worry about chart_spec format
        const dim = dimensions[chartId] || 'status';
        const aggData = await aggregateIssues(
          data.output.issues,
          {
            chartType: chartId === 'pie' ? 'pie' : 'bar',
            xField: dim,
          },
          authStore.pat || undefined
        );

        console.log('[Dashboard] aggregate response:', aggData.chart_type, '| pie_data:', !!aggData.pie_data, '| series:', aggData.series?.length);
        dashboardStore.setResult(chartId, aggData, data.output.issues);
      } else {
        dashboardStore.setLoading(chartId, false);
      }
    } catch (err) {
      console.error('[Dashboard] Query failed:', err);
      dashboardStore.setLoading(chartId, false);
    }
  }

  function handleDimensionChange(chartId: string, value: string): void {
    dimensions[chartId] = value;

    // If we already have issues for this chart, re-aggregate with the new dimension
    const chartData = dashboardStore.getChartData(chartId);
    if (chartData?.issues?.length) {
      reAggregate(chartId, chartData.issues, value);
    }
  }

  async function reAggregate(chartId: string, issues: ApiIssue[], dim: string): Promise<void> {
    dashboardStore.setLoading(chartId, true);
    try {
      const aggData = await aggregateIssues(
        issues,
        {
          chartType: chartId === 'pie' ? 'pie' : 'bar',
          xField: dim,
        },
        authStore.pat || undefined
      );
      dashboardStore.setResult(chartId, aggData, issues);
    } catch (err) {
      console.error('[Dashboard] re-aggregate failed:', err);
      dashboardStore.setLoading(chartId, false);
    }
  }
</script>

<div class="dash-simple">
  <main class="charts-row">
    {#each DASHBOARD_CHARTS as cfg}
      <ChartCard
        config={cfg}
        dimension={dimensions[cfg.id] ?? cfg.defaultDimension ?? ''}
        onDimensionChange={(v) => handleDimensionChange(cfg.id, v)}
        onQuery={(q) => triggerQuery(cfg.id, q)}
      />
    {/each}
  </main>
</div>

<style>
  .dash-simple {
    min-height: 100vh;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Inter', system-ui, sans-serif;
    padding: 16px;
  }

  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    height: calc(100vh - 80px);
  }

  @media (max-width: 768px) {
    .charts-row {
      grid-template-columns: 1fr;
      height: auto;
    }
  }
</style>