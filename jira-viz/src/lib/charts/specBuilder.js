// charts/specBuilder.js
// Converts a server issues array into ECharts option objects.
//
// Public API:
//   buildAllSpecs(issues, maxItems) → { tabKey: { label, option } }
//   autoSpec(issues, type, maxItems) → ECharts option | null
//
// The server can also return an explicit `chartSpec` in the response
// to override auto-derivation — see fromExplicitSpec().

import { BASE_OPTION, paletteGradient, paletteColor } from './theme.js';

// ── Time-series helpers ───────────────────────────────────────────────────────

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function autoBucket(minDate, maxDate) {
  const days = (maxDate - minDate) / 864e5;
  if (days <= 31)  return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function floorDate(date, bucket) {
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

function fmtLabel(date, bucket) {
  if (bucket === 'day')   return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (bucket === 'week')  return 'W ' + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function bucketByDate(issues, field, bucket) {
  const map = new Map();
  for (const issue of issues) {
    const d = parseDate(issue[field]);
    if (!d) continue;
    const ts = floorDate(d, bucket).getTime();
    map.set(ts, (map.get(ts) ?? 0) + 1);
  }
  const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
  if (!sorted.length) return [];

  // Fill gaps between first and last bucket
  const result = [];
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

// Linear regression → { slope, intercept }
function linReg(points) {
  const n = points.length;
  const sx = points.reduce((s, [x]) => s + x, 0);
  const sy = points.reduce((s, [, y]) => s + y, 0);
  const sxy = points.reduce((s, [x, y]) => s + x * y, 0);
  const sx2 = points.reduce((s, [x]) => s + x * x, 0);
  const slope = (n * sxy - sx * sy) / (n * sx2 - sx * sx || 1);
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function countByField(issues, field) {
  const map = {};
  for (const issue of issues) {
    const val = String(issue[field] ?? '—');
    map[val] = (map[val] ?? 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function sumByField(issues, valueField, groupField) {
  const map = {};
  for (const issue of issues) {
    const key = String(issue[groupField] ?? '—');
    const val = Number(issue[valueField] ?? 0);
    map[key] = (map[key] ?? 0) + val;
  }
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

// ── Chart builders ────────────────────────────────────────────────────────────

export function buildBar(entries, title, maxItems = 20, animation = true) {
  const slice = entries.slice(0, maxItems);
  const categories = slice.map(([k]) => k);
  const values = slice.map(([, v], i) => ({
    value: v,
    itemStyle: { color: paletteGradient(i, true) },
  }));

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip, trigger: 'axis' },
    title: {
      text: title,
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
      top: 4, left: 6,
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#475569',
        fontSize: 10,
        rotate: categories.length > 6 ? 30 : 0,
        interval: 0,
      },
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
    series: [{
      type: 'bar',
      data: values,
      barMaxWidth: 44,
      emphasis: { itemStyle: { opacity: 0.8 } },
    }],
  };
}

export function buildPie(entries, title, maxItems = 10, animation = true) {
  const slice = entries.slice(0, maxItems);
  const data = slice.map(([name, value], i) => ({
    name,
    value,
    itemStyle: { color: paletteColor(i) },
  }));

  return {
    ...BASE_OPTION,
    animation,
    title: {
      text: title,
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
      top: 4, left: 6,
    },
    legend: {
      show: slice.length <= 6,
      bottom: 2,
      textStyle: { color: '#64748b', fontSize: 10 },
      icon: 'circle',
      itemWidth: 7, itemHeight: 7,
    },
    series: [{
      type: 'pie',
      radius: ['36%', '66%'],
      center: ['50%', '52%'],
      data,
      label: {
        show: slice.length <= 8,
        formatter: '{b}: {d}%',
        fontSize: 10,
        color: '#64748b',
      },
      labelLine: { lineStyle: { color: '#334155' } },
      emphasis: {
        itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,.4)' },
      },
    }],
  };
}

// ── Trend chart ───────────────────────────────────────────────────────────────

/** All date fields we know about, in display order. */
export const TREND_FIELDS = [
  { key: 'created',        label: 'Created',  color: '#818cf8' },
  { key: 'resolutiondate', label: 'Resolved', color: '#34d399' },
  { key: 'updated',        label: 'Updated',  color: '#fbbf24' },
  { key: 'duedate',        label: 'Due',       color: '#f472b6' },
];

/** Return only the TREND_FIELDS that actually have data in this issues array. */
export function detectTrendFields(issues) {
  return TREND_FIELDS.filter(f => issues.some(i => parseDate(i[f.key])));
}

/**
 * Build a trend line chart from a user-selected subset of date fields.
 * @param {object[]} issues
 * @param {string[]} enabledKeys  — e.g. ['created', 'resolutiondate']
 * @param {boolean}  animation
 */
export function buildTrendSelectable(issues, enabledKeys, animation = true) {
  if (!issues?.length || !enabledKeys?.length) return null;

  const allDates = issues.map(i => parseDate(i.created)).filter(Boolean);
  if (!allDates.length) return null;

  const bucket = autoBucket(new Date(Math.min(...allDates)), new Date(Math.max(...allDates)));

  // Build unified label axis from all enabled fields
  const allTs = new Set();
  for (const key of enabledKeys) {
    bucketByDate(issues, key, bucket).forEach(b => allTs.add(b.ts));
  }
  const sortedTs = [...allTs].sort((a, b) => a - b);
  const labels   = sortedTs.map(ts => fmtLabel(new Date(ts), bucket));

  const series = enabledKeys.map(key => {
    const field  = TREND_FIELDS.find(f => f.key === key);
    const color  = field?.color ?? '#818cf8';
    const bkts   = bucketByDate(issues, key, bucket);
    const byTs   = new Map(bkts.map(b => [b.ts, b.count]));
    const data   = sortedTs.map(ts => byTs.get(ts) ?? 0);

    return {
      name: field?.label ?? key,
      type: 'line',
      data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color, width: 2 },
      itemStyle: { color },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: color + '40' },
            { offset: 1, color: color + '05' },
          ],
        },
      },
    };
  });

  const axisInterval = Math.max(0, Math.floor(labels.length / 8) - 1);

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip, trigger: 'axis' },
    legend: {
      show: series.length > 1,
      top: 24, right: 6,
      textStyle: { color: '#64748b', fontSize: 10 },
      icon: 'circle', itemWidth: 8, itemHeight: 8,
    },
    title: {
      text: 'Issue Trend',
      textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 },
      top: 4, left: 6,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#1e293b' } },
      axisTick: { show: false },
      axisLabel: { color: '#475569', fontSize: 10, rotate: labels.length > 10 ? 30 : 0, interval: axisInterval },
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
    series,
    grid: { ...BASE_OPTION.grid, top: series.length > 1 ? 52 : 36 },
  };
}

export function buildTrend(issues, animation = true) {
  const hasCreated  = issues.some(i => parseDate(i.created));
  if (!hasCreated) return null;

  const allDates   = issues.map(i => parseDate(i.created)).filter(Boolean);
  const bucket     = autoBucket(new Date(Math.min(...allDates)), new Date(Math.max(...allDates)));
  const created    = bucketByDate(issues, 'created', bucket);
  if (created.length < 2) return null;

  const labels  = created.map(b => b.label);
  const hasResolved = issues.some(i => parseDate(i.resolutiondate));

  // Cumulative "open" = created − resolved (running total)
  let cumCreated = 0, cumResolved = 0;
  const resolvedMap = new Map();
  if (hasResolved) {
    bucketByDate(issues, 'resolutiondate', bucket).forEach(b => resolvedMap.set(b.label, b.count));
  }

  const openData     = labels.map(l => { cumCreated += created.find(b => b.label === l)?.count ?? 0; cumResolved += resolvedMap.get(l) ?? 0; return cumCreated - cumResolved; });
  const createdData  = created.map(b => b.count);
  const resolvedData = hasResolved ? labels.map(l => resolvedMap.get(l) ?? 0) : null;

  const series = [
    {
      name: 'Open (cumulative)',
      type: 'line',
      data: openData,
      smooth: true,
      symbol: 'none',
      lineStyle: { color: '#818cf8', width: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(129,140,248,0.25)' }, { offset: 1, color: 'rgba(129,140,248,0.02)' }] } },
    },
    {
      name: 'Created',
      type: 'bar',
      data: createdData,
      barMaxWidth: 20,
      itemStyle: { color: 'rgba(129,140,248,0.4)' },
    },
  ];

  if (resolvedData) {
    series.push({
      name: 'Resolved',
      type: 'bar',
      data: resolvedData,
      barMaxWidth: 20,
      itemStyle: { color: 'rgba(52,211,153,0.5)' },
    });
  }

  const axisLabel = { color: '#475569', fontSize: 10, rotate: labels.length > 10 ? 30 : 0, interval: Math.max(0, Math.floor(labels.length / 8) - 1) };

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip, trigger: 'axis' },
    legend: { show: true, top: 24, right: 6, textStyle: { color: '#64748b', fontSize: 10 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    title: { text: 'Issue Trend', textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false }, axisLabel, splitLine: { show: false } },
    yAxis: { type: 'value', axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }, minInterval: 1 },
    series,
    grid: { ...BASE_OPTION.grid, top: 52 },
  };
}

// ── Burndown chart ────────────────────────────────────────────────────────────

export function buildBurndown(issues, animation = true) {
  const ptField = POINT_FIELDS.find(f => issues.some(i => Number(i[f]) > 0));
  if (!ptField) return null;

  const withPts   = issues.filter(i => Number(i[ptField]) > 0);
  const total     = withPts.reduce((s, i) => s + Number(i[ptField]), 0);
  const createdDs = issues.map(i => parseDate(i.created)).filter(Boolean);
  if (!createdDs.length) return null;

  const sprintStart = new Date(Math.min(...createdDs));
  sprintStart.setHours(0, 0, 0, 0);

  const dueDates  = issues.map(i => parseDate(i.duedate)).filter(Boolean);
  const sprintEnd = dueDates.length
    ? new Date(Math.max(...dueDates))
    : new Date(sprintStart.getTime() + 14 * 864e5);
  sprintEnd.setHours(23, 59, 59, 999);

  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Build day array sprint start → end
  const days = [];
  for (let d = new Date(sprintStart); d <= sprintEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const labels  = days.map(d => fmtLabel(d, 'day'));
  const ideal   = days.map((_, i) => Math.round(total * (1 - i / (days.length - 1))));

  const actual  = days.map(day => {
    if (day > today) return null;
    const burned = withPts.filter(i => { const rd = parseDate(i.resolutiondate); return rd && rd <= day; }).reduce((s, i) => s + Number(i[ptField]), 0);
    return total - burned;
  });

  // Linear regression on known actual points for projection
  const knownPts   = actual.map((v, i) => v !== null ? [i, v] : null).filter(Boolean);
  const lastActual = knownPts.length ? knownPts[knownPts.length - 1][0] : -1;
  const projected  = Array(days.length).fill(null);

  if (knownPts.length >= 2) {
    const { slope, intercept } = linReg(knownPts);
    for (let i = lastActual; i < days.length; i++) {
      projected[i] = Math.max(0, Math.round(slope * i + intercept));
    }
  }

  const series = [
    { name: 'Ideal',     type: 'line', data: ideal,     symbol: 'none', lineStyle: { color: '#334155', width: 1.5, type: 'dashed' }, itemStyle: { color: '#334155' } },
    { name: 'Actual',    type: 'line', data: actual,    smooth: false,  symbol: 'circle', symbolSize: 4, lineStyle: { color: '#818cf8', width: 2 }, itemStyle: { color: '#818cf8' }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(129,140,248,0.2)' }, { offset: 1, color: 'rgba(129,140,248,0.02)' }] } }, connectNulls: false },
    ...(knownPts.length >= 2 ? [{ name: 'Projected', type: 'line', data: projected, smooth: true, symbol: 'none', lineStyle: { color: '#f472b6', width: 1.5, type: 'dotted' }, itemStyle: { color: '#f472b6' }, connectNulls: false }] : []),
  ];

  const interval = Math.max(0, Math.floor(days.length / 7) - 1);

  return {
    ...BASE_OPTION,
    animation,
    tooltip: { ...BASE_OPTION.tooltip, trigger: 'axis', formatter: (params) => { const d = params[0]?.axisValue ?? ''; const lines = params.filter(p => p.value !== null).map(p => `${p.marker}${p.seriesName}: <b>${p.value} pts</b>`); return `${d}<br/>${lines.join('<br/>')}`; } },
    legend: { show: true, top: 24, right: 6, textStyle: { color: '#64748b', fontSize: 10 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
    title: { text: `Burndown  ·  ${total} pts`, textStyle: { color: '#94a3b8', fontSize: 12, fontWeight: 600 }, top: 4, left: 6 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 10, rotate: days.length > 10 ? 30 : 0, interval }, splitLine: { show: false } },
    yAxis: { type: 'value', min: 0, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#475569', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } } },
    series,
    grid: { ...BASE_OPTION.grid, top: 52 },
  };
}

// ── Auto-derivation ───────────────────────────────────────────────────────────

/** Fields tried in order — first one present in the data wins per spec. */
const GROUP_FIELDS = [
  { key: 'status',     label: 'Status' },
  { key: 'priority',   label: 'Priority' },
  { key: 'assignee',   label: 'Assignee' },
  { key: 'issuetype',  label: 'Type' },
];

const POINT_FIELDS = ['story_points', 'points', 'story points'];

function detectPointField(issues) {
  return POINT_FIELDS.find(f => issues.some(i => Number(i[f]) > 0));
}

/**
 * Build all meaningful chart specs from an issues array.
 * Returns an object keyed by tab id:
 *   { bar_status: { label: 'By Status', option: {...} }, pie_status: {...}, ... }
 */
export function buildAllSpecs(issues, maxItems = 20, animation = true) {
  if (!issues?.length) return {};

  const specs = {};

  for (const { key, label } of GROUP_FIELDS) {
    if (!issues.some(i => i[key])) continue;

    const entries = countByField(issues, key);
    if (entries.length < 2) continue;

    specs[`bar_${key}`] = {
      label: `By ${label}`,
      icon: 'bar',
      option: buildBar(entries, `Issues by ${label}`, maxItems, animation),
    };

    if (entries.length <= 9) {
      specs[`pie_${key}`] = {
        label: `${label} (pie)`,
        icon: 'pie',
        option: buildPie(entries, `Issues by ${label}`, maxItems, animation),
      };
    }
  }

  // Story points per assignee (only when points data exists)
  const ptField = detectPointField(issues);
  if (ptField && issues.some(i => i.assignee)) {
    const entries = sumByField(issues, ptField, 'assignee');
    if (entries.length >= 2) {
      specs['bar_points'] = {
        label: 'Story Points',
        icon: 'bar',
        option: buildBar(entries, 'Story Points by Assignee', maxItems, animation),
      };
    }
  }

  // Trend — requires created date field
  const trendOpt = buildTrend(issues, animation);
  if (trendOpt) {
    specs['trend'] = { label: 'Trend', icon: 'line', option: trendOpt };
  }

  // Burndown — requires story points + created date
  const burndownOpt = buildBurndown(issues, animation);
  if (burndownOpt) {
    specs['burndown'] = { label: 'Burndown', icon: 'line', option: burndownOpt };
  }

  return specs;
}

/**
 * Build a single spec — used when the server explicitly returns a chartSpec.
 * Expected shape:
 *   { type: 'bar'|'pie', title, categories: string[], values: number[] }
 */
export function fromExplicitSpec(chartSpec, animation = true) {
  if (!chartSpec) return null;
  const entries = chartSpec.categories.map((c, i) => [c, chartSpec.values[i]]);
  return chartSpec.type === 'pie'
    ? buildPie(entries, chartSpec.title, 20, animation)
    : buildBar(entries, chartSpec.title, 20, animation);
}

/** Convenience: quickest single chart for a message (first tab). */
export function autoSpec(issues, type = 'bar', maxItems = 20, animation = true) {
  const specs = buildAllSpecs(issues, maxItems, animation);
  const first = Object.values(specs)[0];
  if (!first) return null;
  // honour requested type if we have it
  const preferred = Object.values(specs).find(s => s.icon === type);
  return (preferred ?? first).option;
}
