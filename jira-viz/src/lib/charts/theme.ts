// charts/theme.ts
// Gradient palette + shared ECharts base option.
// All colours match the app dark palette.

import type { EChartsOption } from 'echarts';

/** Two-stop gradient pairs [light, dark]. */
export const PALETTE: [string, string][] = [
  ['#818cf8', '#4f46e5'],
  ['#34d399', '#059669'],
  ['#2dd4bf', '#0d9488'],
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

// -- Semantic colour gradient helpers ----------------------------------------

/** Shift a hex colour toward white (factor > 0) or toward black (factor < 0). */
function hexShift(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const adj = (c: number) => factor > 0
    ? Math.min(255, Math.round(c + (255 - c) * factor))
    : Math.round(c * (1 + factor));
  const [nr, ng, nb] = [adj(r), adj(g), adj(b)];
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * 3-stop vertical LinearGradient from a semantic hex colour.
 * Luminous cap → full colour → deep base for a premium bar look.
 */
export function semanticBarGradient(color: string, vertical = true): LinearGradient {
  return {
    type: 'linear',
    x: 0, y: 0,
    x2: vertical ? 0 : 1,
    y2: vertical ? 1 : 0,
    colorStops: [
      { offset: 0,    color: hexShift(color,  0.36) },  // bright luminous cap
      { offset: 0.42, color: color                  },  // full semantic colour
      { offset: 1,    color: hexShift(color, -0.30) },  // rich dark base
    ],
  };
}

/**
 * Radial gradient from a semantic hex colour for pie slices.
 * Deep glowing centre → full colour mid-ring → bright luminous edge.
 */
export function semanticPieGradient(color: string): object {
  return {
    type: 'radial', x: 0.5, y: 0.5, r: 0.85,
    colorStops: [
      { offset: 0,   color: hexShift(color, -0.18) + 'cc' },  // deeper rich centre
      { offset: 0.55, color: color + 'ee'                 },  // full colour mid-ring
      { offset: 1,   color: hexShift(color,  0.28)        },  // bright luminous edge
    ],
  };
}

/** Base ECharts option merged into every chart. Override per-chart as needed. */
export const BASE_OPTION: EChartsOption = {
  backgroundColor: 'transparent',
  animation: true,
  animationDuration: 520,
  animationEasing: 'cubicOut',
  animationDelay: (idx: number) => idx * 35,
  animationDurationUpdate: 400,
  animationEasingUpdate: 'cubicInOut',
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
