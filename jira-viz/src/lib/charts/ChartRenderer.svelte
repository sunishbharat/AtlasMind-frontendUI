<script lang="ts">
  // Raw ECharts wrapper - accepts an `option` prop and renders a canvas chart.
  // Handles: init, resize (ResizeObserver), option reactivity, dispose.
  import { onMount } from 'svelte';
  import type { EChartsOption } from 'echarts';
  import type { EChartsType } from 'echarts/core';
  import * as echarts from 'echarts/core';
  import { BarChart, PieChart, LineChart } from 'echarts/charts';
  import { GridComponent, TooltipComponent, TitleComponent, LegendComponent } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';

  echarts.use([BarChart, PieChart, LineChart, GridComponent, TooltipComponent, TitleComponent, LegendComponent, CanvasRenderer]);

  let { option = {} as EChartsOption, height = '220px' }: { option?: EChartsOption; height?: string } = $props();

  let container: HTMLDivElement;
  let chart: EChartsType | undefined;

  onMount(() => {
    chart = echarts.init(container, null, { renderer: 'canvas' });
    chart.setOption(option);

    const ro = new ResizeObserver(() => chart?.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart?.dispose();
      chart = undefined;
    };
  });

  $effect(() => {
    if (chart && option) {
      chart.setOption(option, { notMerge: true, lazyUpdate: false });
    }
  });
</script>

<div bind:this={container} style="width:100%;height:{height};"></div>
