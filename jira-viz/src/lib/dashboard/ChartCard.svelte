<script lang="ts">
  import type { ChartConfig } from './dashboardTypes.js';
  import { dashboardStore } from './dashboardStore.svelte.js';
  import ChartRenderer from '../charts/ChartRenderer.svelte';
  import { LineChart, TrendChart } from '../charts/specBuilder.js';
  import type { AggregateResponse } from '../charts/chartStore.svelte.js';
  import type { ApiIssue } from '../charts/chartStore.svelte.js';
  import SegmentedControl from './SegmentedControl.svelte';

  interface Props {
    config: ChartConfig;
    dimension: string;
    secondaryDimension?: string;
    selectedSeries?: string[];
    onDimensionChange: (val: string) => void;
    onSecondaryChange?: (val: string) => void;
    onSeriesChange?: (val: string, checked: boolean) => void;
    onQuery: (query: string) => void;
  }

  let {
    config,
    dimension,
    secondaryDimension = '',
    selectedSeries = [],
    onDimensionChange,
    onSecondaryChange,
    onSeriesChange,
    onQuery,
  }: Props = $props();

  const chartData = $derived(dashboardStore.charts[config.id]);
  const hasData = $derived(!!chartData?.result);
  const loading = $derived(chartData?.loading ?? false);
  const queryValue = $derived(chartData?.query ?? '');
  const rawIssues = $derived(chartData?.issues ?? []);

  // Build chart option based on chart type
  const chartOption = $derived.by(() => {
    const result = chartData?.result;

    // For trend, use TrendChart class with configurable options
    if (config.type === 'trend' && rawIssues.length > 0) {
      return new TrendChart(rawIssues, {
        title: config.title,
        animation: true,
        timeField: dimension as 'created' | 'resolutiondate' | 'updated',
        breakdownField: secondaryDimension as 'status' | 'priority' | 'assignee' | 'issuetype' | '',
        seriesToShow: selectedSeries,
      }).build();
    }

    // For line chart - use LineChart class with proper series support
    if (config.type === 'line') {
      // If we have multi-series data from aggregate (color_field was used)
      if (result?.series && result.series.length > 0) {
        return new LineChart()
          .setTitle(config.title)
          .setSeriesFromAggregate(result.x_axis ?? [], result.series)
          .build();
      }
      // Single line with simple data
      if (result) {
        const data = convertResultToData(result);
        if (data.length > 0) {
          return new LineChart().setTitle(config.title).setData(data).build();
        }
      }
      // Fallback to mock
      return new LineChart().setTitle(config.title).setData(config.mockData?.[dimension] ?? []).build();
    }

    // Use aggregated data if available (for pie, bar)
    if (result) {
      const data = convertResultToData(result);
      return config.builder(data, dimension);
    }

    // Fallback to mock data
    return config.builder(config.mockData?.[dimension] ?? [], dimension);
  });

  function convertResultToData(result: AggregateResponse): [string, number][] {
    if (result.pie_data) {
      return result.pie_data.map((d: { name: string; value: number }) => [d.name, d.value]);
    }
    if (result.series.length > 0 && result.series[0].data) {
      const labels = result.x_axis ?? [];
      const data = result.series[0].data;
      return labels.map((label: string, i: number) => [label, data[i] ?? 0]);
    }
    return [];
  }

  let inputValue = $state('');

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && inputValue.trim()) {
      onQuery(inputValue.trim());
    }
  }

  $effect(() => {
    inputValue = queryValue;
  });
</script>

<div class="chart-card">
  <div class="card-header">
    <span class="card-title">{config.title}</span>
    {#if config.options && config.type === 'line'}
      <SegmentedControl
        options={config.options}
        value={dimension}
        onChange={onDimensionChange}
      />
    {:else if config.options && config.type !== 'trend'}
      <select
        value={dimension}
        onchange={(e) => onDimensionChange(e.currentTarget.value)}
        onmousedown={(e) => e.stopPropagation()}
      >
        {#each config.options as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    {/if}
    {#if config.type === 'trend' && config.secondaryOptions}
      <select
        value={secondaryDimension}
        onchange={(e) => onSecondaryChange?.(e.currentTarget.value)}
        onmousedown={(e) => e.stopPropagation()}
        class="secondary-select"
      >
        {#each config.secondaryOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    {/if}
  </div>

  {#if config.type === 'trend' && config.seriesOptions}
    <div class="series-toggles">
      {#each config.seriesOptions as opt}
        <label class="series-toggle">
          <input
            type="checkbox"
            checked={selectedSeries.includes(opt.value)}
            onchange={(e) => onSeriesChange?.(opt.value, e.currentTarget.checked)}
          />
          <span>{opt.label}</span>
        </label>
      {/each}
    </div>
  {/if}

  <div class="query-row">
    <input
      class="chart-query-input"
      type="text"
      placeholder="Ask AI..."
      bind:value={inputValue}
      onkeydown={handleKeydown}
      disabled={loading}
    />
    {#if loading}
      <span class="loading-indicator">...</span>
    {/if}
  </div>

  <div class="chart-area">
    <div class="chart-container">
      <ChartRenderer option={chartOption} height="100%" />
    </div>
  </div>
</div>

<style>
  .chart-card {
    width: 100%;
    height: 100%;
    min-height: 0;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: clamp(4px, 0.8vw, 8px);
    padding: clamp(0.5rem, 1vw, 0.75rem);
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: clamp(0.5rem, 1vw, 0.75rem);
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .card-title {
    font-size: clamp(12px, 1.5vw, 16px);
    font-weight: 500;
    color: #e6edf3;
  }

  select {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #8b949e;
    font-size: clamp(10px, 1.2vw, 12px);
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  select:hover {
    border-color: #484f58;
  }

  .secondary-select {
    margin-left: auto;
  }

  .series-toggles {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .series-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: clamp(9px, 1vw, 11px);
    color: #8b949e;
    cursor: pointer;
  }

  .series-toggle input {
    accent-color: #818cf8;
    cursor: pointer;
  }

  .series-toggle span {
    user-select: none;
  }

  .query-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .chart-query-input {
    flex: 1;
    min-width: 0;
    background: #1e293b;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e6edf3;
    font-size: clamp(10px, 1.2vw, 12px);
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .chart-query-input:focus {
    border-color: #484f58;
  }

  .chart-query-input::placeholder {
    color: #6b7280;
  }

  .chart-query-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-indicator {
    font-size: clamp(10px, 1.2vw, 12px);
    color: #818cf8;
    flex-shrink: 0;
  }

  .chart-area {
    flex: 1;
    min-height: 0;
    width: 100%;
    position: relative;
  }

  .chart-container {
    width: 100%;
    height: 100%;
    min-height: 0;
    position: relative;
  }

  /* Ensure chart renderer fills container */
  .chart-container :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }
</style>