<script lang="ts">
  import type { ChartConfig } from './dashboardTypes.js';
  import { dashboardStore } from './dashboardStore.svelte.js';
  import ChartRenderer from '../charts/ChartRenderer.svelte';

  interface Props {
    config: ChartConfig;
    dimension: string;
    onDimensionChange: (val: string) => void;
    onQuery: (query: string) => void;
  }

  let { config, dimension, onDimensionChange, onQuery }: Props = $props();

  const chartData = $derived(dashboardStore.charts[config.id]);
  const hasData = $derived(!!chartData?.result);
  const loading = $derived(chartData?.loading ?? false);
  const queryValue = $derived(chartData?.query ?? '');

  const chartOption = $derived(
    hasData && chartData?.result
      ? config.builder(convertResultToData(chartData.result), dimension)
      : config.builder(config.mockData?.[dimension] ?? [], dimension)
  );

  function convertResultToData(result: NonNullable<typeof chartData.result>): [string, number][] {
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
    {#if config.options}
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
  </div>

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
    <ChartRenderer option={chartOption} height="280px" />
  </div>
</div>

<style>
  .chart-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .card-title {
    font-size: 14px;
    font-weight: 500;
    color: #e6edf3;
  }

  select {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #8b949e;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  select:hover {
    border-color: #484f58;
  }

  .query-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .chart-query-input {
    flex: 1;
    background: #1e293b;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #e6edf3;
    font-size: 12px;
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
    font-size: 12px;
    color: #818cf8;
  }

  .chart-area {
    flex: 1;
    min-height: 0;
  }
</style>