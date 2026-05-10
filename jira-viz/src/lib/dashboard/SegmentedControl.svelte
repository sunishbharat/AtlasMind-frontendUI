<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    options: Option[];
    value: string;
    onChange: (val: string) => void;
  }

  let { options, value, onChange }: Props = $props();
</script>

<div class="segmented-control">
  {#each options as opt, i}
    <button
      class="segment"
      class:active={value === opt.value}
      onclick={() => onChange(opt.value)}
      type="button"
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .segmented-control {
    display: inline-flex;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    overflow: hidden;
    gap: 0;
  }

  .segment {
    background: transparent;
    border: none;
    color: #8b949e;
    font-size: clamp(10px, 1.1vw, 12px);
    padding: 4px 10px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .segment:not(:last-child) {
    border-right: 1px solid #30363d;
  }

  .segment:hover {
    color: #e6edf3;
    background: #1e293b;
  }

  .segment.active {
    background: #30363d;
    color: #e6edf3;
    font-weight: 500;
  }
</style>