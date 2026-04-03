// charts/index.ts
// Public API for the chart module - import from here, not from internal files.

export { default as ChartPanel }      from './ChartPanel.svelte';
export { default as AIHierarchyView } from './AIHierarchyView.svelte';
export { default as ChartRenderer }   from './ChartRenderer.svelte';
export { default as ChartView }       from './ChartView.svelte';
export { chartStore }                 from './chartStore.svelte.js';
export { buildAllSpecs, buildBar, buildPie, buildTrend, buildBurndown, fromExplicitSpec, autoSpec } from './specBuilder.js';
export { PALETTE, linearGradient, paletteGradient, paletteColor, BASE_OPTION } from './theme.js';
export { features } from '../features.svelte.js';
