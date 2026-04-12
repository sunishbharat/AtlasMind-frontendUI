<script lang="ts">
  let { size = 18 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 18 18" fill="none">
  <!-- Globe outline -->
  <circle cx="9" cy="9" r="7" stroke="#818cf8" stroke-width="1.4" fill="rgba(129,140,248,0.08)"/>
  <!-- Equator -->
  <line x1="2" y1="9" x2="16" y2="9" stroke="#818cf8" stroke-width="0.9" opacity="0.5"/>
  <!-- Upper latitude -->
  <line x1="3" y1="5.5" x2="15" y2="5.5" stroke="#818cf8" stroke-width="0.9" opacity="0.35"/>
  <!-- Lower latitude -->
  <line x1="3" y1="12.5" x2="15" y2="12.5" stroke="#818cf8" stroke-width="0.9" opacity="0.35"/>
  <!-- Prime meridian -->
  <line x1="9" y1="2" x2="9" y2="16" stroke="#818cf8" stroke-width="0.9" opacity="0.5"/>
  <!-- Left longitude arc -->
  <path d="M 9 2 A 3.5 7 0 0 0 9 16" stroke="#818cf8" stroke-width="0.9" opacity="0.45" fill="none"/>
  <!-- Right longitude arc -->
  <path d="M 9 2 A 3.5 7 0 0 1 9 16" stroke="#818cf8" stroke-width="0.9" opacity="0.45" fill="none"/>
</svg>
