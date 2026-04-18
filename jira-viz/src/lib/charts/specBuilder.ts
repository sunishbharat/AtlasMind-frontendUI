// charts/specBuilder.ts
// Converts a server issues array into ECharts option objects.
//
// Public API:
//   buildAllSpecs(issues, maxItems) -> { tabKey: SpecEntry }
//   autoSpec(issues, type, maxItems) -> EChartsOption | null

import type { EChartsOption } from 'echarts';
import type { ApiIssue, ChartSpec } from './chartStore.svelte.js';
import { BASE_OPTION, paletteGradient, paletteColor } from './theme.js';
import { StackedBarChart } from './StackedBarChart.js';

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

/** Sum a numeric valueField per date bucket — parallel to bucketByDate but for sums. */
function bucketSumByDate(
  issues: ApiIssue[],
  dateField: string,
  valueField: string,
  bucket: 'day' | 'week' | 'month',
): Map<number, number> {
  const map = new Map<number, number>();
  for (const issue of issues) {
    const d = parseDate(issue[dateField]);
    if (!d) continue;
    const ts  = floorDate(d, bucket).getTime();
    const val = Number(issue[valueField] ?? 0);
    map.set(ts, (map.get(ts) ?? 0) + val);
  }
  return map;
}

// -- Aggregation helpers ------------------------------------------------------

/**
 * Extract a human-readable string from a Jira field value.
 * Handles:
 *  - Greenhopper sprint strings: "com.atlassian...Sprint@...[...name=Usergrid 34,...]"
 *  - Plain objects with a name/displayName/value key
 *  - Arrays of the above (joined with ", ")
 *  - Primitives
 */
function extractFieldStr(val: unknown): string {
  if (val == null) return '—';

  if (Array.isArray(val)) {
    if (!val.length) return '—';
    return val.map(v => extractFieldStr(v)).join(', ');
  }

  if (typeof val === 'string') {
    // Greenhopper sprint toString: "...Sprint@...[...name=Sprint Name,...]"
    if (val.includes('com.atlassian.greenhopper') || val.includes('Sprint@')) {
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

/** True when y_field means "count issues" rather than sum a numeric field. */
function isCountField(yField: string | null | undefined): boolean {
  if (!yField) return true;
  const lower = yField.toLowerCase();
  return lower === 'count' || lower.startsWith('count ') || lower.startsWith('count of');
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

/** Thin wrapper — delegates to StackedBarChart class. */
export function buildStackedBar(
  categories: string[],
  series: { name: string; data: number[] }[],
  title: string,
  maxCategories = 20,
  animation = true,
): EChartsOption | null {
  const chart = new StackedBarChart(title).categories(categories).animation(animation).maxCategories(maxCategories);
  for (const s of series) chart.addSeries(s.name, s.data);
  return chart.build();
}

export function buildPie(entries: [string, number][], title: string, maxItems = 10, animation = true): EChartsOption {
  const slice = entries.slice(0, maxItems);
  const data  = slice.map(([name, value], i) => ({ name, value, itemStyle: { color: paletteColor(i) } }));

  return {
    ...BASE_OPTION,
    animation,
    title: {
      text: title,
      textStyle: { color: '#64748b', fontSize: 11, fontWeight: 400, fontFamily: 'Inter, system-ui, sans-serif' },
      top: 4, left: 6,
    },
    legend: {
      show: slice.length <= 8,
      bottom: 4,
      textStyle: { color: '#475569', fontSize: 10, fontWeight: 400, fontFamily: 'Inter, system-ui, sans-serif' },
      icon: 'circle', itemWidth: 6, itemHeight: 6, itemGap: 10,
    },
    series: [{
      type: 'pie',
      radius: ['38%', '64%'],
      center: ['50%', '50%'],
      data,
      label: {
        show: slice.length <= 6,
        formatter: '{name|{b}}\n{pct|{d}%}',
        rich: {
          name: {
            fontSize: 11, color: '#94a3b8', fontWeight: 500,
            fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 17,
          },
          pct: {
            fontSize: 10, color: '#475569', fontWeight: 400,
            fontFamily: 'Inter, system-ui, sans-serif', lineHeight: 14,
          },
        },
      },
      labelLine: { length: 8, length2: 10, lineStyle: { color: '#1e3a5f', width: 1 } },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.35)' } },
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

/**
 * Multiline trend chart — one line per unique value of groupField.
 *
 * @param xField     - Date field to bucket along the x-axis (e.g. "resolutiondate", "created")
 * @param groupField - Categorical field to split into series (e.g. "assignee", "priority")
 * @param yField     - "count" to count issues per bucket, or a numeric field name to sum
 * @param title      - Chart title
 */
export function buildGroupedTrend(
  issues: ApiIssue[],
  xField: string,
  groupField: string,
  yField: string,
  title: string,
  animation = true,
): EChartsOption | null {
  if (!issues.length) return null;

  // Build the shared x-axis from all issues regardless of group
  const allDates = issues.map(i => parseDate(i[xField])).filter((d): d is Date => d !== null);
  if (allDates.length < 2) return null;

  const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  const bucket  = autoBucket(minDate, maxDate);

  // Full gapless bucket spine — every period between min and max
  const spine = bucketByDate(issues, xField, bucket);
  if (spine.length < 2) return null;

  const labels = spine.map(b => b.label);

  // Group issues by groupField, sorted by total desc so busiest series comes first
  const groupMap = new Map<string, ApiIssue[]>();
  for (const issue of issues) {
    const key = extractFieldStr(issue[groupField]);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(issue);
  }

  const MAX_SERIES = 8;
  const sortedGroups = [...groupMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_SERIES);

  const series = sortedGroups.map(([groupName, groupIssues], idx) => {
    // Build ts → value map for this group
    const tsMap: Map<number, number> =
      isCountField(yField)
        ? new Map(bucketByDate(groupIssues, xField, bucket).map(b => [b.ts, b.count]))
        : bucketSumByDate(groupIssues, xField, yField, bucket);

    const data  = spine.map(b => tsMap.get(b.ts) ?? 0);
    const color = paletteColor(idx);

    return {
      name: groupName,
      type: 'line' as const,
      data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color, width: 1.8 },
      itemStyle: { color },
      emphasis: { focus: 'series' as const },
    };
  });

  if (!series.length) return null;

  const axisLabel = {
    color: '#475569', fontSize: 10,
    rotate: labels.length > 10 ? 30 : 0,
    interval: Math.max(0, Math.floor(labels.length / 8) - 1),
  };

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip as object, trigger: 'axis' },
    legend: {
      show: true, top: 24, right: 6,
      textStyle: { color: '#64748b', fontSize: 10 },
      icon: 'circle', itemWidth: 8, itemHeight: 8,
    },
    title: {
      text: title,
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
      top: 4, left: 6,
    },
    xAxis: {
      type: 'category', data: labels,
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
      axisLabel,
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      minInterval: 1,
    },
    series,
    grid: { ...BASE_OPTION.grid as object, top: 52 },
  };
}

/**
 * Grouped multi-series chart with a categorical x-axis.
 * Used when color_field is set but x_field is not a date (e.g. x=assignee, group=project).
 *
 * @param xField     - Categorical field for x-axis (e.g. "assignee", "status")
 * @param groupField - Field to split into series (e.g. "project", "priority")
 * @param yField     - "count" to count issues, or a numeric field name to sum
 * @param chartType  - "line" or "bar"
 * @param title      - Chart title
 */
export function buildGroupedCategorical(
  issues: ApiIssue[],
  xField: string,
  groupField: string,
  yField: string,
  chartType: 'line' | 'bar',
  title: string,
  animation = true,
): EChartsOption | null {
  if (!issues.length) return null;

  // x categories ordered by total count desc, capped to avoid overflow
  const MAX_CATS = 20;
  const categories = countByField(issues, xField).slice(0, MAX_CATS).map(([k]) => k);
  if (!categories.length) return null;

  // Groups ordered by size desc, capped for readability
  const MAX_SERIES = 8;
  const groupMap = new Map<string, ApiIssue[]>();
  for (const issue of issues) {
    const key = extractFieldStr(issue[groupField]);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(issue);
  }

  const sortedGroups = [...groupMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, MAX_SERIES);

  const series = sortedGroups.map(([groupName, groupIssues], idx) => {
    const catMap: Map<string, number> =
      isCountField(yField)
        ? new Map(countByField(groupIssues, xField))
        : new Map(sumByField(groupIssues, yField, xField));

    const data  = categories.map(cat => catMap.get(cat) ?? 0);
    const color = paletteColor(idx);

    return {
      name: groupName,
      type: chartType,
      data,
      ...(chartType === 'line' ? {
        smooth:      true,
        symbol:      'circle',
        symbolSize:  4,
        lineStyle:   { color, width: 1.8 },
      } : {
        barMaxWidth: 28,
      }),
      itemStyle: { color },
      emphasis:  { focus: 'series' as const },
    };
  });

  if (!series.length) return null;

  const axisLabel = {
    color: '#475569', fontSize: 10,
    rotate: categories.length > 6 ? 30 : 0,
    interval: 0,
  };

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip as object, trigger: 'axis' },
    legend: {
      show: true, top: 24, right: 6,
      textStyle: { color: '#64748b', fontSize: 10 },
      icon: 'circle', itemWidth: 8, itemHeight: 8,
    },
    title: {
      text: title,
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
      top: 4, left: 6,
    },
    xAxis: {
      type: 'category', data: categories,
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
      axisLabel,
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      minInterval: 1,
    },
    series,
    grid: { ...BASE_OPTION.grid as object, top: 52 },
  };
}

/** Thin wrapper — delegates to StackedBarChart.fromIssues. */
export function buildStackedBarFromIssues(
  issues: ApiIssue[],
  xField: string,
  stackField: string,
  yField: string,
  title: string,
  animation = true,
): EChartsOption | null {
  return StackedBarChart.fromIssues(issues, xField, stackField, yField, title, animation);
}

const POINT_FIELDS = ['story_points', 'points', 'story points', 'Story Points'] as const;

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

  // Stacked bar: status breakdown per assignee
  if (issues.some(i => i.assignee) && issues.some(i => i.status)) {
    const opt = StackedBarChart.fromIssues(issues, 'assignee', 'status', 'count', 'Status by Assignee', animation);
    if (opt) specs['stacked_assignee_status'] = { label: 'Status × Assignee', icon: 'bar', option: opt };
  }

  const trendOpt = buildTrend(issues, animation);
  if (trendOpt) specs['trend'] = { label: 'Trend', icon: 'line', option: trendOpt };

  const burndownOpt = buildBurndown(issues, animation);
  if (burndownOpt) specs['burndown'] = { label: 'Burndown', icon: 'line', option: burndownOpt };

  return specs;
}

/**
 * Convert a raw value to a plottable number.
 * Returns { value, isDate } — isDate=true means the number is a ms timestamp.
 */
function toNumeric(val: unknown): { value: number; isDate: boolean } | null {
  if (val == null) return null;
  const n = Number(val);
  if (!isNaN(n)) return { value: n, isDate: false };
  // Try parsing as a date string (ISO, Jira timestamp, etc.)
  const d = parseDate(val);
  if (d) return { value: d.getTime(), isDate: true };
  return null;
}

/**
 * Resolve a field expression against an issue to a plottable number.
 * Handles:
 *   - Plain field names:          "story_points", "created"
 *   - Subtraction expressions:    "resolutiondate - created"  → days between dates
 *   - Jira object fields:         "timetracking"  → extracts timeSpentSeconds / originalEstimateSeconds
 */
function resolveNumericField(issue: ApiIssue, fieldExpr: string): { value: number; isDate: boolean } | null {
  // ── Expression: "fieldA - fieldB" ───────────────────────────────────────────
  const diffMatch = fieldExpr.match(/^(.+?)\s+-\s+(.+)$/);
  if (diffMatch) {
    const fieldA = diffMatch[1].trim();
    const fieldB = diffMatch[2].trim();
    const a = toNumeric(issue[fieldA]);
    const b = toNumeric(issue[fieldB]);
    if (!a || !b) return null;
    if (a.isDate && b.isDate) {
      // Date difference → days (positive = A after B)
      return { value: (a.value - b.value) / 864e5, isDate: false };
    }
    return { value: a.value - b.value, isDate: false };
  }

  // ── Direct field lookup ──────────────────────────────────────────────────────
  const val = issue[fieldExpr];

  // Jira object fields (timetracking, etc.) — extract first usable numeric subfield
  if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    for (const key of ['timeSpentSeconds', 'originalEstimateSeconds', 'remainingEstimateSeconds', 'value', 'count']) {
      const n = Number(obj[key]);
      if (!isNaN(n) && n > 0) return { value: n / 3600, isDate: false }; // convert seconds → hours
    }
    return null;
  }

  return toNumeric(val);
}

/**
 * Scatter plot with optional color_field grouping and date-aware axes.
 *
 * @param colorField - Field to split into series (e.g. "issuetype", "priority")
 */
export function buildScatter(
  issues: ApiIssue[],
  xField: string,
  yField: string,
  title: string,
  colorField?: string | null,
  animation = true,
): EChartsOption | null {
  if (!issues.length) return null;

  // Group issues by colorField (single group when absent)
  const groups = new Map<string, ApiIssue[]>();
  if (colorField) {
    for (const issue of issues) {
      const key = extractFieldStr(issue[colorField]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(issue);
    }
  } else {
    groups.set('', issues);
  }

  let xIsDate = false;
  let yIsDate = false;
  const allSeries: object[] = [];
  let seriesIdx = 0;

  for (const [groupName, groupIssues] of groups) {
    const pts = groupIssues
      .map(i => {
        const xr = resolveNumericField(i, xField);
        const yr = resolveNumericField(i, yField);
        if (!xr || !yr) return null;
        if (xr.isDate) xIsDate = true;
        if (yr.isDate) yIsDate = true;
        return { value: [xr.value, yr.value] as [number, number], name: String(i.key ?? '') };
      })
      .filter((p): p is { value: [number, number]; name: string } => p !== null);

    if (!pts.length) continue;

    const color = paletteColor(seriesIdx++);
    allSeries.push({
      name: groupName || title,
      type: 'scatter',
      data: pts,
      symbolSize: 7,
      itemStyle: { color, opacity: 0.8 },
      emphasis: { focus: 'series' },
    });
  }

  if (allSeries.length >= 1) {
    const xAxisLabel = { color: '#475569', fontSize: 10 };
    const xAxis = xIsDate
      ? { type: 'time',  axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false }, axisLabel: xAxisLabel, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } } }
      : { type: 'value', name: xField, nameTextStyle: { color: '#475569', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false }, axisLabel: xAxisLabel, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } } };

    const yAxis = {
      type: 'value', name: yIsDate ? '' : yField,
      nameTextStyle: { color: '#475569', fontSize: 10 },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
    };

    const tooltip = {
      trigger: 'item',
      formatter: (p: unknown) => {
        const pt = p as { seriesName: string; name: string; value: [number, number] };
        const xVal = xIsDate ? new Date(pt.value[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : pt.value[0];
        const yVal = yIsDate ? new Date(pt.value[1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : pt.value[1];
        return `${pt.name}${pt.seriesName ? ` (${pt.seriesName})` : ''}<br/>${xField}: ${xVal}<br/>${yField}: ${yVal}`;
      },
    };

    return {
      ...BASE_OPTION,
      animation,
      title: { text: title || 'Scatter', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
      legend: {
        show: groups.size > 1, top: 24, right: 6,
        textStyle: { color: '#64748b', fontSize: 10 },
        icon: 'circle', itemWidth: 8, itemHeight: 8,
      },
      tooltip,
      xAxis,
      yAxis,
      series: allSeries,
      grid: { ...BASE_OPTION.grid as object, top: groups.size > 1 ? 52 : 28 },
    };
  }

  // Fallback: no numeric points resolved — aggregate categorically
  console.warn('[buildScatter] no numeric points for x_field:', xField, 'y_field:', yField,
    '— check issue[0]:', { x: issues[0]?.[xField], y: issues[0]?.[yField] });
  const entries: [string, number][] =
    isCountField(yField)
      ? countByField(issues, xField)
      : sumByField(issues, yField, xField);
  if (!entries.length) return null;

  const categories = entries.map(([k]) => k);
  return {
    ...BASE_OPTION,
    animation,
    title: { text: title || 'Scatter', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
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

// Type aliases the backend may emit for line charts
const LINE_TYPES = new Set(['line', 'multi-line', 'multiline', 'multi_line']);

// Fields that are never useful as a grouping dimension
const NON_GROUP_KEYS = new Set([
  'key', 'summary', 'description', 'comments',
  'created', 'updated', 'resolutiondate', 'duedate',
  'story_points', 'effort_days', 'effort_hours', 'age_days',
  'parent', 'epic_link', 'epic_key', 'labels',
]);

/**
 * When the backend omits color_field, scan the actual issue objects and pick
 * the field with the best categorical cardinality (2-8 unique values) that is
 * not already used as x_field or y_field.
 */
export function autoDetectGroupField(issues: ApiIssue[], excludeFields: string[]): string | null {
  if (!issues.length) return null;
  const exclude = new Set(excludeFields.map(f => f.toLowerCase()));

  // Collect every key present across all issues
  const allKeys = new Set<string>();
  for (const issue of issues) {
    for (const k of Object.keys(issue)) allKeys.add(k);
  }

  const candidates: { field: string; cardinality: number }[] = [];

  for (const key of allKeys) {
    if (exclude.has(key.toLowerCase())) continue;
    if (NON_GROUP_KEYS.has(key.toLowerCase())) continue;

    const values = issues.map(i => i[key]).filter(v => v != null && v !== '');
    if (!values.length) continue;

    const cardinality = new Set(values.map(String)).size;
    // Good grouping range: at least 2 series, at most 8 to keep the chart readable
    if (cardinality >= 2 && cardinality <= 8) {
      candidates.push({ field: key, cardinality });
    }
  }

  if (!candidates.length) return null;

  // Prefer fields closest to 4 unique values — sweet spot for a multiline chart
  candidates.sort((a, b) => Math.abs(a.cardinality - 4) - Math.abs(b.cardinality - 4));
  console.warn('[autoDetectGroupField] candidates:', candidates, '→ chose:', candidates[0].field);
  return candidates[0].field;
}

/** Single-series line chart over a categorical x-axis. */
export function buildSingleLine(entries: [string, number][], title: string, animation = true): EChartsOption {
  const color      = paletteColor(0);
  const categories = entries.map(([k]) => k);

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip as object, trigger: 'axis' },
    title: { text: title, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    xAxis: {
      type: 'category', data: categories,
      axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10, rotate: categories.length > 6 ? 30 : 0, interval: 0 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      minInterval: 1,
    },
    series: [{
      type: 'line',
      data: entries.map(([, v]) => v),
      smooth: true,
      symbol: 'circle', symbolSize: 5,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
    }],
  };
}

/**
 * Build a single spec from an explicit server-provided chartSpec.
 * Expected shape: { type, title, x_field, y_field, color_field? }
 */
export function fromExplicitSpec(chartSpec: ChartSpec, issues: ApiIssue[], animation = true): EChartsOption | null {
  if (!chartSpec || !issues.length) return null;

  // Normalise type — backend may send "multi-line", "multiline", etc.
  const normalizedType = LINE_TYPES.has(chartSpec.type) ? 'line' : chartSpec.type;

  console.warn('[fromExplicitSpec] raw type:', chartSpec.type, '→ normalized:', normalizedType,
    '| x_field:', chartSpec.x_field, '| color_field:', chartSpec.color_field);

  const xLower = chartSpec.x_field?.toLowerCase() ?? '';

  // Stacked bar: x_field = categories, color_field = stack segments.
  // Backend sometimes puts the stack dimension in y_field with color_field null —
  // detect this by checking if y_field is categorical (non-numeric, non-count).
  if (normalizedType === 'stacked_bar') {
    const yIsCategorical = chartSpec.y_field
      && !isCountField(chartSpec.y_field)
      && !issues.some(i => Number(i[chartSpec.y_field!]) > 0);

    const stackField = chartSpec.color_field
      ?? (yIsCategorical ? chartSpec.y_field! : null)
      ?? autoDetectGroupField(issues, [xLower, chartSpec.y_field ?? '']);

    // If y_field was promoted to stack, count issues instead of summing
    const valueField = (yIsCategorical || isCountField(chartSpec.y_field)) ? 'count' : (chartSpec.y_field ?? 'count');

    console.warn('[fromExplicitSpec] → stacked_bar | stackField:', stackField, '| valueField:', valueField);
    if (!stackField) return null;
    return buildStackedBarFromIssues(
      issues, chartSpec.x_field, stackField,
      valueField, chartSpec.title || 'Stacked Bar', animation,
    );
  }

  // Scatter: always handled first regardless of field types
  if (normalizedType === 'scatter') {
    console.warn('[fromExplicitSpec] → scatter | colorField:', chartSpec.color_field);
    return buildScatter(issues, chartSpec.x_field, chartSpec.y_field, chartSpec.title || 'Chart', chartSpec.color_field, animation);
  }

  if (DATE_FIELDS.has(xLower)) {
    // Line chart on a date field
    if (normalizedType === 'line') {
      const groupField = chartSpec.color_field ?? autoDetectGroupField(issues, [xLower, chartSpec.y_field ?? '']);
      if (groupField) {
        console.warn('[fromExplicitSpec] → buildGroupedTrend | groupField:', groupField, '| yField:', chartSpec.y_field);
        return buildGroupedTrend(
          issues, chartSpec.x_field, groupField,
          chartSpec.y_field ?? 'count', chartSpec.title ?? 'Trend', animation,
        );
      }
      console.warn('[fromExplicitSpec] → buildTrend (no group field found)');
      return buildTrend(issues, animation);
    }

    // Bar/pie on a date field → bucket by day/week/month
    const allDates = issues.map(i => parseDate(i[chartSpec.x_field])).filter((d): d is Date => d !== null);
    if (!allDates.length) return null;
    const bucket   = autoBucket(
      new Date(Math.min(...allDates.map(d => d.getTime()))),
      new Date(Math.max(...allDates.map(d => d.getTime()))),
    );
    const bucketed = bucketByDate(issues, chartSpec.x_field, bucket);
    if (!bucketed.length) return null;
    const entries: [string, number][] = bucketed.map(b => [b.label, b.count]);
    console.warn('[fromExplicitSpec] → date-bucketed', normalizedType);
    return normalizedType === 'pie'
      ? buildPie(entries, chartSpec.title ?? 'Chart', 20, animation)
      : buildBar(entries, chartSpec.title ?? 'Chart', 20, animation);
  }

  // Non-date x_field — line or bar with grouping
  if (normalizedType === 'line' || (normalizedType === 'bar' && chartSpec.color_field)) {
    const groupField = chartSpec.color_field ?? autoDetectGroupField(issues, [xLower, chartSpec.y_field ?? '']);
    if (groupField) {
      console.warn('[fromExplicitSpec] → buildGroupedCategorical | type:', normalizedType, '| groupField:', groupField);
      return buildGroupedCategorical(
        issues, chartSpec.x_field, groupField,
        chartSpec.y_field ?? 'count',
        normalizedType === 'line' ? 'line' : 'bar',
        chartSpec.title ?? 'Chart', animation,
      );
    }
  }

  // Single-series fallback
  console.warn('[fromExplicitSpec] → single-series fallback | type:', normalizedType);
  const title  = chartSpec.title || 'Chart';
  const entries: [string, number][] =
    isCountField(chartSpec.y_field)
      ? countByField(issues, chartSpec.x_field)
      : sumByField(issues, chartSpec.y_field, chartSpec.x_field);

  if (!entries.length) return null;

  if (normalizedType === 'pie') return buildPie(entries, title, 20, animation);
  if (normalizedType === 'line') return buildSingleLine(entries, title, animation);
  return buildBar(entries, title, 20, animation);
}

/** Return the first chart option for a given type preference. */
export function autoSpec(issues: ApiIssue[], type = 'bar', maxItems = 20, animation = true): EChartsOption | null {
  const specs    = buildAllSpecs(issues, maxItems, animation);
  const first    = Object.values(specs)[0];
  if (!first) return null;
  const preferred = Object.values(specs).find(s => s.icon === type);
  return (preferred ?? first).option;
}
