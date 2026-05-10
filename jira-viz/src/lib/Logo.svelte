<script lang="ts">
  interface Props {
    variant?: "pill" | "full";
    size?: number;
  }

  let { variant = "pill", size }: Props = $props();

  const isPill = variant === "pill";
  const iconSize = size ?? (isPill ? 20 : 48);
</script>

{#if isPill}
  <!-- Pill variant: compact mark + wordmark for navbar -->
  <div class="logo-pill">
    <svg
      class="logo-mark"
      width={iconSize}
      height={iconSize}
      viewBox="0 0 44 44"
      fill="none"
    >
      <!-- Outer circle -->
      <circle cx="22" cy="22" r="17" stroke="#4B6EF5" stroke-width="1.2" fill="none" />
      <!-- Latitude ellipse -->
      <ellipse cx="22" cy="22" rx="17" ry="7" stroke="#4B6EF5" stroke-width="0.8" fill="none" opacity="0.6" />
      <!-- Meridian ellipse -->
      <ellipse cx="22" cy="22" rx="7" ry="17" stroke="#4B6EF5" stroke-width="0.8" fill="none" opacity="0.6" />
      <!-- Dot at top of globe -->
      <circle cx="22" cy="10" r="2.5" fill="#7C9FFF" />
      <!-- Ray line -->
      <line x1="22" y1="10" x2="34" y2="5" stroke="#7C9FFF" stroke-width="1" stroke-linecap="round" opacity="0.7" />
      <!-- Small dot at ray end -->
      <circle cx="35" cy="4.5" r="1.5" fill="#A5BFFF" />
    </svg>
    <span class="logo-wordmark"><span class="atlas">Atlas</span><span class="mind">Mind</span></span>
  </div>
{:else}
  <!-- Full lockup: larger mark + serif wordmark for landing page -->
  <div class="logo-full">
    <svg
      class="logo-mark-large"
      width={iconSize}
      height={iconSize}
      viewBox="0 0 44 44"
      fill="none"
    >
      <!-- Outer circle -->
      <circle cx="22" cy="22" r="17" stroke="#4B6EF5" stroke-width="1.2" fill="none" />
      <!-- Latitude ellipse -->
      <ellipse cx="22" cy="22" rx="17" ry="7" stroke="#4B6EF5" stroke-width="0.8" fill="none" opacity="0.6" />
      <!-- Meridian ellipse -->
      <ellipse cx="22" cy="22" rx="7" ry="17" stroke="#4B6EF5" stroke-width="0.8" fill="none" opacity="0.6" />
      <!-- Dot at top of globe -->
      <circle cx="22" cy="10" r="2.5" fill="#7C9FFF" />
      <!-- Ray line -->
      <line x1="22" y1="10" x2="34" y2="5" stroke="#7C9FFF" stroke-width="1" stroke-linecap="round" opacity="0.7" />
      <!-- Small dot at ray end -->
      <circle cx="35" cy="4.5" r="1.5" fill="#A5BFFF" />
    </svg>
    <div class="logo-text">
      <span class="logo-name">
        <span class="atlas">Atlas</span><span class="mind">Mind</span>
      </span>
      <span class="logo-tagline">INSIGHT ENGINE</span>
    </div>
  </div>
{/if}

<style>
  .logo-pill {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-mark {
    flex-shrink: 0;
  }

  .logo-wordmark {
    font-family: "Georgia", serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .logo-wordmark .atlas {
    color: #ffffff;
  }
  .logo-wordmark .mind {
    color: #4B6EF5;
  }

  .logo-full {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-mark-large {
    flex-shrink: 0;
  }

  .logo-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .logo-name {
    font-family: "Georgia", serif;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.3px;
    line-height: 1;
  }

  .atlas {
    color: #ffffff;
  }

  .mind {
    color: #4B6EF5;
  }

  .logo-tagline {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 9px;
    color: #6B7280;
    letter-spacing: 0.12em;
  }
</style>