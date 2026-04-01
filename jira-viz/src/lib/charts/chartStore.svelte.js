// charts/chartStore.svelte.js
// Shared reactive store — bridge between ChatPanel (writer) and ChartView (reader).
// ChatPanel pushes the latest AI query result here.
// ChartView reads from here to render in the main panel.

class ChartStore {
  /** Raw server response data (data.output) — null until first AI query */
  data = $state(null);

  /** Extracted issues array */
  issues = $state([]);

  /** Optional explicit chartSpec from server */
  chartSpec = $state(null);

  /** The query text that produced this result (for display) */
  query = $state('');

  /** Push a new server table response into the store. */
  setFromResponse(responseData, queryText = '') {
    this.data = responseData;
    this.issues = responseData?.issues ?? [];
    this.chartSpec = responseData?.chartSpec ?? null;
    this.query = queryText;
  }

  clear() {
    this.data = null;
    this.issues = [];
    this.chartSpec = null;
    this.query = '';
  }

  get hasData() {
    return this.issues.length > 0 || this.chartSpec != null;
  }
}

export const chartStore = new ChartStore();
