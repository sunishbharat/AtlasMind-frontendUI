// dateFormat.ts
// Centralised Jira date formatting.
// Single source of truth for all date display in TableView, ChartView, and filter panels.

/** Display width preset for date formatting. */
export type DateDisplayFormat = 'short' | 'long';

const FORMAT_OPTIONS: Readonly<Record<DateDisplayFormat, Intl.DateTimeFormatOptions>> = {
  /** "Dec 21, '20" — compact for dense table cells */
  short: { year: '2-digit', month: 'short', day: 'numeric' },
  /** "Dec 21, 2020" — full year for filter labels and tooltips */
  long:  { year: 'numeric', month: 'short', day: 'numeric' },
} as const;

/** Matches any ISO-8601 string beginning with YYYY-MM-DD. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** Matches a bare YYYY-MM-DD date key (no time component). */
const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Stateless Jira date formatter.
 * All methods are static — import and call directly, no instantiation needed.
 *
 * Usage:
 *   JiraDateFormatter.isIsoDate(val)        → type guard
 *   JiraDateFormatter.format(val)           → "Dec 21, 2020" | null
 *   JiraDateFormatter.formatFilterKey(key)  → "Dec 21, 2020" (for filter dropdowns)
 *   JiraDateFormatter.toDateKey(val)        → "2020-12-21"   (for grouping/filtering)
 */
export class JiraDateFormatter {
  /** True when val is a string starting with YYYY-MM-DD. */
  static isIsoDate(val: unknown): val is string {
    return typeof val === 'string' && ISO_DATE_RE.test(val);
  }

  /** Parse any ISO-like value to a Date. Returns null for null/unparseable input. */
  static parse(val: unknown): Date | null {
    if (val == null) return null;
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Format an ISO date value for display.
   * Returns null when val is not a parseable ISO date — caller decides the fallback.
   *
   * @param val     - Raw cell value (any type)
   * @param display - 'long' (default, full year) | 'short' (2-digit year)
   *
   * @example format('2020-12-21T12:08:37.000+0000')         → 'Dec 21, 2020'
   * @example format('2020-12-21T12:08:37.000+0000', 'short') → "Dec 21, '20"
   * @example format('not a date')                            → null
   */
  static format(val: unknown, display: DateDisplayFormat = 'long'): string | null {
    if (!JiraDateFormatter.isIsoDate(val)) return null;
    const d = JiraDateFormatter.parse(val);
    if (!d) return null;
    return d.toLocaleDateString('en-US', FORMAT_OPTIONS[display]);
  }

  /**
   * Format a bare YYYY-MM-DD filter key for dropdown labels.
   * Returns the input unchanged when it is not a plain date key.
   *
   * @example formatFilterKey('2020-12-21') → 'Dec 21, 2020'
   * @example formatFilterKey('Empty')      → 'Empty'
   * @example formatFilterKey('Done')       → 'Done'
   */
  static formatFilterKey(key: string): string {
    if (!key || key === 'Empty') return key;
    const m = key.match(DATE_KEY_RE);
    if (!m) return key;
    const [, y, mo, d] = m.map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', FORMAT_OPTIONS.long);
  }

  /**
   * Normalise any ISO date value to a bare YYYY-MM-DD string for grouping and filtering.
   * Returns null when val cannot be parsed as a date.
   *
   * @example toDateKey('2020-12-21T12:08:37.000+0000') → '2020-12-21'
   * @example toDateKey('not a date')                    → null
   */
  static toDateKey(val: unknown): string | null {
    const d = JiraDateFormatter.parse(val);
    return d ? d.toISOString().slice(0, 10) : null;
  }
}
