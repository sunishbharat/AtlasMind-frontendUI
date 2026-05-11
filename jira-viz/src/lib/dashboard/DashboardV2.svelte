<script lang="ts">
  import { buildPie, buildBar, buildSingleLine } from '../charts/specBuilder.js';
  import ChartCard from './ChartCard.svelte';
  import { dashboardStore } from './dashboardStore.svelte.js';
  import { authStore } from '../auth.svelte.js';
  import { aggregateIssues } from './aggregateUtils.js';
  import type { ChartConfig } from './dashboardTypes.js';
  import type { ApiIssue } from '../charts/chartStore.svelte.js';

  // - Types --------------------------------------------------------------------
  type Dimension = 'status' | 'priority' | 'assignee' | 'project' | 'issuetype';
  type TimeField = 'created' | 'resolutiondate' | 'updated';

  // Map backend fields to our dimension keys (like ChartView)
  const FIELD_TO_DIMENSION: Record<string, string> = {
    'status': 'status',
    'priority': 'priority',
    'assignee': 'assignee',
    'project': 'project',
    'issuetype': 'issuetype',
    'issue type': 'issuetype',
  };

  // Derive categorical fields from issues (cardinality 2-15 for good grouping)
  function deriveCategoricalFields(issues: ApiIssue[]): { value: string; label: string }[] {
    if (!issues.length) return [];
    const fields: { value: string; label: string }[] = [];
    const skipFields = new Set(['key', 'summary', 'description', 'id', 'url', 'link']);
    for (const key of Object.keys(issues[0])) {
      if (skipFields.has(key.toLowerCase())) continue;
      const sample = issues.find((i) => i[key] != null)?.[key];
      // Skip numeric fields
      if (sample != null && !isNaN(Number(sample))) continue;
      const uniqueCount = new Set(
        issues.slice(0, 100).map((i) => String(i[key] ?? '')).filter(Boolean)
      ).size;
      if (uniqueCount >= 2 && uniqueCount <= 15) {
        fields.push({ value: key.toLowerCase(), label: key });
      }
    }
    return fields;
  }

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
  const DEFAULT_TREND_BREAKDOWN: { value: BreakdownField; label: string }[] = [
    { value: '', label: 'None' },
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'issuetype', label: 'Type' },
  ];

  // Dynamic trend options - will be populated from query response
  let trendBreakdownOptions$ = $state<{ value: string; label: string }[]>(DEFAULT_TREND_BREAKDOWN);

  // Dynamic bar options - populated from display_fields after query
  let barDimensionOptions$ = $state<{ value: string; label: string }[]>(BAR_X_OPTIONS);

  // Dynamic pie options - populated from display_fields after query
  let pieDimensionOptions$ = $state<{ value: string; label: string }[]>(PIE_DIMENSIONS);

  // Dynamic line options - populated from display_fields after query
  let lineDimensionOptions$ = $state<{ value: string; label: string }[]>(LINE_DIMENSIONS);

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

        // Update trend breakdown options from display_fields
        const displayFields = data.output.display_fields || [];
        const trendOpts = displayFields
          .filter(f => FIELD_TO_DIMENSION[f.toLowerCase()])
          .map(f => ({ value: FIELD_TO_DIMENSION[f.toLowerCase()], label: f }));
        if (trendOpts.length > 0) {
          trendBreakdownOptions$ = [{ value: '', label: 'None' }, ...trendOpts];
        }

        // Update bar options from issues (derive categorical fields by cardinality)
        const barOpts = deriveCategoricalFields(issues);
        if (barOpts.length > 0) {
          barDimensionOptions$ = barOpts;
        }

        // Update pie options from display_fields
        const pieOpts = displayFields
          .filter(f => FIELD_TO_DIMENSION[f.toLowerCase()])
          .map(f => ({ value: FIELD_TO_DIMENSION[f.toLowerCase()], label: f }));
        if (pieOpts.length > 0) {
          pieDimensionOptions$ = pieOpts;
        }

        // Update line options from display_fields (time fields)
        const timeFields = ['created', 'resolved', 'updated', 'resolutiondate'];
        const lineOpts = displayFields
          .filter(f => timeFields.includes(f.toLowerCase()))
          .map(f => ({ value: f.toLowerCase(), label: f }));
        if (lineOpts.length > 0) {
          lineDimensionOptions$ = lineOpts;
        }

        const aggOptions = {
          chartType,
          xField: dim,
          displayFields,
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
    const issues = dashboardStore.charts[chartId]?.issues || [];
    if (issues.length) {
      reAggregate(chartId, issues, value);
    }
  }

  function handleBreakdownChange(chartId: string, value: string): void {
    trendBreakdowns[chartId] = value;
  }

  function handleSeriesChange(chartId: string, value: string, checked: boolean): void {
    const current = trendSeries[chartId] || [];
    if (checked && !current.includes(value)) {
      trendSeries[chartId] = [...current, value];
    } else if (!checked) {
      trendSeries[chartId] = current.filter(v => v !== value);
    }
  }

  async function reAggregate(chartId: string, issues: ApiIssue[], dim: string): Promise<void> {
    dashboardStore.setLoading(chartId, true);
    try {
      const chartType = getChartType(chartId);
      const displayFields = (dashboardStore.charts[chartId]?.result as any)?.x_axis || [];
      const aggOptions: any = {
        chartType,
        xField: dim,
      };
      if (chartType === 'line') {
        aggOptions.colorField = 'status';
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
          dynamicOptions={
            cfg.id === 'bar' ? barDimensionOptions$ :
            cfg.id === 'pie' ? pieDimensionOptions$ :
            cfg.id === 'line' ? lineDimensionOptions$ : undefined
          }
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
    min-height: 0;
  }

  .chart-wrapper {
    min-height: 0;
    display: flex;
  }

  @media (max-width: 768px) {
    .charts-grid {
      grid-template-columns: 1fr;
      grid-template-rows: repeat(4, 1fr);
    }
  }
</style>