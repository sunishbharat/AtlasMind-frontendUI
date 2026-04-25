<script lang="ts">
  // Split-panel view: chart (top/left) + AI results table (bottom/right).
  // Draggable divider resizes the split ratio.
  // Layout toggle switches between vertical and horizontal orientation.
  import type { EChartsOption } from 'echarts';
  import type { ApiIssue, AggregateResponse } from './chartStore.svelte.js';
  import type { SpecEntry } from './specBuilder.js';
  import { chartStore } from './chartStore.svelte.js';
  import { dataStore } from '../dataStore.svelte.js';
  import { buildAllSpecs, fromExplicitSpec, buildGroupedCategorical, buildGroupedTrend, autoDetectGroupField, buildPie } from './specBuilder.js';
  import { BASE_OPTION, paletteGradient, paletteColor, semanticBarGradient } from './theme.js';
  import { seriesColor, stableColorIndex } from '../colorMapping.js';
  import { features } from '../features.svelte.js';
  import ChartRenderer from './ChartRenderer.svelte';
  import AIHierarchyView from './AIHierarchyView.svelte';

  // - Table data ---------------------------------------------------------------
  // Fall back to dataStore sample data so demo page shows charts without an AI query.
  const fallbackIssues = $derived([
    ...dataStore.epics    as unknown as ApiIssue[],
    ...dataStore.stories  as unknown as ApiIssue[],
    ...dataStore.subtasks as unknown as ApiIssue[],
  ]);
  const issues        = $derived(chartStore.issues.length ? chartStore.issues : fallbackIssues);
  const displayFields = $derived(chartStore.data?.display_fields ?? []);
  const hasTable      = $derived(issues.length > 0);

  // Columns to render beyond the fixed Key + Summary columns.
  // Backend display_fields may include "Key"/"Summary" which are already fixed.
  const FIXED_COLS = new Set(['key', 'Key', 'summary', 'Summary']);
  const tableDisplayFields = $derived(displayFields.filter(c => !FIXED_COLS.has(c)));

  // - Axis selector state ------------------------------------------------------
  const CHART_TYPES = ['bar', 'stacked_bar', 'pie', 'line', 'scatter', 'trend'];

  const allFields = $derived.by((): string[] => {
    const fromDisplay = chartStore.data?.display_fields ?? [];
    const fromKeys    = issues.length ? Object.keys(issues[0]) : [];
    const seen        = new Set<string>();
    const out: string[] = [];
    for (const f of [...fromDisplay, ...fromKeys]) {
      if (!seen.has(f)) { seen.add(f); out.push(f); }
    }
    return out;
  });

  // Free-text / high-cardinality fields excluded from grouping
  const Y_SKIP = new Set(['key', 'summary', 'description', 'id', 'url', 'link']);

  // Fields whose sampled values are numeric — used to classify Y-axis selection type
  const numericFieldSet = $derived.by((): Set<string> => {
    const s = new Set<string>();
    if (!issues.length) return s;
    for (const key of Object.keys(issues[0])) {
      const sample = issues.find(i => i[key] != null)?.[key];
      if (sample != null && !isNaN(Number(sample))) s.add(key);
    }
    return s;
  });

  // Y options: count first, numeric fields, then categorical fields (cardinality 2-15)
  const yFields = $derived.by((): string[] => {
    if (!issues.length) return ['count'];
    const categorical: string[] = [];
    for (const key of Object.keys(issues[0])) {
      if (Y_SKIP.has(key.toLowerCase())) continue;
      if (numericFieldSet.has(key)) continue;
      const sample = issues.find(i => i[key] != null)?.[key];
      if (sample == null) continue;
      const uniqueCount = new Set(
        issues.slice(0, 100).map(i => String(i[key] ?? '')).filter(Boolean)
      ).size;
      if (uniqueCount >= 2 && uniqueCount <= 15) categorical.push(key);
    }
    return ['count', ...[...numericFieldSet], ...categorical];
  });

  let axisX        = $state(chartStore.chartSpec?.x_field ?? '');
  let axisY        = $state(chartStore.chartSpec?.y_field ?? 'count');
  let axisType     = $state(chartStore.chartSpec?.type    ?? 'pie');
  let openAxisMenu = $state<'x' | 'y' | 'type' | null>(null);
  let axisSearch   = $state('');

  $effect(() => {
    if (chartStore.chartSpec) {
      axisX    = chartStore.chartSpec.x_field;
      axisY    = chartStore.chartSpec.y_field;
      axisType = chartStore.chartSpec.type;
    } else {
      // No server chart_spec — default to pie so something meaningful shows immediately
      axisType = 'pie';
    }
  });

  // Auto-init axisX from first available field so selectors work without an AI query
  $effect(() => {
    if (!axisX && allFields.length) axisX = allFields[0];
  });

  // - Aggregation fetch --------------------------------------------------------
  let _aggTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerAggregate(): void {
    if (!issues.length || !axisX) return;
    if (_aggTimer) clearTimeout(_aggTimer);
    _aggTimer = setTimeout(async () => {
      chartStore.aggregating = true;
      // Categorical Y (e.g. "priority") acts as a grouping/stack dimension, not a value axis.
      // Send it as color_field and use "count" as y_field so the backend stacks correctly.
      const isCategoricalY = axisY !== 'count' && !numericFieldSet.has(axisY);
      // Serialize Set → array for JSON; only include non-empty filters.
      const activeFiltersPayload = hasActiveFilters
        ? Object.fromEntries(
            Object.entries(activeFilters)
              .filter(([, s]) => s.size > 0)
              .map(([k, s]) => [k, [...s]])
          )
        : undefined;

      const chartSpec = {
        type:           axisType,
        x_field:        axisX,
        y_field:        isCategoricalY ? 'count' : axisY,
        color_field:    isCategoricalY ? axisY   : undefined,
        title:          `${axisX} × ${axisY}`,
        max_categories: 20,
      };
      console.log('[CV] triggerAggregate →', { axisX, axisY, axisType, isCategoricalY, issueCount: issues.length });
      console.log('[CV] POST /api/aggregate chart_spec:', chartSpec);

      try {
        const resp = await fetch('/api/aggregate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issues,
            display_fields: displayFields,
            active_filters: activeFiltersPayload,
            react_to_filters: reactToFilters,
            chart_spec: chartSpec,
          }),
        });
        console.log('[CV] /api/aggregate HTTP status:', resp.status, resp.statusText);
        if (resp.ok) {
          const json = await resp.json();
          console.log('[CV] /api/aggregate response:', JSON.stringify(json, null, 2));
          chartStore.setAggregated(json as AggregateResponse);
        } else {
          const text = await resp.text();
          console.error('[CV] /api/aggregate error body:', text);
        }
      } catch (err) {
        console.error('[CV] /api/aggregate FAILED (network/parse error):', err);
      } finally {
        chartStore.aggregating = false;
      }
    }, 180);
  }

  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    axisX; axisY; axisType; activeFilters; reactToFilters;
    triggerAggregate();
  });

  // - ECharts option from aggregated data --------------------------------------
  const aggregatedOption = $derived.by((): EChartsOption | null => {
    const agg = chartStore.aggregated;
    if (!agg) {
      console.log('[CV] aggregatedOption: no agg data yet');
      return null;
    }
    // Treat backend error responses (empty series, no pie/scatter) as no data
    const hasData = agg.pie_data?.length || agg.scatter_data?.length || agg.series?.length;
    console.log('[CV] aggregatedOption: title=', agg.title, '| hasData=', !!hasData,
      '| pie=', agg.pie_data?.length ?? 0,
      '| scatter=', agg.scatter_data?.length ?? 0,
      '| series=', agg.series?.length ?? 0,
      '| axisType=', axisType);
    if (!hasData) {
      console.warn('[CV] aggregatedOption: agg returned but hasData=false → chart will not update');
      return null;
    }

    if (agg.pie_data?.length) {
      console.log('[CV] aggregatedOption → pie (', agg.pie_data.length, 'slices)');
      const entries: [string, number][] = agg.pie_data.map(p => [p.name, p.value]);
      return buildPie(entries, agg.title, 20, features.charts.animation);
    }

    if (agg.scatter_data?.length) {
      console.log('[CV] aggregatedOption → scatter (raw scatter_data)');
      const groups = [...new Set(agg.scatter_data.map(p => p.group))];
      return {
        ...BASE_OPTION,
        tooltip: { ...BASE_OPTION.tooltip, trigger: 'item' },
        legend: {
          show: groups.length > 1,
          top: 8, right: 8,
          textStyle: { color: '#94a3b8', fontSize: 10 },
          icon: 'circle', itemWidth: 8, itemHeight: 8,
        },
        xAxis: { type: 'value', splitLine: { lineStyle: { color: '#1e293b' } } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#1e293b' } } },
        series: groups.map((g, i) => ({
          type: 'scatter' as const, name: g || 'Items',
          data: agg.scatter_data!.filter(p => p.group === g).map(p => [p.x, p.y]),
          itemStyle: { color: paletteColor(i) },
        })),
      };
    }

    // When scatter was requested but backend fell back to bar (non-numeric fields),
    // render bar data as categorical scatter dots rather than bars.
    if (axisType === 'scatter' && agg.series?.length) {
      console.log('[CV] aggregatedOption → scatter (bar fallback, series count=', agg.series.length, ')');
      return {
        ...BASE_OPTION,
        tooltip: { ...BASE_OPTION.tooltip, trigger: 'item' },
        legend: {
          show: agg.series.length > 1,
          top: 8, right: 8,
          textStyle: { color: '#94a3b8', fontSize: 10 },
          icon: 'circle', itemWidth: 8, itemHeight: 8,
        },
        xAxis: {
          type: 'category', data: agg.x_axis,
          axisLine: { lineStyle: { color: '#1e293b' } },
          axisTick: { show: false },
          axisLabel: { color: '#94a3b8', fontSize: 10, rotate: agg.x_axis.length > 6 ? 30 : 0, interval: 0 },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#94a3b8', fontSize: 10 },
        },
        series: agg.series.map((s, i) => ({
          type: 'scatter' as const,
          name: s.name,
          data: s.data,
          symbolSize: 9,
          itemStyle: { color: paletteColor(i), opacity: 0.85 },
        })),
      };
    }

    console.log('[CV] aggregatedOption → bar/line series (count=', agg.series.length, ', x_axis=', agg.x_axis.length, 'categories)');
    // When axisY is categorical (used as color/stack field), s.name is a value of that field.
    const isCategoricalY = axisY !== 'count' && !numericFieldSet.has(axisY);
    const colorField: string | null = isCategoricalY ? axisY : null;
    const hasMultiSeries = agg.series.length > 1;
    return {
      ...BASE_OPTION,
      tooltip: { ...BASE_OPTION.tooltip, trigger: 'axis' },
      legend: {
        show: hasMultiSeries,
        top: 8, right: 8,
        textStyle: { color: '#94a3b8', fontSize: 10 },
        icon: 'circle', itemWidth: 8, itemHeight: 8,
      },
      grid: { ...(BASE_OPTION.grid as object), top: hasMultiSeries ? 44 : 28 },
      xAxis: { type: 'category', data: agg.x_axis, axisLine: { lineStyle: { color: '#1e293b' } },
               axisTick: { show: false }, splitLine: { show: false },
               axisLabel: { color: '#94a3b8', fontSize: 10, interval: 0, rotate: agg.x_axis.length > 6 ? 30 : 0 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#1e293b' } },
               axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: agg.series.map((s) => {
        const sem = seriesColor(colorField, s.name);
        return ({
        type:  s.chart_type as 'bar' | 'line',
        name:  s.name,
        data:  s.data,
        ...(s.stack ? { stack: s.stack } : {}),
        ...(s.chart_type === 'bar'
          ? {
              itemStyle: { color: sem ? semanticBarGradient(sem) : paletteGradient(stableColorIndex(s.name)), borderRadius: s.stack ? [0, 0, 0, 0] as const : [12, 12, 0, 0] as const },
              barMaxWidth: 40, barMinHeight: 4,
              showBackground: !s.stack,
              backgroundStyle: { color: 'rgba(255,255,255,0.04)', borderRadius: [12, 12, 0, 0] as const },
              label: s.stack
                ? { show: true, position: 'inside' as const, color: 'rgba(255,255,255,0.9)', fontSize: 9, fontFamily: 'Inter, system-ui, sans-serif', formatter: (p: { value: number | null }) => (p.value && p.value > 0 ? (Number.isInteger(p.value) ? String(p.value) : p.value.toFixed(2).replace(/\.?0+$/, '')) : '') }
                : { show: true, position: 'top'    as const, color: '#e2e8f0',               fontSize: 10, fontFamily: 'Inter, system-ui, sans-serif', formatter: (p: { value: number | null }) => p.value != null ? fmtNum(p.value) : '' },
              emphasis: { itemStyle: { shadowBlur: 16, shadowColor: 'rgba(129,140,248,0.45)', opacity: 1 } },
            }
          : { smooth: true, showSymbol: false, lineStyle: { color: sem ?? paletteColor(stableColorIndex(s.name)), width: 2 },
              label: { show: agg.x_axis.length <= 15, position: 'top' as const, color: '#e2e8f0', fontSize: 9, fontFamily: 'Inter, system-ui, sans-serif', formatter: (p: { value: number | null }) => p.value != null ? fmtNum(p.value) : '' } }),
        });
      }),
    };
  });

  // - Field resolver -----------------------------------------------------------
  // Contract: every display_fields entry is the exact key in the issue dict.
  // Keys are renamed from customfield_1xxxx → display name by main.py before reaching here.
  // Lowercase fallback covers demo-mode hardcoded data (status, assignee, etc.).
  function resolveIssueField(issue: ApiIssue, displayName: string): unknown {
    if (displayName in issue) return issue[displayName];
    const lower = displayName.toLowerCase();
    if (lower in issue) return issue[lower];
    return undefined;
  }

  // - Cell formatter -----------------------------------------------------------
  /** Extract a display string from any Jira field value, including Greenhopper sprint strings. */
  function fmtJiraValue(val: unknown): string {
    if (val == null || val === '') return '—';
    if (typeof val === 'string') {
      // Greenhopper sprint toString: "...Sprint@...[...name=Sprint Name,...]"
      if (val.includes('com.atlassian.greenhopper') || val.includes('Sprint@')) {
        const m = val.match(/\bname=([^,\]]+)/);
        if (m) return m[1].trim();
      }
      return val;
    }
    if (typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if ('name' in obj)        return String(obj.name);
      if ('displayName' in obj) return String(obj.displayName);
      if ('value' in obj)       return String(obj.value);
      return JSON.stringify(val);
    }
    return String(val);
  }

  function fmtNum(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
  }

  function fmtCell(col: string, val: unknown): string {
    if (val == null || val === '') return '—';
    if (typeof val === 'number') return isFinite(val) ? fmtNum(val) : '—';
    if (Array.isArray(val)) {
      if (val.length === 0) return '—';
      // Sprint-like arrays: each element is a string or object — extract names
      const first = val[0];
      if (typeof first === 'string' && (first.includes('com.atlassian.greenhopper') || first.includes('Sprint@'))) {
        return val.map(v => fmtJiraValue(v)).join(', ');
      }
      if (typeof first === 'object' && first !== null) {
        return col === 'comments'
          ? `${val.length} comment${val.length !== 1 ? 's' : ''}`
          : val.map(v => fmtJiraValue(v)).join(', ');
      }
      return (val as unknown[]).join(', ');
    }
    if (typeof val === 'object') return JSON.stringify(val);
    // Numeric strings (e.g. effort_days returned as "3.14159")
    const n = Number(val);
    if (String(val) !== '' && isFinite(n)) return fmtNum(n);
    return String(val);
  }

  // - Filters ------------------------------------------------------------------
  const DATE_KEYS = new Set(['created', 'resolutiondate', 'updated', 'duedate', 'resolutionDate', 'createdDate']);

  function isDateLike(key: string, sample: unknown): boolean {
    return DATE_KEYS.has(key) || DATE_KEYS.has(key.toLowerCase()) || /^\d{4}-\d{2}-\d{2}/.test(String(sample ?? ''));
  }

  function toDateKey(str: string): string | null {
    try {
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    } catch { return null; }
  }

  function fmtDateKey(key: string): string {
    if (!key || key === 'Empty') return key ?? 'Empty';
    const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return key;
    const [, y, mo, d] = m.map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const MAX_FILTER_VALUES = 100;

  interface FilterInfo { values: string[]; counts: Record<string, number>; isDate: boolean }

  const filterableMap = $derived.by((): Record<string, FilterInfo> => {
    const map: Record<string, FilterInfo> = {};
    if (!issues.length) return map;
    const backendCounts = chartStore.aggregated?.field_counts ?? null;
    for (const key of displayFields) {
      const sample  = resolveIssueField(issues.find(i => resolveIssueField(i, key) != null) ?? {}, key);
      const dateCol = isDateLike(key, sample);

      // Aggregator engine owns label normalization — use its output directly.
      // Local fallback (demo mode / no aggregation) also produces 'Empty' for null values.
      const counts: Record<string, number> = backendCounts?.[key] ?? (() => {
        const c: Record<string, number> = {};
        for (const issue of issues) {
          const v = resolveIssueField(issue, key);
          let label: string;
          if (v == null || v === '') label = 'Empty';
          else if (Array.isArray(v)) label = v.length ? fmtCell(key, v) : 'Empty';
          else if (dateCol) label = toDateKey(String(v)) ?? 'Empty';
          else label = String(v);
          c[label] = (c[label] ?? 0) + 1;
        }
        return c;
      })();

      const EMPTY_VALS = new Set(['Empty', '—']);
      const values = Object.keys(counts).sort((a, b) => {
        const ae = EMPTY_VALS.has(a), be = EMPTY_VALS.has(b);
        if (ae && !be) return -1;
        if (!ae && be) return 1;
        return a.localeCompare(b);
      }).slice(0, MAX_FILTER_VALUES);
      if (values.length >= 2) map[key] = { values, counts, isDate: dateCol };
    }
    return map;
  });

  let activeFilters = $state<Record<string, Set<string>>>({});
  let openFilter    = $state<string | null>(null);
  let filterSearch  = $state('');

  const filteredIssues = $derived.by((): ApiIssue[] => {
    const active = Object.entries(activeFilters).filter(([, s]) => s.size > 0);
    if (!active.length) return issues;
    return issues.filter(issue =>
      active.every(([key, vals]) => {
        const info = filterableMap[key];
        const raw  = resolveIssueField(issue, key);
        let val: string;
        if (raw == null || raw === '') val = 'Empty';
        else if (info?.isDate) val = toDateKey(String(raw)) ?? 'Empty';
        else val = String(raw);
        return vals.has(val);
      }),
    );
  });

  const hasActiveFilters = $derived(Object.values(activeFilters).some(s => s.size > 0));

  // - Chart specs --------------------------------------------------------------
  let reactToFilters = $state(false);

  const LINE_INTENT_RE = /\b(multi.?line|line\s+chart|multiline|trend\s+by|over\s+time\s+by)\b/i;

  const specs = $derived.by((): Record<string, SpecEntry> => {
    // Auto charts always built from the full (or filtered) issue set
    const src  = reactToFilters && hasActiveFilters ? filteredIssues : issues;
    const auto = buildAllSpecs(src, features.charts.maxItems, features.charts.animation);

    // Aggregated result from axis selectors takes highest priority
    if (aggregatedOption) {
      const label = chartStore.aggregated?.title ?? chartStore.chartSpec?.title ?? 'Chart';
      const result = { explicit: { label, icon: axisType, option: aggregatedOption }, ...auto };
      console.log('[CV] specs → explicit+auto, tabs:', Object.keys(result), '| activeTab:', activeTab);
      return result;
    }

    if (chartStore.chartSpec) {
      // Backend provided an explicit spec — show it first, keep all auto tabs
      const opt = fromExplicitSpec(chartStore.chartSpec, issues, features.charts.animation);
      if (opt) return { explicit: { label: chartStore.chartSpec.title || 'Chart', icon: chartStore.chartSpec.type || 'bar', option: opt }, ...auto };
    } else if (issues.length && LINE_INTENT_RE.test(chartStore.query)) {
      // Backend omitted chart_spec but query asks for a line/multiline chart —
      // auto-detect x and group fields from the actual issue data
      const groupField = autoDetectGroupField(issues, []);
      if (groupField) {
        const xField = autoDetectGroupField(issues, [groupField]) ?? Object.keys(issues[0] ?? {}).find(k => k !== groupField) ?? '';
        console.warn('[ChartView] chart_spec null, line intent — xField:', xField, 'groupField:', groupField);
        const opt = buildGroupedCategorical(issues, xField, groupField, 'count', 'line',
          `Issues by ${xField} / ${groupField}`, features.charts.animation);
        // Prepend the line chart tab; all auto tabs remain
        if (opt) return { explicit: { label: `By ${xField} / ${groupField}`, icon: 'line', option: opt }, ...auto };
      }
    }

    // No explicit chart — return all auto tabs as-is
    return auto;
  });

  const tabKeys = $derived(Object.keys(specs));

  let activeTab = $state<string | null>(null);
  $effect(() => {
    if (!tabKeys.length) return;
    if (!activeTab || !tabKeys.includes(activeTab)) {
      const preferred = tabKeys.find(k => k.startsWith(features.charts.defaultType));
      activeTab = preferred ?? tabKeys[0];
    }
  });

  const currentOption = $derived(activeTab ? specs[activeTab]?.option ?? {} : {});

  // - Jira drill-down on chart click -------------------------------------------

  /** Infer the Jira field name for the active chart tab. */
  const clickField = $derived.by((): string | null => {
    if (!activeTab) return null;
    if (activeTab === 'explicit') return axisX || null;
    const m = activeTab.match(/^(?:bar|pie|line|scatter|stacked)_(.+)$/);
    return m ? m[1] : null;
  });

  function handleBarClick(params: { name?: string }): void {
    const value   = params.name;
    const field   = clickField;
    const baseUrl = chartStore.data?.jira_base_url;
    if (!value || !field || !baseUrl) return;

    const raw = chartStore.data?.jql ?? '';
    // Split off any ORDER BY clause so the new filter is inserted before it
    const orderMatch = raw.match(/(\s+ORDER\s+BY\s+.+)$/i);
    const orderClause = orderMatch ? orderMatch[1] : '';
    const baseJql    = orderMatch ? raw.slice(0, orderMatch.index) : raw;
    const isEmpty      = value === '—' || value === 'Empty' || value === '';
    const filterClause = isEmpty ? `${field} is EMPTY` : `${field} = "${value}"`;
    const jql = baseJql ? `${baseJql} AND ${filterClause}${orderClause}` : filterClause;
    window.open(`${baseUrl}/issues/?jql=${encodeURIComponent(jql)}`, '_blank', 'noopener');
  }

  function openDropdown(col: string): void {
    openFilter   = openFilter === col ? null : col;
    filterSearch = '';
  }

  function toggleFilterValue(field: string, value: string): void {
    const next = new Set(activeFilters[field] ?? []);
    next.has(value) ? next.delete(value) : next.add(value);
    activeFilters = { ...activeFilters, [field]: next };
  }

  function clearColumnFilter(field: string): void {
    const { [field]: _, ...rest } = activeFilters;
    activeFilters = rest;
  }

  function selectAllFilter(field: string, values: string[]): void {
    activeFilters = { ...activeFilters, [field]: new Set(values) };
  }

  function clearAllFilters(): void { activeFilters = {}; }

  // - Column sort --------------------------------------------------------------
  let sortCol = $state<string | null>(null);
  let sortDir = $state<'asc' | 'desc'>('asc');

  function toggleSort(col: string): void {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = 'asc';
    }
  }

  const sortedIssues = $derived.by((): ApiIssue[] => {
    if (!sortCol) return filteredIssues;
    const col = sortCol;
    return [...filteredIssues].sort((a, b) => {
      const info = filterableMap[col];
      const av   = resolveIssueField(a, col) ?? '';
      const bv   = resolveIssueField(b, col) ?? '';
      if (info?.isDate || isDateLike(col, av)) {
        const ad = av ? new Date(String(av)).getTime() : 0;
        const bd = bv ? new Date(String(bv)).getTime() : 0;
        return sortDir === 'asc' ? ad - bd : bd - ad;
      }
      const an = Number(av), bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) return sortDir === 'asc' ? an - bn : bn - an;
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  });

  let tableMode = $state<'table' | 'hierarchy'>('table');

  $effect(() => {
    function onDoc(e: MouseEvent) {
      if (!(e.target as Element).closest('.cv-col-filter')) {
        openFilter   = null;
        openAxisMenu = null;
      }
    }
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  });

  // - Layout state -------------------------------------------------------------
  let layout    = $state<'vertical' | 'horizontal'>('vertical');
  let splitPct  = $state(55);
  let container = $state<HTMLDivElement | undefined>(undefined);
  let dragging  = $state(false);

  function onDividerDown(e: MouseEvent): void {
    e.preventDefault();
    dragging = true;

    function onMove(ev: MouseEvent): void {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (layout === 'vertical') {
        splitPct = Math.min(80, Math.max(20, ((ev.clientY - rect.top)  / rect.height) * 100));
      } else {
        splitPct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width)  * 100));
      }
    }

    function onUp(): void {
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }

  function toggleLayout(): void {
    layout   = layout === 'vertical' ? 'horizontal' : 'vertical';
    splitPct = 55;
  }
</script>

<div class="chart-view" class:dragging>
  {#if tabKeys.length || hasTable}

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="cv-header">
      {#if chartStore.query}
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
          <circle cx="7" cy="7" r="6" stroke="#818cf8" stroke-width="1.3"/>
          <path d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z" fill="#818cf8"/>
          <circle cx="7" cy="11" r=".7" fill="#818cf8"/>
        </svg>
        <span class="cv-query-text">{chartStore.query}</span>
        {#if chartStore.noResults}
          <span class="cv-no-results">No results — showing previous data</span>
        {:else}
          <span class="cv-count">{issues.length} issues</span>
        {/if}
      {/if}

      <!-- Layout toggle -->
      <button class="cv-layout-btn" onclick={toggleLayout} title="Toggle layout">
        {#if layout === 'vertical'}
          <!-- Horizontal split icon -->
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
            <rect x="1" y="7.5" width="12" height="5.5" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          Split Horizontal
        {:else}
          <!-- Vertical split icon -->
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5.5" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
            <rect x="7.5" y="1" width="5.5" height="12" rx="1.2" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          Split Vertical
        {/if}
      </button>
    </div>

    <!-- ── Split container ────────────────────────────────────────────────── -->
    <div
      class="cv-split"
      class:cv-split--h={layout === 'horizontal'}
      bind:this={container}
    >

      <!-- Chart pane -->
      <div
        class="cv-pane cv-pane--chart"
        style="{layout === 'vertical' ? 'height' : 'width'}:{splitPct}%"
      >
        {#if tabKeys.length}
          <div class="cv-tabs-row">
          <div class="cv-tabs">
            {#each tabKeys as key}
              <button
                class="cv-tab"
                class:active={activeTab === key}
                class:ai={key === 'explicit'}
                onclick={() => (activeTab = key)}
              >
                {#if key === 'explicit'}
                  <svg class="ai-spark" width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v2M5 7v2M1 5h2M7 5h2M2.5 2.5l1.4 1.4M6.1 6.1l1.4 1.4M7.5 2.5L6.1 3.9M3.9 6.1L2.5 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                  </svg>
                {:else if specs[key].icon === 'pie'}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M5 5V1A4 4 0 1 0 9 5z" fill="currentColor" opacity=".6"/>
                    <path d="M5 5H9A4 4 0 0 0 5 1z" fill="currentColor"/>
                  </svg>
                {:else if specs[key].icon === 'line'}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <polyline points="1,8 3.5,4 6,6 9,1" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {:else if specs[key].icon === 'scatter'}
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
                    <circle cx="4.5" cy="3.5" r="1.2" fill="currentColor"/>
                    <circle cx="7.5" cy="5.5" r="1.2" fill="currentColor"/>
                    <circle cx="1.5" cy="2" r="1.2" fill="currentColor" opacity=".6"/>
                    <circle cx="6.5" cy="1.5" r="1.2" fill="currentColor" opacity=".6"/>
                  </svg>
                {:else}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <rect x=".5" y="5"   width="2.5" height="4.5" rx=".5" fill="currentColor"/>
                    <rect x="3.8" y="2.5" width="2.5" height="7"   rx=".5" fill="currentColor"/>
                    <rect x="7"   y=".5"  width="2.5" height="9"   rx=".5" fill="currentColor"/>
                  </svg>
                {/if}
                {specs[key].label}
              </button>
            {/each}
          </div>

          <!-- Axis selectors (only when issues are loaded) -->
          {#if issues.length}
            <!-- X-axis -->
            <div class="cv-col-filter cv-axis-sel">
              <button
                class="cv-react-btn"
                class:active={!!axisX}
                onclick={() => { openAxisMenu = openAxisMenu === 'x' ? null : 'x'; axisSearch = ''; }}
                title="Select X axis field"
              >
                X: {axisX || '—'}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
              {#if openAxisMenu === 'x'}
                <div class="col-filter-menu cv-axis-menu">
                  <div class="col-filter-head">X Axis</div>
                  {#if allFields.length > 8}
                    <div class="col-filter-search">
                      <input
                        class="col-filter-input"
                        type="text"
                        bind:value={axisSearch}
                        placeholder="Search fields…"
                        onclick={(e) => e.stopPropagation()}
                      />
                    </div>
                  {/if}
                  <div class="col-filter-list">
                    {#each allFields.filter(f => !axisSearch || f.toLowerCase().includes(axisSearch.toLowerCase())) as f}
                      <button
                        class="col-filter-item"
                        class:checked={axisX === f}
                        onclick={() => { axisX = f; openAxisMenu = null; }}
                      >
                        <span class="col-filter-val">{f}</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- Y-axis -->
            <div class="cv-col-filter cv-axis-sel">
              <button
                class="cv-react-btn"
                class:active={axisY !== 'count'}
                onclick={() => { openAxisMenu = openAxisMenu === 'y' ? null : 'y'; axisSearch = ''; }}
                title="Select Y axis field"
              >
                Y: {axisY}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
              {#if openAxisMenu === 'y'}
                <div class="col-filter-menu cv-axis-menu">
                  <div class="col-filter-head">Y Axis</div>
                  <div class="col-filter-list">
                    {#each yFields as f}
                      <button
                        class="col-filter-item"
                        class:checked={axisY === f}
                        onclick={() => {
                          axisY = f;
                          openAxisMenu = null;
                          if (f !== 'count' && !numericFieldSet.has(f) && axisType === 'bar') {
                            axisType = 'stacked_bar';
                          }
                        }}
                      >
                        <span class="col-filter-val">{f}</span>
                        {#if f !== 'count' && !numericFieldSet.has(f)}
                          <span class="cv-group-badge">group</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            <!-- Chart type -->
            <div class="cv-col-filter cv-axis-sel">
              <button
                class="cv-react-btn"
                onclick={() => { openAxisMenu = openAxisMenu === 'type' ? null : 'type'; }}
                title="Select chart type"
              >
                {axisType}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </button>
              {#if openAxisMenu === 'type'}
                <div class="col-filter-menu cv-axis-menu">
                  <div class="col-filter-head">Chart Type</div>
                  <div class="col-filter-list">
                    {#each CHART_TYPES as t}
                      <button
                        class="col-filter-item"
                        class:checked={axisType === t}
                        onclick={() => { axisType = t; openAxisMenu = null; }}
                      >
                        <span class="col-filter-val">{t}</span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>

            {#if chartStore.aggregating}
              <span class="cv-agg-spinner" title="Aggregating…">↻</span>
            {/if}
          {/if}

          <!-- React-to-filters toggle -->
          <button
            class="cv-react-btn"
            class:active={reactToFilters}
            onclick={() => (reactToFilters = !reactToFilters)}
            title={reactToFilters ? 'Chart reacting to table filters — click to unlock' : 'Chart showing all data — click to sync with filters'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 2.5h8M2.5 5h5M4 7.5h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            {reactToFilters ? 'Synced' : 'Sync chart'}
            {#if reactToFilters && hasActiveFilters}
              <span class="cv-react-dot"></span>
            {/if}
          </button>

          </div>

          <div class="cv-chart-area">
            <ChartRenderer option={currentOption} height="100%" onChartClick={handleBarClick} />
          </div>
        {:else}
          <div class="cv-empty-chart">No chart data</div>
        {/if}
      </div>

      <!-- Draggable divider -->
      <button
        type="button"
        class="cv-divider"
        class:cv-divider--h={layout === 'horizontal'}
        aria-label="Resize panels"
        onmousedown={onDividerDown}
        onkeydown={(e) => {
          const step = 5;
          if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  splitPct = Math.max(20, splitPct - step);
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') splitPct = Math.min(80, splitPct + step);
        }}
      >
        <span class="cv-divider-dots"></span>
      </button>

      <!-- Table pane -->
      <div class="cv-pane cv-pane--table">
        {#if hasTable}
          <div class="cv-table-header">
            <span class="cv-table-label">Results</span>
            {#if chartStore.data?.jql}
              <code class="cv-jql" title={chartStore.data.jql}>{chartStore.data.jql}</code>
            {/if}
            {#if chartStore.data?.jira_base_url && chartStore.data?.jql}
              <a
                class="cv-table-count cv-table-count--link"
                href="{chartStore.data.jira_base_url}/issues/?jql={encodeURIComponent(chartStore.data.jql)}"
                target="_blank"
                rel="noreferrer"
                title="Open in Jira"
              >
                {hasActiveFilters ? `${filteredIssues.length} of ` : ''}{chartStore.data?.shown ?? issues.length}{chartStore.data?.total ? ` / ${chartStore.data.total}` : ''}
              </a>
            {:else}
              <span class="cv-table-count">
                {hasActiveFilters ? `${filteredIssues.length} of ` : ''}{chartStore.data?.shown ?? issues.length}{chartStore.data?.total ? ` / ${chartStore.data.total}` : ''}
              </span>
            {/if}
            {#if hasActiveFilters}
              <button class="cv-clear-all" onclick={clearAllFilters} title="Clear all filters">✕ Clear filters</button>
            {/if}
            <!-- View mode toggle -->
            <div class="cv-view-toggle">
              <button
                class="cv-view-btn"
                class:active={tableMode === 'table'}
                onclick={() => (tableMode = 'table')}
                title="Table view"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="1" y="1" width="8" height="2" rx=".5" fill="currentColor"/>
                  <rect x="1" y="4" width="8" height="2" rx=".5" fill="currentColor" opacity=".6"/>
                  <rect x="1" y="7" width="8" height="2" rx=".5" fill="currentColor" opacity=".35"/>
                </svg>
                Table
              </button>
              <button
                class="cv-view-btn"
                class:active={tableMode === 'hierarchy'}
                onclick={() => (tableMode = 'hierarchy')}
                title="Hierarchy view"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="2" cy="5" r="1.2" fill="currentColor"/>
                  <circle cx="5" cy="2.5" r="1.2" fill="currentColor"/>
                  <circle cx="5" cy="7.5" r="1.2" fill="currentColor"/>
                  <circle cx="8" cy="5" r="1.2" fill="currentColor"/>
                  <line x1="3.2" y1="5" x2="3.8" y2="2.5" stroke="currentColor" stroke-width="1"/>
                  <line x1="3.2" y1="5" x2="3.8" y2="7.5" stroke="currentColor" stroke-width="1"/>
                  <line x1="6.2" y1="2.5" x2="6.8" y2="5" stroke="currentColor" stroke-width="1"/>
                  <line x1="6.2" y1="7.5" x2="6.8" y2="5" stroke="currentColor" stroke-width="1"/>
                </svg>
                Hierarchy
              </button>
            </div>
          </div>

          {#if tableMode === 'hierarchy'}
            <AIHierarchyView
              issues={sortedIssues}
              jiraBaseUrl={chartStore.data?.jira_base_url ?? ''}
            />
          {:else}
          <div class="cv-table-wrap">
            <table class="cv-table">
              <thead>
                <tr>
                  <th onclick={() => toggleSort('key')} class="th-sortable" class:th-sorted={sortCol === 'key'}>
                    <div class="th-inner">
                      <span class="th-label">Key</span>
                      <span class="sort-icon">{sortCol === 'key' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </div>
                  </th>
                  <th onclick={() => toggleSort('summary')} class="th-sortable" class:th-sorted={sortCol === 'summary'}>
                    <div class="th-inner">
                      <span class="th-label">Summary</span>
                      <span class="sort-icon">{sortCol === 'summary' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                    </div>
                  </th>
                  {#each tableDisplayFields as col}
                    {@const colInfo   = filterableMap[col]}
                    {@const colFilter = activeFilters[col]}
                    {@const isFiltered = (colFilter?.size ?? 0) > 0}
                    <th class:th-filtered={isFiltered} class:th-sorted={sortCol === col} class="th-sortable" onclick={() => toggleSort(col)}>
                      <div class="th-inner">
                        <span class="th-label">{col[0].toUpperCase() + col.slice(1).replace(/_/g, ' ')}</span>
                        <span class="sort-icon">{sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                        {#if colInfo}
                          <div class="cv-col-filter">
                            <button
                              class="col-filter-btn"
                              class:active={isFiltered}
                              onclick={(e) => { e.stopPropagation(); openDropdown(col); }}
                              onmousedown={(e) => e.stopPropagation()}
                              title="Filter {col}"
                            >
                              {#if isFiltered}
                                <span class="col-filter-badge">{colFilter.size}</span>
                              {:else}
                                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                                  <path d="M1 2h8M2.5 5h5M4 8h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                                </svg>
                              {/if}
                            </button>
                            {#if openFilter === col}
                              <div class="col-filter-menu">
                                <div class="col-filter-head">
                                  <span>{col[0].toUpperCase() + col.slice(1).replace(/_/g, ' ')}</span>
                                  {#if isFiltered}
                                    <button class="col-filter-reset" onclick={() => clearColumnFilter(col)}>Reset</button>
                                  {/if}
                                </div>
                                {#if colInfo.values.length > 8}
                                  <div class="col-filter-search">
                                    <input
                                      class="col-filter-input"
                                      type="text"
                                      placeholder="Search…"
                                      bind:value={filterSearch}
                                      onclick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                {/if}
                                {#if colInfo}
                                {@const visibleVals = colInfo.values.filter(v => !filterSearch || fmtDateKey(v).toLowerCase().includes(filterSearch.toLowerCase()))}
                                {@const allSelected = visibleVals.length > 0 && visibleVals.every(v => colFilter?.has(v))}
                                <div class="col-filter-select-all">
                                  <button
                                    class="col-filter-item col-filter-item--all"
                                    class:checked={allSelected}
                                    onclick={() => allSelected ? clearColumnFilter(col) : selectAllFilter(col, visibleVals)}
                                  >
                                    <span class="col-filter-check" class:checked={allSelected}>
                                      {#if allSelected}
                                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                          <path d="M1 4l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                      {/if}
                                    </span>
                                    <span class="col-filter-val">{allSelected ? 'Deselect all' : 'Select all'}</span>
                                    <span class="col-filter-count">{visibleVals.length}</span>
                                  </button>
                                </div>
                                <div class="col-filter-list">
                                {#each visibleVals as val}
                                  {@const checked = colFilter?.has(val) ?? false}
                                  <button
                                    class="col-filter-item"
                                    class:checked
                                    class:empty-val={val === '—' || val === 'Empty'}
                                    onclick={() => toggleFilterValue(col, val)}
                                  >
                                    <span class="col-filter-check" class:checked>
                                      {#if checked}
                                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                          <path d="M1 4l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                      {/if}
                                    </span>
                                    <span class="col-filter-val">{fmtDateKey(val)}</span>
                                    <span class="col-filter-count">
                                      {colInfo.counts[val] ?? 0}
                                    </span>
                                  </button>
                                {/each}
                                </div>
                                {/if}
                              </div>
                            {/if}
                          </div>
                        {/if}
                      </div>
                    </th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each sortedIssues as issue}
                  <tr>
                    <td class="cell-key">
                      {#if chartStore.data?.jira_base_url}
                        <a
                          href="{chartStore.data.jira_base_url}/browse/{issue.key}"
                          target="_blank"
                          rel="noreferrer"
                        >{issue.key}</a>
                      {:else}
                        {issue.key}
                      {/if}
                    </td>
                    <td class="cell-summary" title={issue.summary}>{issue.summary}</td>
                    {#each tableDisplayFields as col}
                      <td>{fmtCell(col, resolveIssueField(issue, col))}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {/if}
        {:else}
          <div class="cv-empty-table">Table results will appear here</div>
        {/if}
      </div>

    </div>

  {:else}
    <!-- Empty state -->
    <div class="cv-empty">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity=".2">
        <rect x="4"  y="22" width="8"  height="14" rx="2" fill="#818cf8"/>
        <rect x="16" y="12" width="8"  height="24" rx="2" fill="#818cf8"/>
        <rect x="28" y="4"  width="8"  height="32" rx="2" fill="#818cf8"/>
      </svg>
      <p class="cv-empty-title">No results yet</p>
      <p class="cv-empty-hint">Ask a question in the AI chat — charts and table will appear here automatically.</p>
    </div>
  {/if}
</div>

<style>
  /* ── Shell ───────────────────────────────────────────────────────────────── */
  .chart-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 10px 14px 10px;
    box-sizing: border-box;
    gap: 8px;
    overflow: hidden;
  }

  .chart-view.dragging { user-select: none; cursor: row-resize; }
  .chart-view.dragging:has(.cv-split--h) { cursor: col-resize; }

  /* ── Header ──────────────────────────────────────────────────────────────── */
  .cv-header {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-width: 0;
  }

  .cv-query-text {
    font-size: 11.5px;
    color: #94a3b8;
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .cv-count {
    font-size: 10px;
    font-weight: 700;
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    padding: 2px 7px;
    border-radius: 999px;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .cv-no-results {
    font-size: 10px;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 4px;
    padding: 1px 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .cv-layout-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid #1e293b;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #94a3b8;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .cv-layout-btn:hover {
    color: #94a3b8;
    border-color: #334155;
    background: rgba(255,255,255,0.03);
  }

  /* ── Split container ─────────────────────────────────────────────────────── */
  .cv-split {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;  /* vertical: stacked */
    gap: 0;
    overflow: hidden;
  }

  .cv-split--h {
    flex-direction: row;     /* horizontal: side-by-side */
  }

  /* ── Panes ───────────────────────────────────────────────────────────────── */
  .cv-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  /* chart pane uses explicit size from splitPct; table pane takes the rest */
  .cv-pane--chart { flex-shrink: 0; }
  .cv-pane--table { flex: 1; }

  /* ── Tabs row ────────────────────────────────────────────────────────────── */
  .cv-tabs-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    border-bottom: 1px solid #1e293b;
    padding-bottom: 6px;
  }

  /* ── Tabs ────────────────────────────────────────────────────────────────── */
  .cv-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    flex: 1;
  }

  .cv-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-size: 10.5px;
    font-weight: 500;
    color: #94a3b8;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }
  .cv-tab:hover { color: #cbd5e1; background: rgba(255,255,255,0.04); }
  .cv-tab.active {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    border-color: rgba(129, 140, 248, 0.25);
  }

  /* AI dynamic chart tab */
  .cv-tab.ai {
    background: linear-gradient(135deg, rgba(129,140,248,0.12) 0%, rgba(167,139,250,0.08) 100%);
    border-color: rgba(139,92,246,0.3);
    color: #a78bfa;
  }
  .cv-tab.ai:hover {
    background: linear-gradient(135deg, rgba(129,140,248,0.2) 0%, rgba(167,139,250,0.14) 100%);
    border-color: rgba(167,139,250,0.45);
    color: #c4b5fd;
  }
  .cv-tab.ai.active {
    background: linear-gradient(135deg, rgba(129,140,248,0.28) 0%, rgba(167,139,250,0.2) 100%);
    border-color: rgba(167,139,250,0.6);
    color: #ddd6fe;
    box-shadow: 0 0 10px rgba(139,92,246,0.25), inset 0 0 8px rgba(129,140,248,0.08);
  }
  .ai-spark { flex-shrink: 0; }

  /* ── React-to-filters toggle ─────────────────────────────────────────────── */
  .cv-react-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 5px;
    border: 1px solid #1e293b;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #94a3b8;
    white-space: nowrap;
    flex-shrink: 0;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }

  .cv-react-btn:hover {
    color: #cbd5e1;
    border-color: #334155;
  }

  .cv-react-btn.active {
    color: #818cf8;
    border-color: rgba(129, 140, 248, 0.4);
    background: rgba(129, 140, 248, 0.08);
  }

  .cv-react-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #818cf8;
    animation: pulse-dot 1.5s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  /* ── Chart area ──────────────────────────────────────────────────────────── */
  .cv-chart-area {
    flex: 1;
    min-height: 0;
    cursor: pointer;
  }

  /* ── Divider ─────────────────────────────────────────────────────────────── */
  .cv-divider {
    all: unset;
    flex-shrink: 0;
    height: 6px;
    background: transparent;
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    position: relative;
  }

  .cv-divider:hover,
  .cv-divider:active {
    background: rgba(129, 140, 248, 0.08);
  }

  .cv-divider::before {
    content: '';
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 1px;
    background: #1e293b;
  }

  .cv-divider-dots {
    width: 28px;
    height: 3px;
    border-radius: 999px;
    background: #4e6884;
    position: relative;
    z-index: 1;
    transition: background 0.15s;
  }

  .cv-divider:hover .cv-divider-dots { background: #818cf8; }

  /* horizontal divider */
  .cv-divider--h {
    height: auto;
    width: 6px;
    cursor: col-resize;
    flex-direction: column;
  }

  .cv-divider--h::before {
    top: 0; bottom: 0; left: 50%; right: auto;
    transform: translateX(-50%);
    width: 1px;
    height: auto;
  }

  .cv-divider--h .cv-divider-dots {
    width: 3px;
    height: 28px;
  }

  /* ── Column filters ──────────────────────────────────────────────────────── */
  .cv-clear-all {
    margin-left: auto;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-size: 10px;
    color: #7a9ab8;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .cv-clear-all:hover { color: #f87171; }

  /* th sort */
  .th-sortable { cursor: pointer; user-select: none; }
  .th-sortable:hover { color: #94a3b8 !important; }
  .th-sorted { color: #818cf8 !important; background: rgba(129,140,248,0.06) !important; }

  .sort-icon {
    font-size: 9px;
    color: #6b8aaa;
    flex-shrink: 0;
    transition: color 0.12s;
    line-height: 1;
  }
  .th-sorted .sort-icon { color: #818cf8; }
  .th-sortable:hover .sort-icon { color: #475569; }

  /* th layout */
  .th-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .th-label { flex: 1; }
  .th-filtered { color: #818cf8 !important; background: rgba(129,140,248,0.06) !important; }

  /* filter trigger button inside th */
  .cv-col-filter { position: relative; }

  .col-filter-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b8aaa;
    padding: 0;
    transition: color 0.12s, background 0.12s;
    flex-shrink: 0;
  }
  .col-filter-btn:hover { color: #94a3b8; background: rgba(255,255,255,0.06); }
  .col-filter-btn.active { color: #818cf8; }

  .col-filter-badge {
    font-size: 9px;
    font-weight: 700;
    color: #818cf8;
    line-height: 1;
  }

  /* dropdown menu */
  .col-filter-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    min-width: 160px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 7px;
    box-shadow: 0 10px 30px rgba(0,0,0,.6);
    z-index: 200;
    overflow: hidden;
  }

  .col-filter-select-all {
    border-bottom: 1px solid #1e293b;
  }
  .col-filter-item--all { color: #94a3b8; font-style: italic; }
  .col-filter-item--all.checked { color: #818cf8; font-style: normal; }

  .col-filter-list {
    max-height: 200px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e293b transparent;
  }

  .col-filter-search {
    padding: 5px 8px;
    border-bottom: 1px solid #1e293b;
  }

  .col-filter-input {
    width: 100%;
    background: #070f1c;
    border: 1px solid #1e293b;
    border-radius: 4px;
    color: #94a3b8;
    font-size: 11px;
    padding: 4px 7px;
    outline: none;
    box-sizing: border-box;
  }

  .col-filter-input::placeholder { color: #6b8aaa; }
  .col-filter-input:focus { border-color: #334155; }

  .col-filter-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #7a9ab8;
    border-bottom: 1px solid #1e293b;
  }

  .col-filter-reset {
    border: none;
    background: none;
    cursor: pointer;
    font-size: 9.5px;
    color: #475569;
    padding: 0;
    transition: color 0.12s;
  }
  .col-filter-reset:hover { color: #f87171; }

  .col-filter-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 11px;
    color: #94a3b8;
    text-align: left;
    transition: background 0.1s, color 0.1s;
  }
  .col-filter-item:hover { background: rgba(255,255,255,0.04); color: #94a3b8; }
  .col-filter-item.checked { color: #e2e8f0; }

  .col-filter-check {
    width: 13px;
    height: 13px;
    border-radius: 3px;
    border: 1px solid #1e293b;
    background: #070f1c;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #818cf8;
    transition: border-color 0.12s, background 0.12s;
  }
  .col-filter-check.checked {
    border-color: rgba(129,140,248,0.5);
    background: rgba(129,140,248,0.15);
  }

  .col-filter-val { flex: 1; }
  .col-filter-item.empty-val .col-filter-val { color: #6b8aaa; font-style: italic; }

  .col-filter-count {
    font-size: 9px;
    color: #6b8aaa;
    font-weight: 600;
  }

  /* ── View mode toggle ────────────────────────────────────────────────────── */
  .cv-view-toggle {
    display: flex;
    gap: 2px;
    margin-left: auto;
    background: rgba(255,255,255,0.03);
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 2px;
    flex-shrink: 0;
  }

  .cv-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 4px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #94a3b8;
    transition: color 0.12s, background 0.12s;
  }
  .cv-view-btn:hover { color: #cbd5e1; }
  .cv-view-btn.active {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.15);
  }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .cv-table-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 2px 5px;
    flex-shrink: 0;
    border-top: none;
    min-width: 0;
  }

  .cv-table-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #7a9ab8;
    flex-shrink: 0;
  }

  .cv-jql {
    font-family: 'Consolas', monospace;
    font-size: 9.5px;
    color: #6b8aaa;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .cv-table-count {
    font-size: 10px;
    font-weight: 700;
    color: #818cf8;
    flex-shrink: 0;
  }
  .cv-table-count--link {
    text-decoration: none;
    cursor: pointer;
  }
  .cv-table-count--link:hover {
    text-decoration: underline;
    color: #a5b4fc;
  }

  .cv-table-wrap {
    flex: 1;
    overflow: auto;
    border: 1px solid #1e293b;
    border-radius: 5px;
    scrollbar-width: thin;
    scrollbar-color: #1e293b transparent;
  }

  .cv-table {
    border-collapse: collapse;
    font-size: 10px;
    width: 100%;
    white-space: nowrap;
  }

  .cv-table thead tr { background: #0f172a; }

  .cv-table th {
    padding: 5px 10px;
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #7a9ab8;
    border-bottom: 1px solid #1e293b;
    position: sticky;
    top: 0;
    background: #0f172a;
  }

  .cv-table td {
    padding: 5px 10px;
    color: #94a3b8;
    border-bottom: 1px solid #0f172a;
    vertical-align: middle;
  }

  .cv-table tbody tr:last-child td { border-bottom: none; }
  .cv-table tbody tr:hover td { background: rgba(255,255,255,0.02); }

  .cell-key a {
    color: #818cf8;
    text-decoration: none;
    font-weight: 700;
    font-family: 'Consolas', monospace;
  }
  .cell-key a:hover { text-decoration: underline; }

  .cell-summary {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #cbd5e1;
  }

  /* ── Mini empty states ───────────────────────────────────────────────────── */
  .cv-empty-chart,
  .cv-empty-table {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #7a9ab8;
  }

  /* ── Full empty state ────────────────────────────────────────────────────── */
  .cv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    padding: 32px;
  }

  .cv-empty-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
  }

  .cv-empty-hint {
    margin: 0;
    font-size: 11.5px;
    color: #7a9ab8;
    line-height: 1.6;
    max-width: 260px;
  }

  /* ── Axis selectors ──────────────────────────────────────────────────────── */
  .cv-axis-sel { position: relative; }

  .cv-axis-menu {
    top: calc(100% + 4px);
    left: 0;
    transform: none;
    min-width: 180px;
  }

  .cv-agg-spinner {
    font-size: 13px;
    color: #818cf8;
    flex-shrink: 0;
    animation: spin 0.7s linear infinite;
    display: inline-block;
    line-height: 1;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Y-axis group badge ──────────────────────────────────────────────────── */
  .cv-group-badge {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #7a9ab8;
    background: rgba(129, 140, 248, 0.08);
    border: 1px solid rgba(129, 140, 248, 0.15);
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
  }
</style>
