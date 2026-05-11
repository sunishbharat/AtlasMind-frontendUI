<script lang="ts">
  import { onMount } from 'svelte';
  import LandingPage from './lib/LandingPage.svelte';
  import JiraViz from './lib/JiraViz.svelte';

  let currentRoute = $state('/');

  onMount(() => {
    // Check initial hash
    currentRoute = window.location.hash.replace('#', '') || '/';

    // Listen for hash changes
    window.addEventListener('hashchange', () => {
      currentRoute = window.location.hash.replace('#', '') || '/';
    });
  });

  const isDashboard = $derived(currentRoute === '/dashboard' || currentRoute.startsWith('/dashboard'));
</script>

{#if isDashboard}
  <JiraViz />
{:else}
  <LandingPage />
{/if}
