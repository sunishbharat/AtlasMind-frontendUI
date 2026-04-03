<script lang="ts">
  // Smart chart panel - placed after a table message in ChatPanel.
  // Reads feature flags, builds all available specs from issues,
  // and renders a tab-switcher + ChartRenderer.
  import type { QueryResponse } from './chartStore.svelte.js';
  import type { SpecEntry } from './specBuilder.js';
  import { features } from '../features.svelte.js';
  import { buildAllSpecs, fromExplicitSpec } from './specBuilder.js';
  import ChartRenderer from './ChartRenderer.svelte';

  let { data = {} as QueryResponse }: { data?: QueryResponse } = $props();

  const specs = $derived.by((): Record<string, SpecEntry> => {
    if (!features.charts.enabled || !features.charts.autoDerive) return {};
    if (data.chartSpec) {
      const opt = fromExplicitSpec(data.chartSpec, features.charts.animation);
      return opt ? { explicit: { label: data.chartSpec.title ?? 'Chart', icon: data.chartSpec.type ?? 'bar', option: opt } } : {};
    }
    return buildAllSpecs(data.issues ?? [], features.charts.maxItems, features.charts.animation);
  });

  const tabKeys   = $derived(Object.keys(specs));
  const hasCharts = $derived(tabKeys.length > 0);

  let activeTab = $state<string | null>(null);
  let expanded  = $state(false);

  $effect(() => {
    if (tabKeys.length) {
      const preferred = tabKeys.find(k => k.startsWith(features.charts.defaultType));
      activeTab = preferred ?? tabKeys[0];
      expanded  = true;
    }
  });

  const currentOption = $derived(activeTab ? specs[activeTab]?.option ?? {} : {});
</script>

{#if features.charts.enabled && hasCharts}
  <div class="chart-panel">
    <!-- Toggle header -->
    <button
      class="chart-toggle"
      onclick={() => (expanded = !expanded)}
      title={expanded ? 'Hide chart' : 'Show chart'}
    >
      <svg class="icon-chart" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="1" y="6" width="2" height="5" rx=".5" fill="currentColor"/>
        <rect x="5" y="3" width="2" height="8" rx=".5" fill="currentColor"/>
        <rect x="9" y="1" width="2" height="10" rx=".5" fill="currentColor"/>
      </svg>
      <span>Visualise</span>
      <span class="badge">{tabKeys.length}</span>
      <svg
        class="chevron"
        class:open={expanded}
        width="10" height="10" viewBox="0 0 10 10" fill="none"
      >
        <path d="M2.5 3.5L5 6l2.5-2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>

    {#if expanded}
      <!-- Tab row -->
      <div class="chart-tabs">
        {#each tabKeys as key}
          <button
            class="chart-tab"
            class:active={activeTab === key}
            onclick={() => (activeTab = key)}
          >
            {#if specs[key].icon === 'pie'}
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M4.5 4.5V.5A4 4 0 1 1 .5 4.5z" fill="currentColor" opacity=".7"/>
                <path d="M4.5 4.5H8.5A4 4 0 0 0 4.5.5z" fill="currentColor"/>
              </svg>
            {:else}
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <rect x=".5" y="4" width="2" height="4.5" rx=".4" fill="currentColor"/>
                <rect x="3.5" y="2" width="2" height="6.5" rx=".4" fill="currentColor"/>
                <rect x="6.5" y=".5" width="2" height="8" rx=".4" fill="currentColor"/>
              </svg>
            {/if}
            {specs[key].label}
          </button>
        {/each}
      </div>

      <!-- Chart -->
      <div class="chart-body">
        <ChartRenderer option={currentOption} height="210px" />
      </div>
    {/if}
  </div>
{/if}

<style>
  .chart-panel {
    margin-top: 8px;
    border: 1px solid #1e293b;
    border-radius: 7px;
    overflow: hidden;
    background: #070f1c;
  }

  /* ── Toggle ──────────────────────────────────────────────────────────────── */
  .chart-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 6px 10px;
    background: none;
    border: none;
    cursor: pointer;
    color: #475569;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-align: left;
    transition: color 0.15s, background 0.15s;
  }

  .chart-toggle:hover {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.05);
  }

  .icon-chart { color: #818cf8; flex-shrink: 0; }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 14px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgba(129, 140, 248, 0.12);
    color: #818cf8;
    font-size: 9px;
    font-weight: 700;
  }

  .chevron {
    margin-left: auto;
    color: #334155;
    transition: transform 0.2s;
    flex-shrink: 0;
  }
  .chevron.open { transform: rotate(180deg); }

  /* ── Tabs ────────────────────────────────────────────────────────────────── */
  .chart-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 0 8px 6px;
    border-bottom: 1px solid #1e293b;
  }

  .chart-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    color: #475569;
    transition: color 0.12s, background 0.12s, border-color 0.12s;
  }

  .chart-tab:hover {
    color: #94a3b8;
    background: rgba(255,255,255,0.04);
  }

  .chart-tab.active {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.1);
    border-color: rgba(129, 140, 248, 0.25);
  }

  /* ── Chart body ──────────────────────────────────────────────────────────── */
  .chart-body {
    padding: 4px 4px 4px;
  }
</style>
