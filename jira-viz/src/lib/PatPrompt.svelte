<script lang="ts">
  import { authStore } from "./auth.svelte.js";

  let patInput = $state("");

  function save(): void {
    if (!patInput.trim()) return;
    authStore.save(patInput);
    patInput = "";
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") { e.preventDefault(); save(); }
  }
</script>

<div class="pat-prompt">
  <div class="pat-icon">
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="8" width="12" height="8" rx="2" stroke="#818cf8" stroke-width="1.3"/>
      <path d="M6 8V5.5a3 3 0 0 1 6 0V8" stroke="#818cf8" stroke-width="1.3" stroke-linecap="round"/>
      <circle cx="9" cy="12" r="1.2" fill="#818cf8"/>
    </svg>
  </div>
  <p class="pat-label">Enter your Jira Personal Access Token to connect</p>
  <div class="pat-row">
    <input
      class="pat-input"
      type="password"
      placeholder="Paste token…"
      bind:value={patInput}
      onkeydown={onKeydown}
    />
    <button class="pat-btn" onclick={save} disabled={!patInput.trim()}>
      Connect
    </button>
  </div>
</div>

<style>
  .pat-prompt {
    margin: 12px 14px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid rgba(129, 140, 248, 0.2);
    background: rgba(129, 140, 248, 0.05);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pat-icon {
    display: flex;
    justify-content: center;
  }

  .pat-label {
    margin: 0;
    font-size: 11.5px;
    color: #94a3b8;
    text-align: center;
    line-height: 1.5;
  }

  .pat-row {
    display: flex;
    gap: 6px;
  }

  .pat-input {
    flex: 1;
    background: #0f1e32;
    border: 1px solid #1e293b;
    border-radius: 7px;
    color: #e2e8f0;
    font-size: 12px;
    font-family: inherit;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .pat-input:focus {
    border-color: rgba(129, 140, 248, 0.4);
  }

  .pat-input::placeholder {
    color: #334155;
  }

  .pat-btn {
    all: unset;
    cursor: pointer;
    padding: 7px 13px;
    border-radius: 7px;
    background: rgba(129, 140, 248, 0.15);
    border: 1px solid rgba(129, 140, 248, 0.3);
    color: #818cf8;
    font-size: 12px;
    font-weight: 600;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .pat-btn:hover:not(:disabled) {
    background: rgba(129, 140, 248, 0.25);
    color: #a5b4fc;
  }

  .pat-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

</style>
