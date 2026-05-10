import type { AggregateResponse } from '../charts/chartStore.svelte.js';
import type { ApiIssue } from '../charts/chartStore.svelte.js';

export interface AggregateOptions {
  chartType: 'pie' | 'bar' | 'line' | 'stacked_bar' | 'scatter' | 'trend' | 'burndown';
  xField: string;
  yField?: string;
  colorField?: string;
  title?: string;
  maxCategories?: number;
  displayFields?: string[];
  activeFilters?: Record<string, string[]>;
  reactToFilters?: boolean;
}

export async function aggregateIssues(
  issues: ApiIssue[],
  options: AggregateOptions,
  pat?: string
): Promise<AggregateResponse> {
  const chartSpec = {
    type: options.chartType,
    x_field: options.xField,
    y_field: options.yField || 'count',
    color_field: options.colorField || null,
    title: options.title || `${options.chartType} Chart`,
    max_categories: options.maxCategories || 20,
  };

  const body: Record<string, unknown> = {
    issues,
    chart_spec: chartSpec,
  };

  if (options.displayFields) {
    body.display_fields = options.displayFields;
  }

  if (options.activeFilters) {
    body.active_filters = options.activeFilters;
    body.react_to_filters = options.reactToFilters || false;
  }

  const res = await fetch('/api/aggregate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pat ? { 'Authorization': `Bearer ${pat}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.error) {
    console.warn('[aggregateUtils] aggregate error:', data.error);
  }

  return data as AggregateResponse;
}