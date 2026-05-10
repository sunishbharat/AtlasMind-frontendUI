import type { AggregateResponse } from '../charts/chartStore.svelte.js';
import type { ApiIssue } from '../charts/chartStore.svelte.js';

export interface ChartData {
  query: string;
  result: AggregateResponse | null;
  loading: boolean;
  issues: ApiIssue[];
}

export interface ChartConfig {
  id: string;
  title: string;
  type: 'pie' | 'bar' | 'line' | 'area';
  defaultDimension?: string;
  options?: { value: string; label: string }[];
  builder: (data: [string, number][], dim: string, maxItems?: number, gradient?: boolean) => object;
  mockData?: Record<string, [string, number][]>;
}