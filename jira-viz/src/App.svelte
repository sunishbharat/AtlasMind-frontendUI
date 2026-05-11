<script lang="ts">
  import { onMount } from 'svelte';
  import LandingPage from './lib/LandingPage.svelte';
  import JiraViz from './lib/JiraViz.svelte';

  let currentPath = $state('/');

  onMount(() => {
    currentPath = window.location.pathname;

    window.addEventListener('popstate', () => {
      currentPath = window.location.pathname;
    });
  });

  const isDashboard = $derived(
    __TESTING__ || currentPath.startsWith('/demo') || currentPath.startsWith('/live')
  );
</script>

{#if isDashboard}
  <JiraViz />
{:else}
  <LandingPage />
{/if}
