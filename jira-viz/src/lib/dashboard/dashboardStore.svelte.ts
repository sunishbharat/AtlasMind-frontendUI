import type { AggregateResponse } from '../charts/chartStore.svelte.js';
import type { ApiIssue } from '../charts/chartStore.svelte.js';
import type { ChartData } from './dashboardTypes.js';

class DashboardStore {
  charts = $state<Record<string, ChartData>>({});

  setQuery(chartId: string, query: string): void {
    const existing = this.charts[chartId];
    this.charts[chartId] = {
      query,
      result: existing?.result ?? null,
      loading: existing?.loading ?? false,
      issues: existing?.issues ?? [],
    };
  }

  setResult(chartId: string, result: AggregateResponse, issues: ApiIssue[]): void {
    const existing = this.charts[chartId];
    this.charts[chartId] = {
      query: existing?.query ?? '',
      result,
      loading: false,
      issues,
    };
  }

  setLoading(chartId: string, loading: boolean): void {
    const existing = this.charts[chartId];
    this.charts[chartId] = {
      query: existing?.query ?? '',
      result: existing?.result ?? null,
      loading,
      issues: existing?.issues ?? [],
    };
  }

  clear(chartId: string): void {
    delete this.charts[chartId];
  }

  getChartData(chartId: string): ChartData | undefined {
    return this.charts[chartId];
  }
}

export const dashboardStore = new DashboardStore();