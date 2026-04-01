<script>
  /**
   * ChartRenderer.svelte
   * Raw ECharts wrapper — accepts an `option` prop and renders a canvas chart.
   * Handles: init, resize (ResizeObserver), option reactivity, dispose.
   * No data logic here — keep this dumb.
   */
  import { onMount, onDestroy } from 'svelte';
  import * as echarts from 'echarts/core';
  import { BarChart, PieChart, LineChart } from 'echarts/charts';
  import {
    GridComponent,
    TooltipComponent,
    TitleComponent,
    LegendComponent,
  } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';

  echarts.use([
    BarChart, PieChart, LineChart,
    GridComponent, TooltipComponent, TitleComponent, LegendComponent,
    CanvasRenderer,
  ]);

  let { option = {}, height = '220px' } = $props();

  let container;
  let chart;

  onMount(() => {
    chart = echarts.init(container, null, { renderer: 'canvas' });
    chart.setOption(option);

    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart?.dispose();
      chart = null;
    };
  });

  // Re-apply option whenever it changes
  $effect(() => {
    if (chart && option) {
      chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
  });
</script>

<div bind:this={container} style="width:100%;height:{height};"></div>
