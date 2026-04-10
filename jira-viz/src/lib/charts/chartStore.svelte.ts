// charts/chartStore.svelte.ts
// Shared reactive store - bridge between ChatPanel (writer) and ChartView (reader).

/** Explicit chart spec returned by the server. */
export interface ChartSpec {
  type: string;
  title?: string;
  x_field: string;
  y_field: string;
  color_field?: string | null;
}

/** Raw server response shape for JQL queries. */
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

  setFromResponse(responseData: QueryResponse, queryText = ''): void {
    this.data  = responseData;
    this.query = queryText;

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

  clear(): void {
    this.data      = null;
    this.issues    = [];
    this.chartSpec = null;
    this.query     = '';
    this.noResults = false;
  }

  get hasData(): boolean {
    return this.issues.length > 0;
  }
}

export const chartStore = new ChartStore();
