<script lang="ts">
  import { buildPie, buildBar } from '../charts/specBuilder.js';
  import ChartRenderer from '../charts/ChartRenderer.svelte';

  // - Types --------------------------------------------------------------------
  type Dimension = 'status' | 'priority' | 'assignee' | 'project' | 'issuetype';

  // - Dropdown options ---------------------------------------------------------
  const PIE_DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'assignee', label: 'Assignee' },
    { value: 'project', label: 'Project' },
    { value: 'issuetype', label: 'Type' },
  ];

  const BAR_X_OPTIONS = [
    { value: 'assignee', label: 'Assignee' },
    { value: 'project', label: 'Project' },
    { value: 'priority', label: 'Priority' },
    { value: 'status', label: 'Status' },
    { value: 'issuetype', label: 'Type' },
  ];

  // - Mock data ----------------------------------------------------------------
  const MOCK_PIE: Record<Dimension, [string, number][]> = {
    status: [['Open', 124], ['In Progress', 89], ['Resolved', 58], ['Closed', 13]],
    priority: [['Critical', 34], ['High', 89], ['Medium', 112], ['Low', 49]],
    assignee: [['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18]],
    project: [['Kafka', 92], ['Zookeeper', 71], ['Hive', 65], ['HDFS', 56]],
    issuetype: [['Story', 78], ['Bug', 45], ['Task', 32], ['Epic', 15]],
  };

  const MOCK_BAR: Record<string, [string, number][]> = {
    assignee: [['Alice', 45], ['Bob', 38], ['Charlie', 29], ['Diana', 22], ['Eve', 18]],
    project: [['Kafka', 92], ['Zookeeper', 71], ['Hive', 65], ['HDFS', 56]],
    priority: [['Critical', 34], ['High', 89], ['Medium', 112], ['Low', 49]],
    status: [['Open', 124], ['In Progress', 89], ['Resolved', 58], ['Closed', 13]],
    issuetype: [['Story', 78], ['Bug', 45], ['Task', 32], ['Epic', 15]],
  };

  // - State --------------------------------------------------------------------
  let pieDimension = $state<Dimension>('status');
  let barXAxis = $state<string>('assignee');

  // - Derived chart options (always use mock data) -------------------------------
  const pieOption = $derived(
    buildPie(MOCK_PIE[pieDimension], pieDimension, 10, true)
  );

  const barOption = $derived(
    buildBar(MOCK_BAR[barXAxis] ?? [], barXAxis, 20, true)
  );
</script>

<div class="dash-simple">
  <main class="charts-row">
    <!-- Pie Chart -->
    <div class="chart-card">
      <div class="card-header">
        <span class="card-title">Pie Chart</span>
        <select bind:value={pieDimension} onmousedown={(e) => e.stopPropagation()}>
          {#each PIE_DIMENSIONS as d}<option value={d.value}>{d.label}</option>{/each}
        </select>
      </div>
      <div class="chart-area">
        <ChartRenderer option={pieOption} height="320px" />
      </div>
    </div>

    <!-- Bar Chart -->
    <div class="chart-card">
      <div class="card-header">
        <span class="card-title">Bar Chart</span>
        <select bind:value={barXAxis} onmousedown={(e) => e.stopPropagation()}>
          {#each BAR_X_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
        </select>
      </div>
      <div class="chart-area">
        <ChartRenderer option={barOption} height="320px" />
      </div>
    </div>
  </main>
</div>

<style>
  .dash-simple {
    min-height: 100vh;
    background: #0d1117;
    color: #e6edf3;
    font-family: 'Inter', system-ui, sans-serif;
    padding: 16px;
  }

  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    height: calc(100vh - 80px);
  }

  .chart-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }

  .card-title {
    font-size: 14px;
    font-weight: 500;
    color: #e6edf3;
  }

  select {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #8b949e;
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  select:hover {
    border-color: #484f58;
  }

  .chart-area {
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 768px) {
    .charts-row {
      grid-template-columns: 1fr;
      height: auto;
    }
  }
</style>