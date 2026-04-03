// charts/theme.ts
// Gradient palette + shared ECharts base option.
// All colours match the app dark palette.

import type { EChartsOption } from 'echarts';

/** Two-stop gradient pairs [light, dark]. */
export const PALETTE: [string, string][] = [
  ['#818cf8', '#4f46e5'],
  ['#34d399', '#059669'],
  ['#f472b6', '#db2777'],
  ['#fbbf24', '#d97706'],
  ['#60a5fa', '#2563eb'],
  ['#a78bfa', '#7c3aed'],
  ['#f87171', '#dc2626'],
];

export interface LinearGradient {
  type: 'linear';
  x: number; y: number;
  x2: number; y2: number;
  colorStops: { offset: number; color: string }[];
}

/** Build an ECharts linearGradient object. */
export function linearGradient(from: string, to: string, vertical = true): LinearGradient {
  return {
    type: 'linear',
    x: 0, y: 0,
    x2: vertical ? 0 : 1,
    y2: vertical ? 1 : 0,
    colorStops: [
      { offset: 0, color: from },
      { offset: 1, color: to  },
    ],
  };
}

/** Pick a gradient by cycling through the palette. */
export function paletteGradient(index: number, vertical = true): LinearGradient {
  const [from, to] = PALETTE[index % PALETTE.length];
  return linearGradient(from, to, vertical);
}

/** Flat (solid) colour at index, for pie slices etc. */
export function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length][0];
}

/** Base ECharts option merged into every chart. Override per-chart as needed. */
export const BASE_OPTION: EChartsOption = {
  backgroundColor: 'transparent',
  animation: true,
  animationDuration: 380,
  animationEasing: 'cubicOut',
  textStyle: {
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#94a3b8',
  },
  tooltip: {
    trigger: 'item',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    textStyle: { color: '#cbd5e1', fontSize: 12 },
    extraCssText: 'border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.5)',
  },
  legend: { show: false },
  grid: {
    left: 8, right: 12, top: 36, bottom: 8,
    containLabel: true,
  },
};
