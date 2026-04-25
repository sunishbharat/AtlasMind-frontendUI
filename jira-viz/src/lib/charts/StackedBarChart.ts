// charts/StackedBarChart.ts
// Self-contained stacked bar chart builder.
//
// Usage (raw series):
//   const opt = new StackedBarChart('Status by Assignee')
//     .categories(['Alice', 'Bob', 'Carol'])
//     .addSeries('To Do',       [3, 1, 2])
//     .addSeries('In Progress', [1, 4, 0])
//     .addSeries('Done',        [5, 2, 3])
//     .build();
//
// Usage (derive from issues):
//   const opt = StackedBarChart.fromIssues(issues, 'assignee', 'status', 'count', 'Status by Assignee');

import type { EChartsOption } from 'echarts';
import type { ApiIssue } from './chartStore.svelte.js';
import { BASE_OPTION, paletteColor, paletteGradient, semanticBarGradient } from './theme.js';
import { seriesColor, stableColorIndex } from '../colorMapping.js';

interface SeriesEntry { name: string; data: number[] }

// - Helpers -------------------------------------------------------------------

function extractFieldStr(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'string') {
    if (val.startsWith('[') || val.startsWith('{')) {
      const m = val.match(/\bname=([^,\]]+)/);
      if (m) return m[1].trim();
    }
    return val || '—';
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('name' in obj)        return String(obj.name);
    if ('displayName' in obj) return String(obj.displayName);
    if ('value' in obj)       return String(obj.value);
    if ('id' in obj)          return String(obj.id);
  }
  return String(val);
}

function countByField(issues: ApiIssue[], field: string): [string, number][] {
  const map: Record<string, number> = {};
  for (const issue of issues) {
    const val = extractFieldStr(issue[field]);
    map[val] = (map[val] ?? 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function sumByField(issues: ApiIssue[], valueField: string, groupField: string): [string, number][] {
  const map: Record<string, number> = {};
  for (const issue of issues) {
    const key = extractFieldStr(issue[groupField]);
    const val = Number(issue[valueField] ?? 0);
    map[key] = (map[key] ?? 0) + val;
  }
  return Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

function isCountField(yField: string | null | undefined): boolean {
  if (!yField) return true;
  const lower = yField.toLowerCase();
  return lower === 'count' || lower.startsWith('count ') || lower.startsWith('count of');
}

// - Class ---------------------------------------------------------------------

export class StackedBarChart {
  private _title:      string;
  private _categories: string[]     = [];
  private _series:     SeriesEntry[] = [];
  private _maxCats:    number        = 20;
  private _maxSeries:  number        = 8;
  private _animation:  boolean       = true;
  private _colorField: string | null = null;

  constructor(title = '') {
    this._title = title;
  }

  // - Builder methods ---------------------------------------------------------

  title(t: string): this {
    this._title = t;
    return this;
  }

  categories(cats: string[]): this {
    this._categories = cats;
    return this;
  }

  addSeries(name: string, data: number[]): this {
    this._series.push({ name, data });
    return this;
  }

  maxCategories(n: number): this {
    this._maxCats = n;
    return this;
  }

  maxSeries(n: number): this {
    this._maxSeries = n;
    return this;
  }

  animation(enabled: boolean): this {
    this._animation = enabled;
    return this;
  }

  seriesField(field: string | null): this {
    this._colorField = field;
    return this;
  }

  // - Output ------------------------------------------------------------------

  build(): EChartsOption | null {
    const cats    = this._categories.slice(0, this._maxCats);
    const series  = this._series.slice(0, this._maxSeries);

    if (!cats.length || !series.length) return null;

    const colData = series.map(s => s.data.slice(0, cats.length));

    return {
      ...BASE_OPTION,
      animation: this._animation,
      tooltip: {
        ...(BASE_OPTION.tooltip as object),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
      },
      title: {
        text: this._title,
        textStyle: { color: '#cbd5e1', fontSize: 12, fontWeight: 600 },
        top: 4,
        left: 6,
      },
      legend: {
        show: series.length <= 8,
        top: 4,
        right: 8,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        itemWidth: 10,
        itemHeight: 10,
      },
      xAxis: {
        type: 'category',
        data: cats,
        axisLine: { lineStyle: { color: '#1e293b' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          rotate: cats.length > 6 ? 30 : 0,
          interval: 0,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
        minInterval: 1,
      },
      series: series.map((s, i) => ({
        name: s.name,
        type: 'bar' as const,
        stack: 'total',
        data: colData[i].map((v) => ({
          value: v,
          itemStyle: { color: (() => { const sem = seriesColor(this._colorField, s.name); return sem ? semanticBarGradient(sem) : paletteGradient(stableColorIndex(s.name), true); })() },
        })),
        barMaxWidth: 44,
        label: {
          show: true, position: 'inside' as const,
          color: 'rgba(255,255,255,0.95)', fontSize: 9,
          fontFamily: 'Inter, system-ui, sans-serif',
          formatter: (p: { value: number }) => (p.value > 0 ? (Number.isInteger(p.value) ? String(p.value) : p.value.toFixed(2).replace(/\.?0+$/, '')) : ''),
        },
        emphasis: { focus: 'series' as const },
      })),
      grid: { ...(BASE_OPTION.grid as object), top: 52 },
    };
  }

  // - Static factory: derive from issues array --------------------------------

  /**
   * Build a stacked bar chart directly from an issues array.
   *
   * @param issues     - Raw issue objects from the API
   * @param xField     - Field whose distinct values become X-axis categories (e.g. "assignee")
   * @param stackField - Field whose distinct values become stack segments (e.g. "status")
   * @param yField     - "count" / "count of *" to count issues, or a numeric field to sum
   * @param title      - Chart title
   * @param animation  - Pass false to skip entry animation
   */
  static fromIssues(
    issues: ApiIssue[],
    xField: string,
    stackField: string,
    yField: string,
    title: string,
    animation = true,
  ): EChartsOption | null {
    if (!issues.length) return null;

    const MAX_CATS   = 20;
    const MAX_SERIES = 8;

    const categories = countByField(issues, xField).slice(0, MAX_CATS).map(([k]) => k);
    if (!categories.length) return null;

    // Group issues by stackField value
    const groupMap = new Map<string, ApiIssue[]>();
    for (const issue of issues) {
      const key = extractFieldStr(issue[stackField]);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(issue);
    }

    const sortedGroups = [...groupMap.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_SERIES);

    if (!sortedGroups.length) return null;

    // Detect whether y_field is actually numeric - if sumByField yields all zeros, fall back to count.
    const useCount = isCountField(yField) ||
      !issues.some(i => Number(i[yField]) > 0);

    console.warn('[StackedBarChart.fromIssues]',
      '| x:', xField, '| stack:', stackField, '| y:', yField, '| useCount:', useCount,
      '| categories:', categories,
      '| groups:', sortedGroups.map(([name, g]) => `${name}(${g.length})`));

    const chart = new StackedBarChart(title || 'Stacked Bar')
      .categories(categories)
      .animation(animation)
      .seriesField(stackField);

    for (const [groupName, groupIssues] of sortedGroups) {
      const catMap: Map<string, number> = useCount
        ? new Map(countByField(groupIssues, xField))
        : new Map(sumByField(groupIssues, yField, xField));

      chart.addSeries(groupName, categories.map(cat => catMap.get(cat) ?? 0));
    }

    return chart.build();
  }
}
