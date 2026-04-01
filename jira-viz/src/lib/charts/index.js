// charts/index.js
// Public API for the chart module — import from here, not internal files.
//
// Quick start:
//   import { ChartPanel, ChartRenderer, features } from '$lib/charts/index.js';
//
// Disable the entire module at runtime:
//   import { features } from '$lib/charts/index.js';
//   features.charts.enabled = false;

export { default as ChartPanel }       from './ChartPanel.svelte';
export { default as AIHierarchyView }  from './AIHierarchyView.svelte';
export { default as ChartRenderer } from './ChartRenderer.svelte';
export { default as ChartView }     from './ChartView.svelte';
export { chartStore }               from './chartStore.svelte.js';
export { buildAllSpecs, buildBar, buildPie, buildTrend, buildBurndown, fromExplicitSpec, autoSpec } from './specBuilder.js';
export { PALETTE, linearGradient, paletteGradient, paletteColor, BASE_OPTION } from './theme.js';
// Re-export features so callers only need one import
export { features } from '../features.svelte.js';
