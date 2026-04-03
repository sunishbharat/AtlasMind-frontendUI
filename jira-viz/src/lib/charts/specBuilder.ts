// charts/specBuilder.ts
// Converts a server issues array into ECharts option objects.
//
// Public API:
//   buildAllSpecs(issues, maxItems) -> { tabKey: SpecEntry }
//   autoSpec(issues, type, maxItems) -> EChartsOption | null

import type { EChartsOption } from 'echarts';
import type { ApiIssue, ChartSpec } from './chartStore.svelte.js';
import { BASE_OPTION, paletteGradient, paletteColor } from './theme.js';

export interface SpecEntry {
  label: string;
  icon: string;
  option: EChartsOption;
}

// -- Date helpers -------------------------------------------------------------

function parseDate(str: unknown): Date | null {
  if (!str) return null;
  const d = new Date(String(str));
  return isNaN(d.getTime()) ? null : d;
}

function autoBucket(minDate: Date, maxDate: Date): 'day' | 'week' | 'month' {
  const days = (maxDate.getTime() - minDate.getTime()) / 864e5;
  if (days <= 31)  return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function floorDate(date: Date, bucket: 'day' | 'week' | 'month'): Date {
  const d = new Date(date);
  if (bucket === 'day') {
    d.setHours(0, 0, 0, 0);
  } else if (bucket === 'week') {
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

function fmtLabel(date: Date, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'day')  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (bucket === 'week') return 'W ' + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

interface BucketEntry { label: string; count: number; ts: number }

function bucketByDate(issues: ApiIssue[], field: string, bucket: 'day' | 'week' | 'month'): BucketEntry[] {
  const map = new Map<number, number>();
  for (const issue of issues) {
    const d = parseDate(issue[field]);
    if (!d) continue;
    const ts = floorDate(d, bucket).getTime();
    map.set(ts, (map.get(ts) ?? 0) + 1);
  }
  const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return [];

  const result: BucketEntry[] = [];
  let cur = sorted[0][0];
  const end = sorted[sorted.length - 1][0];
  while (cur <= end) {
    result.push({ label: fmtLabel(new Date(cur), bucket), count: map.get(cur) ?? 0, ts: cur });
    if (bucket === 'month') {
      const d = new Date(cur); d.setMonth(d.getMonth() + 1); cur = d.getTime();
    } else {
      cur += (bucket === 'week' ? 7 : 1) * 864e5;
    }
  }
  return result;
}

function linReg(points: [number, number][]): { slope: number; intercept: number } {
  const n   = points.length;
  const sx  = points.reduce((s, [x])    => s + x,   0);
  const sy  = points.reduce((s, [, y])  => s + y,   0);
  const sxy = points.reduce((s, [x, y]) => s + x*y, 0);
  const sx2 = points.reduce((s, [x])    => s + x*x, 0);
  const slope     = (n * sxy - sx * sy) / (n * sx2 - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

// -- Aggregation helpers ------------------------------------------------------

function countByField(issues: ApiIssue[], field: string): [string, number][] {
  const map: Record<string, number> = {};
  for (const issue of issues) {
    const val = String(issue[field] ?? '—');
    map[val] = (map[val] ?? 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function sumByField(issues: ApiIssue[], valueField: string, groupField: string): [string, number][] {
  const map: Record<string, number> = {};
  for (const issue of issues) {
    const key = String(issue[groupField] ?? '—');
    const val = Number(issue[valueField] ?? 0);
    map[key] = (map[key] ?? 0) + val;
  }
  return Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

// -- Chart builders -----------------------------------------------------------

export function buildBar(entries: [string, number][], title: string, maxItems = 20, animation = true): EChartsOption {
  const slice      = entries.slice(0, maxItems);
  const categories = slice.map(([k]) => k);
  const values     = slice.map(([, v], i) => ({ value: v, itemStyle: { color: paletteGradient(i, true) } }));

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip as object, trigger: 'axis' },
    title: { text: title, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10, rotate: categories.length > 6 ? 30 : 0, interval: 0 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      minInterval: 1,
    },
    series: [{ type: 'bar', data: values, barMaxWidth: 44, emphasis: { itemStyle: { opacity: 0.8 } } }],
  };
}

export function buildPie(entries: [string, number][], title: string, maxItems = 10, animation = true): EChartsOption {
  const slice = entries.slice(0, maxItems);
  const data  = slice.map(([name, value], i) => ({ name, value, itemStyle: { color: paletteColor(i) } }));

  return {
    ...BASE_OPTION,
    animation,
    title: { text: title, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    legend: {
      show: slice.length <= 6,
      bottom: 2,
      textStyle: { color: '#64748b', fontSize: 10 },
      icon: 'circle', itemWidth: 7, itemHeight: 7,
    },
    series: [{
      type: 'pie',
      radius: ['36%', '66%'],
      center: ['50%', '52%'],
      data,
      label: { show: slice.length <= 8, formatter: '{b}: {d}%', fontSize: 10, color: '#64748b' },
      labelLine: { lineStyle: { color: '#334155' } },
      emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,.4)' } },
    }],
  };
}

export function buildTrend(issues: ApiIssue[], animation = true): EChartsOption | null {
  const allDates = issues.map(i => parseDate(i.created)).filter((d): d is Date => d !== null);
  if (!allDates.length) return null;

  const bucket  = autoBucket(new Date(Math.min(...allDates.map(d => d.getTime()))), new Date(Math.max(...allDates.map(d => d.getTime()))));
  const created = bucketByDate(issues, 'created', bucket);
  if (created.length < 2) return null;

  const labels       = created.map(b => b.label);
  const hasResolved  = issues.some(i => parseDate(i.resolutiondate));
  const resolvedMap  = new Map<string, number>();
  if (hasResolved) {
    bucketByDate(issues, 'resolutiondate', bucket).forEach(b => resolvedMap.set(b.label, b.count));
  }

  let cumCreated = 0, cumResolved = 0;
  const openData     = labels.map(l => { cumCreated += created.find(b => b.label === l)?.count ?? 0; cumResolved += resolvedMap.get(l) ?? 0; return cumCreated - cumResolved; });
  const createdData  = created.map(b => b.count);
  const resolvedData = hasResolved ? labels.map(l => resolvedMap.get(l) ?? 0) : null;

  const series = [
    {
      name: 'Open (cumulative)', type: 'line', data: openData, smooth: true, symbol: 'none',
      lineStyle: { color: '#818cf8', width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(129,140,248,0.25)' }, { offset: 1, color: 'rgba(129,140,248,0.02)' }] } },
    },
    { name: 'Created', type: 'bar', data: createdData, barMaxWidth: 20, itemStyle: { color: 'rgba(129,140,248,0.4)' } },
    ...(resolvedData ? [{ name: 'Resolved', type: 'bar', data: resolvedData, barMaxWidth: 20, itemStyle: { color: 'rgba(52,211,153,0.5)' } }] : []),
  ];

  const axisLabel = { color: '#475569', fontSize: 10, rotate: labels.length > 10 ? 30 : 0, interval: Math.max(0, Math.floor(labels.length / 8) - 1) };

  return {
    ...BASE_OPTION, animation,
    tooltip: { ...BASE_OPTION.tooltip as object, trigger: 'axis' },
    legend: { show: true, top: 24, right: 6, textStyle: { color: '#64748b', fontSize: 10 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    title: { text: 'Issue Trend', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false }, axisLabel, splitLine: { show: false } },
    yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, minInterval: 1 },
    series,
    grid: { ...BASE_OPTION.grid as object, top: 52 },
  };
}

const POINT_FIELDS = ['story_points', 'points', 'story points'] as const;

function detectPointField(issues: ApiIssue[]): string | undefined {
  return POINT_FIELDS.find(f => issues.some(i => Number(i[f]) > 0));
}

export function buildBurndown(issues: ApiIssue[], animation = true): EChartsOption | null {
  const ptField    = detectPointField(issues);
  if (!ptField) return null;

  const withPts  = issues.filter(i => Number(i[ptField]) > 0);
  const total    = withPts.reduce((s, i) => s + Number(i[ptField]), 0);
  const createdDs = issues.map(i => parseDate(i.created)).filter((d): d is Date => d !== null);
  if (!createdDs.length) return null;

  const sprintStart = new Date(Math.min(...createdDs.map(d => d.getTime())));
  sprintStart.setHours(0, 0, 0, 0);

  const dueDates  = issues.map(i => parseDate(i.duedate)).filter((d): d is Date => d !== null);
  const sprintEnd = dueDates.length
    ? new Date(Math.max(...dueDates.map(d => d.getTime())))
    : new Date(sprintStart.getTime() + 14 * 864e5);
  sprintEnd.setHours(23, 59, 59, 999);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let d = new Date(sprintStart); d <= sprintEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const labels = days.map(d => fmtLabel(d, 'day'));
  const ideal  = days.map((_, i) => Math.round(total * (1 - i / (days.length - 1))));
  const actual: (number | null)[] = days.map(day => {
    if (day > today) return null;
    const burned = withPts.filter(i => { const rd = parseDate(i.resolutiondate); return rd && rd <= day; }).reduce((s, i) => s + Number(i[ptField]), 0);
    return total - burned;
  });

  const knownPts   = actual.map((v, i): [number, number] | null => v !== null ? [i, v] : null).filter((p): p is [number, number] => p !== null);
  const lastActual = knownPts.length ? knownPts[knownPts.length - 1][0] : -1;
  const projected: (number | null)[] = Array(days.length).fill(null);

  if (knownPts.length >= 2) {
    const { slope, intercept } = linReg(knownPts);
    for (let i = lastActual; i < days.length; i++) {
      projected[i] = Math.max(0, Math.round(slope * i + intercept));
    }
  }

  const series = [
    { name: 'Ideal',  type: 'line', data: ideal,  symbol: 'none', lineStyle: { color: '#334155', width: 1.5, type: 'dashed' }, itemStyle: { color: '#334155' } },
    { name: 'Actual', type: 'line', data: actual, smooth: false,   symbol: 'circle', symbolSize: 4, lineStyle: { color: '#818cf8', width: 2 }, itemStyle: { color: '#818cf8' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(129,140,248,0.2)' }, { offset: 1, color: 'rgba(129,140,248,0.02)' }] } }, connectNulls: false },
    ...(knownPts.length >= 2 ? [{ name: 'Projected', type: 'line', data: projected, smooth: true, symbol: 'none', lineStyle: { color: '#f472b6', width: 1.5, type: 'dotted' }, itemStyle: { color: '#f472b6' }, connectNulls: false }] : []),
  ];

  const interval = Math.max(0, Math.floor(days.length / 7) - 1);

  return {
    ...BASE_OPTION, animation,
    tooltip: { ...BASE_OPTION.tooltip as object, trigger: 'axis', formatter: (params: unknown) => { const ps = params as { axisValue?: string; marker?: string; seriesName?: string; value?: number | null }[]; const d = ps[0]?.axisValue ?? ''; const lines = ps.filter(p => p.value !== null).map(p => `${p.marker}${p.seriesName}: <b>${p.value} pts</b>`); return `${d}<br/>${lines.join('<br/>')}`; } },
    legend: { show: true, top: 24, right: 6, textStyle: { color: '#64748b', fontSize: 10 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    title: { text: `Burndown - ${total} pts`, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 10, rotate: days.length > 10 ? 30 : 0, interval }, splitLine: { show: false } },
    yAxis: { min: 0, type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } } },
    series,
    grid: { ...BASE_OPTION.grid as object, top: 52 },
  };
}

// -- Auto-derivation ----------------------------------------------------------

const GROUP_FIELDS = [
  { key: 'status',    label: 'Status'   },
  { key: 'priority',  label: 'Priority' },
  { key: 'assignee',  label: 'Assignee' },
  { key: 'issuetype', label: 'Type'     },
] as const;

/** Build all meaningful chart specs from an issues array. */
export function buildAllSpecs(issues: ApiIssue[], maxItems = 20, animation = true): Record<string, SpecEntry> {
  if (!issues?.length) return {};

  const specs: Record<string, SpecEntry> = {};

  for (const { key, label } of GROUP_FIELDS) {
    if (!issues.some(i => i[key])) continue;
    const entries = countByField(issues, key);
    if (entries.length < 2) continue;

    specs[`bar_${key}`] = { label: `By ${label}`, icon: 'bar', option: buildBar(entries, `Issues by ${label}`, maxItems, animation) };
    if (entries.length <= 9) {
      specs[`pie_${key}`] = { label: `${label} (pie)`, icon: 'pie', option: buildPie(entries, `Issues by ${label}`, maxItems, animation) };
    }
  }

  const ptField = detectPointField(issues);
  if (ptField && issues.some(i => i.assignee)) {
    const entries = sumByField(issues, ptField, 'assignee');
    if (entries.length >= 2) {
      specs['bar_points'] = { label: 'Story Points', icon: 'bar', option: buildBar(entries, 'Story Points by Assignee', maxItems, animation) };
    }
  }

  const trendOpt = buildTrend(issues, animation);
  if (trendOpt) specs['trend'] = { label: 'Trend', icon: 'line', option: trendOpt };

  const burndownOpt = buildBurndown(issues, animation);
  if (burndownOpt) specs['burndown'] = { label: 'Burndown', icon: 'line', option: burndownOpt };

  return specs;
}

export function buildScatter(
  issues: ApiIssue[],
  xField: string,
  yField: string,
  title: string,
  animation = true,
): EChartsOption | null {
  // Try pure numeric scatter: both fields produce numbers
  const numericPts = issues
    .map(i => {
      const x = Number(i[xField]);
      const y = Number(i[yField]);
      return isNaN(x) || isNaN(y) ? null : { value: [x, y] as [number, number], name: String(i.key ?? '') };
    })
    .filter((p): p is { value: [number, number]; name: string } => p !== null);

  if (numericPts.length >= 2) {
    return {
      ...BASE_OPTION,
      animation,
      title: { text: title, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const pt = p as { name: string; value: [number, number] };
          return `${pt.name}<br/>${xField}: ${pt.value[0]}<br/>${yField}: ${pt.value[1]}`;
        },
      },
      xAxis: {
        type: 'value', name: xField, nameTextStyle: { color: '#475569', fontSize: 10 },
        axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      },
      yAxis: {
        type: 'value', name: yField, nameTextStyle: { color: '#475569', fontSize: 10 },
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#475569', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      },
      series: [{ type: 'scatter', data: numericPts, symbolSize: 8, itemStyle: { color: paletteColor(0), opacity: 0.8 } }],
    };
  }

  // Categorical x_field: aggregate then scatter
  const entries: [string, number][] =
    yField === 'count' || !yField
      ? countByField(issues, xField)
      : sumByField(issues, yField, xField);
  if (!entries.length) return null;

  const categories = entries.map(([k]) => k);
  return {
    ...BASE_OPTION,
    animation,
    title: { text: title, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    tooltip: { trigger: 'item' },
    xAxis: {
      type: 'category', data: categories,
      axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10, rotate: categories.length > 6 ? 30 : 0, interval: 0 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      minInterval: 1,
    },
    series: [{
      type: 'scatter',
      data: entries.map(([, v], i) => ({ value: v, itemStyle: { color: paletteColor(i), opacity: 0.85 } })),
      symbolSize: 10,
    }],
  };
}

const DATE_FIELDS = new Set(['created', 'updated', 'resolutiondate', 'duedate']);

/**
 * Build a single spec from an explicit server-provided chartSpec.
 * Expected shape: { type, title, x_field, y_field }
 */
export function fromExplicitSpec(chartSpec: ChartSpec, issues: ApiIssue[], animation = true): EChartsOption | null {
  if (!chartSpec || !issues.length) return null;

  // Scatter: always handled first regardless of field types
  if (chartSpec.type === 'scatter') {
    return buildScatter(issues, chartSpec.x_field, chartSpec.y_field, chartSpec.title ?? 'Chart', animation);
  }

  const xLower = chartSpec.x_field?.toLowerCase() ?? '';

  if (DATE_FIELDS.has(xLower)) {
    // Line chart on a date field → use the full multi-series trend chart
    if (chartSpec.type === 'line') return buildTrend(issues, animation);

    // Bar/pie on a date field → bucket by day/week/month so bars are grouped correctly
    const allDates = issues
      .map(i => parseDate(i[chartSpec.x_field]))
      .filter((d): d is Date => d !== null);
    if (!allDates.length) return null;
    const bucket   = autoBucket(
      new Date(Math.min(...allDates.map(d => d.getTime()))),
      new Date(Math.max(...allDates.map(d => d.getTime()))),
    );
    const bucketed = bucketByDate(issues, chartSpec.x_field, bucket);
    if (!bucketed.length) return null;
    const entries: [string, number][] = bucketed.map(b => [b.label, b.count]);
    return chartSpec.type === 'pie'
      ? buildPie(entries, chartSpec.title ?? 'Chart', 20, animation)
      : buildBar(entries, chartSpec.title ?? 'Chart', 20, animation);
  }

  // Non-date x_field: aggregate by field value
  const entries: [string, number][] =
    chartSpec.y_field === 'count' || !chartSpec.y_field
      ? countByField(issues, chartSpec.x_field)
      : sumByField(issues, chartSpec.y_field, chartSpec.x_field);

  if (!entries.length) return null;

  return chartSpec.type === 'pie'
    ? buildPie(entries, chartSpec.title ?? 'Chart', 20, animation)
    : buildBar(entries, chartSpec.title ?? 'Chart', 20, animation);
}

/** Return the first chart option for a given type preference. */
export function autoSpec(issues: ApiIssue[], type = 'bar', maxItems = 20, animation = true): EChartsOption | null {
  const specs    = buildAllSpecs(issues, maxItems, animation);
  const first    = Object.values(specs)[0];
  if (!first) return null;
  const preferred = Object.values(specs).find(s => s.icon === type);
  return (preferred ?? first).option;
}
