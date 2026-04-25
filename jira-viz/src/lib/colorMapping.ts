// colorMapping.ts
// Universal field→value→color lookup. The single source of truth for all
// semantic label colours in the app. Add new field sections here — no other
// file should hardcode label colours.
//
// Public API:
//   resolveColor(field, value)    → ColorDef | null   (field-aware, preferred)
//   resolveColorByValue(value)    → ColorDef | null   (value-only fallback)
//   seriesColor(field?, value)    → string  | null   (chart itemStyle.color helper)
//   statusStyle / priorityStyle / issueTypeStyle      (convenience wrappers for badges)

export interface ColorDef { color: string; bg: string }

// -- Field maps (all keys lowercase) ------------------------------------------

const STATUS: Record<string, ColorDef> = {
  'backlog':     { color: '#8993A4', bg: 'rgba(137,147,164,0.15)' },
  'to do':       { color: '#0052CC', bg: 'rgba(0,82,204,0.15)'    },
  'todo':        { color: '#0052CC', bg: 'rgba(0,82,204,0.15)'    },
  'open':        { color: '#0052CC', bg: 'rgba(0,82,204,0.15)'    },
  'ready':       { color: '#00875A', bg: 'rgba(0,135,90,0.15)'    },
  'in progress': { color: '#0747A6', bg: 'rgba(7,71,166,0.15)'    },
  'in review':   { color: '#6554C0', bg: 'rgba(101,84,192,0.15)'  },
  'in testing':  { color: '#FF8B00', bg: 'rgba(255,139,0,0.15)'   },
  'blocked':     { color: '#DE350B', bg: 'rgba(222,53,11,0.15)'   },
  'impediment':  { color: '#FFAB00', bg: 'rgba(255,171,0,0.15)'   },
  'on hold':     { color: '#FF7452', bg: 'rgba(255,116,82,0.15)'  },
  'done':        { color: '#36B37E', bg: 'rgba(54,179,126,0.15)'  },
  'closed':      { color: '#00875A', bg: 'rgba(0,135,90,0.15)'    },
  'resolved':    { color: '#36B37E', bg: 'rgba(54,179,126,0.15)'  },
  "won't fix":   { color: '#97A0AF', bg: 'rgba(151,160,175,0.15)' },
  'wont fix':    { color: '#97A0AF', bg: 'rgba(151,160,175,0.15)' },
  'duplicate':   { color: '#C1C7D0', bg: 'rgba(193,199,208,0.12)' },
  'cancelled':   { color: '#97A0AF', bg: 'rgba(151,160,175,0.15)' },
  'canceled':    { color: '#97A0AF', bg: 'rgba(151,160,175,0.15)' },
};

// Red family → stop everything | Orange/Amber → manageable | Blue → routine | Gray → backlog | Teal → improvement
const PRIORITY: Record<string, ColorDef> = {
  'critical':     { color: '#DE350B', bg: 'rgba(222,53,11,0.15)'   },
  'blocker':      { color: '#BF2600', bg: 'rgba(191,38,0,0.15)'    },
  'major':        { color: '#FF5630', bg: 'rgba(255,86,48,0.15)'   },
  'high':         { color: '#FF7452', bg: 'rgba(255,116,82,0.15)'  },
  'medium':       { color: '#FFAB00', bg: 'rgba(255,171,0,0.15)'   },
  'low':          { color: '#2684FF', bg: 'rgba(38,132,255,0.15)'  },
  'minor':        { color: '#4C9AFF', bg: 'rgba(76,154,255,0.15)'  },
  'trivial':      { color: '#97A0AF', bg: 'rgba(151,160,175,0.15)' },
  'enhancement':  { color: '#00B8D9', bg: 'rgba(0,184,217,0.15)'   },
  'nice to have': { color: '#C1C7D0', bg: 'rgba(193,199,208,0.12)' },
  'lowest':       { color: '#97A0AF', bg: 'rgba(151,160,175,0.15)' },
};

const ISSUE_TYPE: Record<string, ColorDef> = {
  'epic':           { color: '#818cf8', bg: 'rgba(129,140,248,0.12)' },
  'story':          { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  'bug':            { color: '#FF5630', bg: 'rgba(255,86,48,0.12)'   },
  'task':           { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  'sub-task':       { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  'subtask':        { color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)'  },
  'feature':        { color: '#6554C0', bg: 'rgba(101,84,192,0.12)'  },
  'improvement':    { color: '#FFAB00', bg: 'rgba(255,171,0,0.12)'   },
  'new feature':    { color: '#36B37E', bg: 'rgba(54,179,126,0.12)'  },
  'spike':          { color: '#FF7452', bg: 'rgba(255,116,82,0.12)'  },
  'technical task': { color: '#8993A4', bg: 'rgba(137,147,164,0.12)' },
};

// -- Field alias table --------------------------------------------------------
// Maps raw field names (any case/separator) → canonical key in CANONICAL_FIELD_MAP.
// Add entries here when the backend uses a different field name.

const CANONICAL_FIELD_MAP: Record<string, Record<string, ColorDef>> = {
  status:    STATUS,
  priority:  PRIORITY,
  issuetype: ISSUE_TYPE,
};

const FIELD_ALIAS: Record<string, string> = {
  // status
  'status':        'status',
  'issue status':  'status',
  // priority
  'priority':      'priority',
  // issuetype
  'issuetype':     'issuetype',
  'issue type':    'issuetype',
  'issue_type':    'issuetype',
  'type':          'issuetype',
};

function normalizeField(field: string): string {
  return field.toLowerCase().replace(/_/g, ' ').trim();
}

const DEFAULT: ColorDef = { color: '#8993A4', bg: 'rgba(137,147,164,0.15)' };

// -- Public API ---------------------------------------------------------------

/**
 * Field-aware lookup (preferred). Returns the ColorDef if both the field and
 * value are in the map, otherwise null.
 *
 * resolveColor('status',   'Done')   → { color: '#36B37E', bg: '...' }
 * resolveColor('priority', 'High')   → { color: '#FF7452', bg: '...' }
 * resolveColor('assignee', 'Alice')  → null  → caller uses palette fallback
 */
export function resolveColor(field: string, value: string): ColorDef | null {
  const canon = FIELD_ALIAS[normalizeField(field)];
  if (!canon) return null;
  return CANONICAL_FIELD_MAP[canon]?.[value.toLowerCase().trim()] ?? null;
}

/**
 * Value-only fallback — scans all field maps. Use when the field name is
 * unavailable (e.g. a generic series name in a chart response).
 */
export function resolveColorByValue(value: string): ColorDef | null {
  const key = value.toLowerCase().trim();
  for (const map of Object.values(CANONICAL_FIELD_MAP)) {
    if (key in map) return map[key];
  }
  return null;
}

/**
 * Chart helper — returns a hex color string or null.
 * Pass `field` when you know which axis field the series represents so the
 * lookup is unambiguous; omit it to fall back to a cross-map value scan.
 *
 * seriesColor('status',   'Done')  → '#36B37E'
 * seriesColor('priority', 'High')  → '#FF7452'
 * seriesColor(null,       'Alice') → null  → use palette index
 */
export function seriesColor(field: string | null | undefined, value: string): string | null {
  const def = field ? resolveColor(field, value) : resolveColorByValue(value);
  return def?.color ?? null;
}

/**
 * Returns a stable 0-based palette index for any string value.
 * Use this as the fallback when no semantic mapping is found, so the same
 * value (e.g. "Alice") always gets the same palette slot across different charts.
 *   paletteGradient(stableColorIndex('Alice'))  →  consistent color
 */
export function stableColorIndex(value: string): number {
  const hash = [...value].reduce((acc, c) => Math.imul(31, acc) + c.charCodeAt(0) | 0, 0);
  return Math.abs(hash) % 7; // 7 = theme.ts PALETTE.length
}

// -- Convenience wrappers for badge/pill rendering ----------------------------

export type { ColorDef as StatusStyle };

export function statusStyle   (s = ''): ColorDef { return resolveColor('status',    s) ?? DEFAULT; }
export function priorityStyle (p = ''): ColorDef { return resolveColor('priority',  p) ?? DEFAULT; }
export function issueTypeStyle(t = ''): ColorDef { return resolveColor('issuetype', t) ?? DEFAULT; }
