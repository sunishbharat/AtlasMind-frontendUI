// features.svelte.js
// Central feature-flag store. Import once, use anywhere.
// Flags persist to localStorage so they survive page reloads.
//
// Usage:
//   import { features } from '$lib/features.svelte.js';
//   features.charts.enabled = false;   // disable at runtime
//   features.toggle('charts');         // flip master switch + persist

const STORAGE_KEY = 'atlasmind:features';

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

class FeaturesStore {
  charts = $state({
    enabled: true,        // master switch — hides all chart UI when false
    autoDerive: true,     // auto-build charts from table query results
    defaultType: 'bar',   // initial chart tab: 'bar' | 'pie'
    animation: true,      // ECharts entrance animation
    maxItems: 20,         // max categories rendered (truncates long lists)
  });

  // Add future module flags here, e.g.:
  // timeline = $state({ enabled: false });

  constructor() {
    const saved = loadSaved();
    if (saved.charts) Object.assign(this.charts, saved.charts);
  }

  /** Flip a module's master switch and persist. */
  toggle(module) {
    if (module in this && 'enabled' in this[module]) {
      this[module].enabled = !this[module].enabled;
      this.persist();
    }
  }

  /** Call after any manual flag mutation to write to localStorage. */
  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ charts: this.charts }));
  }
}

export const features = new FeaturesStore();
