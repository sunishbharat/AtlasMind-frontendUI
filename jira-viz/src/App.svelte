<script lang="ts">
  import JiraViz from './lib/JiraViz.svelte';
  import HomeDashboard from './lib/dashboard/HomeDashboard.svelte';

  let view = $state<'dashboard' | 'viz'>('dashboard');
</script>

{#if view === 'dashboard'}
  <HomeDashboard onAskAI={() => (view = 'viz')} />
{:else}
  <JiraViz />
  <button class="back-btn" onclick={() => (view = 'dashboard')}>
    ← Dashboard
  </button>
{/if}

<style>
  .back-btn {
    position: fixed;
    bottom: 18px;
    left: 18px;
    z-index: 9999;
    background: rgba(9, 14, 25, 0.88);
    border: 0.5px solid rgba(255, 255, 255, 0.14);
    color: #94a3b8;
    font-size: 11px;
    padding: 5px 11px;
    border-radius: 6px;
    cursor: pointer;
    backdrop-filter: blur(10px);
    font-family: 'Inter', system-ui, sans-serif;
    letter-spacing: 0.02em;
    transition: color 0.12s, background 0.12s;
  }
  .back-btn:hover {
    color: #e2e8f0;
    background: rgba(20, 30, 50, 0.95);
  }
</style>
