<script lang="ts">
  import { buildPie, buildBar, buildSingleLine } from '../charts/specBuilder.js';
  import ChartCard from './ChartCard.svelte';
  import { dashboardStore } from './dashboardStore.svelte.js';
  import { authStore } from '../auth.svelte.js';
  import { aggregateIssues } from './aggregateUtils.js';
  import type { ChartConfig } from './dashboardTypes.js';
  import type { ApiIssue } from '../charts/chartStore.svelte.js';
  import { chartStore } from '../charts/index.js';

  // - Types --------------------------------------------------------------------
  type Dimension = 'status' | 'priority' | 'assignee' | 'project' | 'issuetype';
  type TimeField = 'created' | 'resolutiondate' | 'updated';

  // - Dynamic field options from backend ----------------------------------------
  // Derive available fields from the last AI query response
  const availableFields = $derived(chartStore.data?.display_fields ?? []);
  const availableFieldSet = $derived(new Set(availableFields.map(f => f.toLowerCase())));

  // Map backend fields to our dimension keys
  const FIELD_TO_DIMENSION: Record<string, Dimension> = {
    'status': 'status',
    'priority': 'priority',
    'assignee': 'assignee',
    'project': 'project',
    'issuetype': 'issuetype',
    'issue type': 'issuetype',
  };

  const TIME_FIELDS = ['created', 'resolved', 'updated', 'resolutiondate'];
  const timeFieldOptions = $derived(
    availableFields
      .filter(f => TIME_FIELDS.includes(f.toLowerCase()))
      .map(f => ({ value: f.toLowerCase() as TimeField, label: f }))
  );

  const trendBreakdownOptions = $derived(
    availableFields
      .filter(f => FIELD_TO_DIMENSION[f.toLowerCase()])
      .map(f => ({
        value: FIELD_TO_DIMENSION[f.toLowerCase()],
        label: f
      }))
  );

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

  const LINE_DIMENSIONS: { value: TimeField; label: string }[] = [
    { value: 'created', label: 'Created' },
    { value: 'resolutiondate', label: 'Resolved' },
    { value: 'updated', label: 'Updated' },
  ];

  // - Trend chart breakdown options (dynamic from backend fields) ---------------
  type BreakdownField = 'status' | 'priority' | 'assignee' | 'issuetype' | '';
  // Default fallback options when no backend fields available
  const DEFAULT_TREND_BREAKDOWN: { value: BreakdownField; label: string }[] = [
    { value: '', label: 'None' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'issuetype', label: 'Type' },
  ];

  const trendBreakdownOptions$ = $derived(
    trendBreakdownOptions.length > 0
      ? [{ value: '' as BreakdownField, label: 'None' }, ...trendBreakdownOptions.map(o => ({ value: o.value as BreakdownField, label: o.label }))]
      : DEFAULT_TREND_BREAKDOWN
  );

  // - Trend chart series options ---------------------------------------------
  const DEFAULT_TREND_SERIES = [
    { value: 'open', label: 'Open (cumulative)' },
    { value: 'created', label: 'Created' },
    { value: 'resolved', label: 'Resolved' },
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

  const MOCK_LINE: Record<TimeField, [string, number][]> = {
    created: [['Jan', 45], ['Feb', 62], ['Mar', 78], ['Apr', 55], ['May', 89], ['Jun', 72]],
    resolutiondate: [['Jan', 38], ['Feb', 55], ['Mar', 68], ['Apr', 72], ['May', 81], ['Jun', 65]],
    updated: [['Jan', 50], ['Feb', 58], ['Mar', 85], ['Apr', 62], ['May', 77], ['Jun', 70]],
  };

  // - Config: add/remove/reorder charts here ----------------------------------
  // Wrapper functions to adapt builder signatures
  const pieBuilder = (data: [string, number][], _dim: string, maxItems = 10, gradient = true) =>
    buildPie(data, 'Pie Chart', maxItems, gradient);
  const barBuilder = (data: [string, number][], _dim: string, maxItems = 20, gradient = true) =>
    buildBar(data, 'Bar Chart', maxItems, gradient);
  const lineBuilder = (data: [string, number][], _dim: string, _maxItems?: number, _gradient?: boolean) =>
    buildSingleLine(data, 'Line Chart', true);
  const trendBuilder = (data: [string, number][], _dim: string, _maxItems?: number, _gradient?: boolean) =>
    buildSingleLine(data, 'Trend Chart', true);

  const DASHBOARD_CHARTS: ChartConfig[] = [
    {
      id: 'pie',
      title: 'Pie Chart',
      type: 'pie',
      defaultDimension: 'status',
      options: PIE_DIMENSIONS,
      builder: pieBuilder,
      mockData: MOCK_PIE as Record<string, [string, number][]>,
    },
    {
      id: 'bar',
      title: 'Bar Chart',
      type: 'bar',
      defaultDimension: 'assignee',
      options: BAR_X_OPTIONS,
      builder: barBuilder,
      mockData: MOCK_BAR as Record<string, [string, number][]>,
    },
    {
      id: 'line',
      title: 'Line Chart',
      type: 'line',
      defaultDimension: 'created',
      options: LINE_DIMENSIONS,
      builder: lineBuilder,
      mockData: MOCK_LINE as Record<string, [string, number][]>,
    },
    {
      id: 'trend',
      title: 'Trend Chart',
      type: 'trend',
      // secondaryOptions will be overridden at render time with dynamic options
      secondaryOptions: DEFAULT_TREND_BREAKDOWN,
      seriesOptions: DEFAULT_TREND_SERIES,
      defaultSeries: ['open', 'created', 'resolved'],
      builder: trendBuilder,
      mockData: MOCK_LINE as Record<string, [string, number][]>,
    },
  ];

  // - State per chart ---------------------------------------------------------
  const dimensions = $state<Record<string, string>>({});
  const trendBreakdowns = $state<Record<string, string>>({});
  const trendSeries = $state<Record<string, string[]>>({});

  // Initialize dimensions from config
  $effect(() => {
    for (const cfg of DASHBOARD_CHARTS) {
      if (cfg.defaultDimension && !(cfg.id in dimensions)) {
        dimensions[cfg.id] = cfg.defaultDimension;
      }
      // Initialize trend chart series defaults
      if (cfg.id === 'trend' && cfg.defaultSeries && !(cfg.id in trendSeries)) {
        trendSeries[cfg.id] = [...cfg.defaultSeries];
      }
    }
  });

  // - Chart type mapping ------------------------------------------------------
  function getChartType(chartId: string): 'pie' | 'bar' | 'line' | 'trend' {
    switch (chartId) {
      case 'pie': return 'pie';
      case 'line': return 'line';
      case 'trend': return 'trend';
      default: return 'bar';
    }
  }

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

      if (data.output?.type === 'jql' && data.output.issues?.length) {
        const dim = dimensions[chartId] || 'status';
        const chartType = getChartType(chartId);
        const issues = data.output.issues;

        // For line charts, add colorField to get multi-line (grouped by status)
        const aggOptions = {
          chartType,
          xField: dim,
        };
        if (chartType === 'line') {
          (aggOptions as any).colorField = 'status';
        }

        const aggData = await aggregateIssues(
          issues,
          aggOptions,
          authStore.pat || undefined
        );

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

  function handleBreakdownChange(chartId: string, value: string): void {
    trendBreakdowns[chartId] = value;
    // Re-render with new breakdown
    const chartData = dashboardStore.getChartData(chartId);
    if (chartData?.issues?.length) {
      dashboardStore.setResult(chartId, chartData.result, chartData.issues);
    }
  }

  function handleSeriesChange(chartId: string, value: string, checked: boolean): void {
    const current = trendSeries[chartId] ?? ['open', 'created', 'resolved'];
    if (checked && !current.includes(value)) {
      trendSeries[chartId] = [...current, value];
    } else if (!checked) {
      trendSeries[chartId] = current.filter(s => s !== value);
    }
    // Trigger re-render
    const chartData = dashboardStore.getChartData(chartId);
    if (chartData?.issues?.length) {
      dashboardStore.setResult(chartId, chartData.result, chartData.issues);
    }
  }

  async function reAggregate(chartId: string, issues: ApiIssue[], dim: string): Promise<void> {
    dashboardStore.setLoading(chartId, true);
    try {
      const chartType = getChartType(chartId);
      const aggOptions = {
        chartType,
        xField: dim,
      };
      // For line charts, add colorField to get multi-line (grouped by status)
      if (chartType === 'line') {
        (aggOptions as any).colorField = 'status';
      }

      const aggData = await aggregateIssues(issues, aggOptions, authStore.pat || undefined);
      dashboardStore.setResult(chartId, aggData, issues);
    } catch (err) {
      console.error('[Dashboard] re-aggregate failed:', err);
      dashboardStore.setLoading(chartId, false);
    }
  }
</script>

<div class="dash-container">
  <main class="charts-grid">
    {#each DASHBOARD_CHARTS as cfg}
      <div class="chart-wrapper">
        <ChartCard
          config={cfg}
          dimension={dimensions[cfg.id] ?? cfg.defaultDimension ?? ''}
          secondaryDimension={trendBreakdowns[cfg.id] ?? ''}
          selectedSeries={trendSeries[cfg.id] ?? cfg.defaultSeries ?? []}
          onDimensionChange={(v) => handleDimensionChange(cfg.id, v)}
          onSecondaryChange={(v) => handleBreakdownChange(cfg.id, v)}
          onSeriesChange={(v, checked) => handleSeriesChange(cfg.id, v, checked)}
          onQuery={(q) => triggerQuery(cfg.id, q)}
          dynamicSecondaryOptions={cfg.id === 'trend' ? trendBreakdownOptions$ : undefined}
        />
      </div>
    {/each}
  </main>
</div>

<style>
  .dash-container {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Inter', system-ui, sans-serif;
    padding: clamp(0.75rem, 1.5vw, 1rem);
    box-sizing: border-box;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: clamp(0.5rem, 1vw, 1rem);
    flex: 1;
    width: 100%;
    max-width: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  .chart-wrapper {
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    box-sizing: border-box;
  }

  /* Tablet (< 1024px) */
  @media (max-width: 1024px) {
    .charts-grid {
      gap: 0.75rem;
    }
  }

  /* Mobile (< 768px) - single column */
  @media (max-width: 768px) {
    .dash-container {
      height: auto;
      min-height: 400px;
    }

    .charts-grid {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(4, minmax(150px, 1fr));
      gap: 0.75rem;
      min-height: 400px;
    }
  }

  /* Small mobile (< 480px) */
  @media (max-width: 480px) {
    .dash-container {
      padding: 0.5rem;
    }

    .charts-grid {
      gap: 0.5rem;
    }
  }
</style>