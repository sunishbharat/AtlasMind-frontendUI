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
  jql?: string;
  issues?: ApiIssue[];
  total?: number;
  shown?: number;
  answer?: string;
  chartSpec?: ChartSpec;
  display_fields?: string[];
}

/** A single Jira issue as returned by the API (fields vary per query). */
export type ApiIssue = Record<string, unknown>;

class ChartStore {
  /** Full server response data - null until first AI query. */
  data = $state<QueryResponse | null>(null);

  /** Issues array from the latest query. */
  issues = $state<ApiIssue[]>([]);

  /** Optional explicit chart spec from the server. */
  chartSpec = $state<ChartSpec | null>(null);

  /** The query text that produced this result. */
  query = $state<string>('');

  setFromResponse(responseData: QueryResponse, queryText = ''): void {
    this.data      = responseData;
    this.issues    = responseData?.issues ?? [];
    // backend sends chart_spec (snake_case) — handle both casings
    this.chartSpec = (responseData as Record<string, unknown>)?.chart_spec as ChartSpec ?? responseData?.chartSpec ?? null;
    this.query     = queryText;
  }

  clear(): void {
    this.data      = null;
    this.issues    = [];
    this.chartSpec = null;
    this.query     = '';
  }

  get hasData(): boolean {
    return this.issues.length > 0 || this.chartSpec != null;
  }
}

export const chartStore = new ChartStore();
