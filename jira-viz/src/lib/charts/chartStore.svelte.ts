// charts/chartStore.svelte.ts
// Shared reactive store - bridge between ChatPanel (writer) and ChartView (reader).

/** Pre-aggregated chart data returned by /api/aggregate. */
export interface AggregateResponse {
  chart_type: string;
  title: string;
  x_axis: string[];
  series: { name: string; data: (number | null)[]; chart_type: string; stack: string | null }[];
  pie_data: { name: string; value: number }[] | null;
  scatter_data: { name: string; x: number; y: number; group: string }[] | null;
  total_issues: number;
  fields_resolved: Record<string, string>;
  warnings: string[];
  field_counts: Record<string, Record<string, number>> | null;
  filtered_count: number | null;
}

/** Explicit chart spec returned by the server. */
export interface ChartSpec {
  type: string;
  title?: string;
  x_field: string;
  y_field: string;
  color_field?: string | null;
}

/**
 * Server-side metadata attached to every response.
 * All fields are optional - new fields are added by the backend gradually.
 * Never send this back in a request body (read-only).
 */
export interface ServerMeta {
  model_name?: string | null;
  llm_timeout?: number | null;
  // future fields added here without breaking existing clients
}

/** Raw server response shape. Present on both "jql" and "general" routes. */
export interface QueryResponse {
  type: 'jql' | 'general';
  profile?: string;
  jira_base_url?: string;
  jql?: string;
  total?: number;
  shown?: number;
  examined?: number;
  answer?: string;
  display_fields?: string[];
  issues?: ApiIssue[];
  chart_spec?: ChartSpec;
  chartSpec?: ChartSpec;
  filters?: Record<string, string[]>;
  meta?: ServerMeta | null;
}

/** A single Jira issue as returned by the API (fields vary per query). */
export type ApiIssue = Record<string, unknown>;

class ChartStore {
  /** Full server response data - null until first AI query. */
  data = $state<QueryResponse | null>(null);

  /** Issues array from the latest successful query (preserved on zero-result responses). */
  issues = $state<ApiIssue[]>([]);

  /** Optional explicit chart spec from the server. */
  chartSpec = $state<ChartSpec | null>(null);

  /** The query text that produced this result. */
  query = $state<string>('');

  /** True when the last query returned 0 issues — previous chart data is still shown. */
  noResults = $state<boolean>(false);

  /** Metadata from the most recent response. Updated on every response; never cleared. */
  lastMeta = $state<ServerMeta | null>(null);

  /** True when the last /api/meta poll succeeded. */
  backendAlive = $state(false);

  /** Result from the most recent /api/aggregate call (null until first call). */
  aggregated = $state<AggregateResponse | null>(null);

  /** True while an /api/aggregate fetch is in-flight. */
  aggregating = $state(false);

  updateMeta(meta: ServerMeta | null | undefined): void {
    if (meta) this.lastMeta = meta;
    this.backendAlive = true;
  }

  clearMeta(): void {
    this.backendAlive = false;
    // lastMeta intentionally kept — badge stays visible but styled as offline
  }

  pollMeta(): void {
    fetch('/api/meta')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.model_name) {
          console.log('[meta] model:', data.model_name, '| timeout:', data.llm_timeout ?? 'unknown');
          this.updateMeta(data);
        } else {
          this.clearMeta();
        }
      })
      .catch(() => this.clearMeta());
  }

  setFromResponse(responseData: QueryResponse, queryText = ''): void {
    this.data  = responseData;
    this.query = queryText;
    this.updateMeta(responseData.meta);

    // backend sends chart_spec (snake_case) — handle both casings
    const raw       = (responseData as Record<string, unknown>)?.chart_spec ?? responseData?.chartSpec ?? null;
    const newIssues = responseData?.issues ?? [];

    if (newIssues.length > 0) {
      // Fresh results — replace everything
      this.issues    = newIssues;
      this.chartSpec = raw as ChartSpec ?? null;
      this.noResults = false;
    } else {
      // No issues returned — preserve previous issues/chartSpec so charts stay visible
      this.noResults = true;
    }

    console.warn('[chartStore] raw chart_spec:', JSON.stringify(raw, null, 2));
    console.warn('[chartStore] noResults:', this.noResults, '| issues count:', newIssues.length);
  }

  setAggregated(r: AggregateResponse): void { this.aggregated = r; }
  clearAggregated(): void { this.aggregated = null; this.aggregating = false; }

  clear(): void {
    this.data      = null;
    this.issues    = [];
    this.chartSpec = null;
    this.query     = '';
    this.noResults = false;
    this.clearAggregated();
  }

  get hasData(): boolean {
    return this.issues.length > 0;
  }
}

export const chartStore = new ChartStore();
