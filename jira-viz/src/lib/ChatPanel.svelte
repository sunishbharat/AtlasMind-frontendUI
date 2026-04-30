<script lang="ts">
  import type { QueryResponse, TokenUsage } from "./charts/chartStore.svelte.js";
  import { dataStore } from "./dataStore.svelte.js";
  import { chartStore } from "./charts/index.js";
  import { queryEventClient } from "./QueryEventClient.js";
  import { authStore } from "./auth.svelte.js";
  import PatPrompt from "./PatPrompt.svelte";

  let { open = false }: { open?: boolean } = $props();

  interface Message {
    role: 'user' | 'assistant';
    text?: string;
    type?: string;
    data?: QueryResponse;
    raw?: boolean;
    elapsed?: number;
    tokenUsage?: TokenUsage | null;
  }

  let messages = $state<Message[]>([
    {
      role: "assistant",
      text: "Ask me anything — from your work data to everyday questions, I'm here to help.",
    },
  ]);

  let query           = $state("");
  let loading         = $state(false);
  let activeRequestId = $state<string | null>(null);
  let bursting        = $state(false);
  let liveMode = $state(window.location.pathname.startsWith("/live"));
  let listEl: HTMLDivElement;

  $effect(() => {
    messages;
    if (listEl) setTimeout(() => (listEl.scrollTop = listEl.scrollHeight), 30);
  });

  // - Mock data-aware responses (demo mode only) ------------------------------
  function respond(q: string): string {
    const t = q.toLowerCase();
    const all = [
      ...dataStore.epics,
      ...dataStore.stories,
      ...dataStore.subtasks,
    ];

    if (t.includes("epic")) {
      const names = dataStore.epics
        .map((e) => `**${e.id}** ${e.title}`)
        .join("\n");
      return `There are **${dataStore.epics.length} epics** in this sprint:\n${names}`;
    }
    if (t.includes("in progress")) {
      const items = all.filter((i) => i.status === "In Progress");
      return (
        `**${items.length} issues** are in progress:\n` +
        items.map((i) => `• ${i.id} — ${i.title}`).join("\n")
      );
    }
    if (t.includes("done") || t.includes("complet")) {
      const items = all.filter((i) => i.status === "Done");
      return (
        `**${items.length} issues** are done:\n` +
        items.map((i) => `• ${i.id} — ${i.title}`).join("\n")
      );
    }
    if (t.includes("to do") || t.includes("todo") || t.includes("not start")) {
      const items = all.filter((i) => i.status === "To Do");
      return (
        `**${items.length} issues** haven't started yet:\n` +
        items.map((i) => `• ${i.id} — ${i.title}`).join("\n")
      );
    }
    if (t.includes("assign") || t.includes("who")) {
      const byPerson = {};
      all.forEach((i) => {
        (byPerson[i.assignee] ??= []).push(i);
      });
      return Object.entries(byPerson)
        .map(
          ([name, items]) =>
            `**${name}** — ${items.length} issue${items.length > 1 ? "s" : ""} (${items.reduce((s, i) => s + i.points, 0)} pts)`,
        )
        .join("\n");
    }
    if (t.includes("point") || t.includes("estimate")) {
      const total = all.reduce((s, i) => s + i.points, 0);
      const done = all
        .filter((i) => i.status === "Done")
        .reduce((s, i) => s + i.points, 0);
      return (
        `**${done} of ${total} story points** completed (${Math.round((done / total) * 100)}%).\n` +
        dataStore.epics
          .map((e) => {
            const related = all.filter(
              (i) =>
                i.id === e.id ||
                i.epicId === e.id ||
                (i.storyId &&
                  dataStore.stories.find((s) => s.id === i.storyId)?.epicId ===
                    e.id),
            );
            return `• ${e.title}: ${related.reduce((s, i) => s + i.points, 0)} pts`;
          })
          .join("\n")
      );
    }
    if (
      t.includes("summar") ||
      t.includes("overview") ||
      t.includes("status")
    ) {
      const byStatus = { Done: 0, "In Progress": 0, "To Do": 0 };
      all.forEach((i) => byStatus[i.status]++);
      return (
        `**Sprint overview** — ${all.length} issues total:\n` +
        `• ✅ Done: ${byStatus["Done"]}\n` +
        `• 🔵 In Progress: ${byStatus["In Progress"]}\n` +
        `• ⬜ To Do: ${byStatus["To Do"]}`
      );
    }
    if (t.includes("stor")) {
      return (
        `There are **${dataStore.stories.length} stories** across ${dataStore.epics.length} epics:\n` +
        dataStore.stories
          .map((s) => `• ${s.id} — ${s.title} (${s.status})`)
          .join("\n")
      );
    }
    if (t.includes("sub") || t.includes("task")) {
      return (
        `There are **${dataStore.subtasks.length} sub-tasks** in the sprint:\n` +
        dataStore.subtasks
          .map((s) => `• ${s.id} — ${s.title} (${s.status})`)
          .join("\n")
      );
    }
    return `I can help with sprint data. Try:\n• "Show in progress issues"\n• "Who is assigned what?"\n• "How many story points remain?"\n• "Give me an overview"`;
  }

  // - Send --------------------------------------------------------------------
  async function send(): Promise<void> {
    const text = query.trim();
    if (!text || loading) return;

    messages = [...messages, { role: "user", text }];
    query = "";
    loading = true;

    if (!liveMode) {
      // ── Demo path: local mock ────────────────────────────────────────────
      await new Promise((r) => setTimeout(r, 480));
      messages = [...messages, { role: "assistant", text: respond(text) }];
    } else {
      // ── Live path: AtlasMind API ─────────────────────────────────────────
      const t0 = Date.now();
      const requestId = crypto.randomUUID();
      activeRequestId = requestId;
      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, request_id: requestId, pat: authStore.pat || undefined }),
        });
        const data = await res.json();
        const elapsed = Date.now() - t0;
        console.log('[AtlasMind] raw API response:', JSON.stringify(data, null, 2));

        // Cancelled by user mid-flight
        if (data.output?.answer?.startsWith('Error: Query cancelled.') ||
            data.error?.startsWith?.('Error: Query cancelled.')) {
          messages = [...messages, { role: 'assistant', text: 'Query cancelled.', elapsed, tokenUsage: data.output?.token_usage ?? null }];
        } else if (data.error) {
          messages = [
            ...messages,
            { role: "assistant", text: `**Error:** ${data.error}`, elapsed, tokenUsage: data.output?.token_usage ?? null },
          ];
        } else if (data.output?.type === "jql") {
          messages = [
            ...messages,
            { role: "assistant", type: "table", data: data.output, elapsed, tokenUsage: data.output?.token_usage ?? null },
          ];
          chartStore.setFromResponse(data.output, text);
        } else {
          chartStore.updateMeta(data.output?.meta);
          messages = [
            ...messages,
            {
              role: "assistant",
              text: data.output?.answer ?? data.output ?? "(no output)",
              elapsed,
              tokenUsage: data.output?.token_usage ?? null,
            },
          ];
        }
      } catch (err) {
        messages = [
          ...messages,
          {
            role: "assistant",
            text: `**Could not reach backend.**\nStart the API server from AtlasMind-frontendUI/:\n\n  uv run main.py\n\n${err.message}`,
            elapsed: Date.now() - t0,
          },
        ];
      } finally {
        activeRequestId = null;
      }
    }

    loading = false;
  }

  function handleSend(): void {
    if (loading || !query.trim()) return;
    bursting = true;
    setTimeout(() => { bursting = false; }, 500);
    send();
  }

  function cancelQuery(): void {
    const id = activeRequestId;
    if (!id) return;
    // Fire-and-forget — must not await anything that blocks the event loop
    queryEventClient.cancel(id).catch(() => {});
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function summariseResult(data: QueryResponse): string {
    if (data.answer) return data.answer;
    const issues = data.issues ?? [];
    if (!issues.length) return "Query executed.";

    // Count by status (fallback to first display field)
    const groupField = issues.some(i => i.status) ? "status"
      : issues.some(i => i.priority) ? "priority"
      : null;

    if (!groupField) return `Found **${data.shown ?? issues.length} issues**.`;

    const counts = {};
    for (const i of issues) {
      const val = i[groupField] ?? "Unknown";
      counts[val] = (counts[val] ?? 0) + 1;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `**${k} (${v})**`)
      .join(", ");

    const total = data.total ?? issues.length;
    const shown = data.shown ?? issues.length;
    const countStr = shown < total ? `**${shown} of ${total} issues**` : `**${shown} issue${shown !== 1 ? "s" : ""}**`;

    return `Found ${countStr}. By ${groupField}: ${top}. Chart updated on the left.`;
  }

  // Markdown-lite renderer (bold + newlines only)
  function renderText(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }
</script>

<aside class="panel" class:open>
  <div class="panel-inner">
    <!-- Header -->
    <div class="panel-header">
      <div class="panel-title">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="#818cf8" stroke-width="1.3" />
          <path
            d="M4.5 5.5C4.5 4.12 5.62 3 7 3s2.5 1.12 2.5 2.5c0 1.2-.8 2.2-1.9 2.45V9h-1.2V7.95C5.3 7.7 4.5 6.7 4.5 5.5z"
            fill="#818cf8"
          />
          <circle cx="7" cy="11" r=".7" fill="#818cf8" />
        </svg>
        AI Assistant
      </div>
      {#if liveMode && authStore.isAuthenticated}
        <button class="pat-clear" onclick={() => authStore.clear()} title="Disconnect Jira token">
          ✕ Token
        </button>
      {/if}
      <button
        class="mode-toggle"
        class:live={liveMode && chartStore.backendAlive}
        class:live-offline={liveMode && !chartStore.backendAlive}
        onclick={() => { liveMode = !liveMode; if (liveMode) chartStore.pollMeta(); }}
        title={liveMode
          ? "Switch to Demo mode"
          : "Switch to Live mode (requires backend)"}
      >
        {#if liveMode}
          <span class="mode-dot" class:offline={!chartStore.backendAlive}></span>Live
        {:else}
          Demo
        {/if}
      </button>
    </div>

    <!-- PAT prompt - shown only in live mode when no token is stored -->
    {#if liveMode && !authStore.isAuthenticated}
      <PatPrompt />
    {/if}

    <!-- Message list -->
    <div class="msg-list" bind:this={listEl}>
      {#each messages as msg (msg)}
        <div
          class="msg"
          class:msg-user={msg.role === "user"}
          class:msg-assistant={msg.role === "assistant"}
        >
          {#if msg.role === "assistant"}
            <div class="msg-avatar">AI</div>
          {/if}
          <div class="msg-col">
            <div class="msg-bubble">
              {#if msg.type === "table"}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderText(summariseResult(msg.data))}
              {:else if msg.raw}
                <pre class="msg-pre">{msg.text}</pre>
              {:else}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderText(msg.text)}
              {/if}
            </div>
            {#if msg.role === 'assistant' && msg.elapsed != null}
              <div class="msg-token-count">
                {msg.tokenUsage ? msg.tokenUsage.total_tokens.toLocaleString() + ' tokens' : '—'}
              </div>
            {/if}
          </div>
          {#if msg.role === 'assistant' && msg.elapsed != null}
            <div class="msg-elapsed">
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="5" r="4" stroke="currentColor" stroke-width="1.2"/>
                <path d="M5 3v2.5l1.5 1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
              {msg.elapsed < 1000 ? `${msg.elapsed}ms` : `${(msg.elapsed / 1000).toFixed(1)}s`}
            </div>
          {/if}
        </div>
      {/each}

      {#if loading}
        <div class="msg msg-assistant">
          <div class="msg-avatar">AI</div>
          <div class="msg-bubble msg-typing">
            <span></span><span></span><span></span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Input -->
    <div class="input-area">
      <textarea
        class="input-box"
        bind:value={query}
        onkeydown={onKeydown}
        placeholder="Ask about your sprint…"
        rows="3"
        disabled={loading}
      ></textarea>
      <button
        class="send-btn"
        class:is-cancel={loading && !!activeRequestId}
        class:bursting
        onclick={loading && activeRequestId ? cancelQuery : handleSend}
        disabled={!loading && !query.trim()}
        aria-label={loading && activeRequestId ? "Cancel query" : "Send"}
      >
        <span class="burst-ring"></span>
        <span class="burst-ring burst-ring--2"></span>
        <span class="burst-ring burst-ring--3"></span>
        {#if loading && activeRequestId}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />
          </svg>
        {:else}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M12 7L2 2l2.5 5L2 12l10-5z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
        {/if}
      </button>
    </div>
    <p class="input-hint">Enter to send · Shift+Enter for new line</p>
  </div>
</aside>

<style>
  /* ── Slide-in panel ─────────────────────────────────────────────────────── */
  .panel {
    width: 0;
    overflow: hidden;
    flex-shrink: 0;
    transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    border-left: 0px solid #1a2540;
    background: #08111e;
    display: flex;
    flex-direction: column;
  }

  .panel.open {
    width: 340px;
    border-left-width: 1px;
  }

  .panel-inner {
    width: 340px; /* fixed so content doesn't squeeze during animation */
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid #1a2540;
    flex-shrink: 0;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .pat-clear {
    all: unset;
    cursor: pointer;
    font-size: 9px;
    font-weight: 600;
    color: #475569;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid #1e293b;
    background: #0f1e32;
    transition: color 0.15s, border-color 0.15s;
    margin-left: auto;
  }

  .pat-clear:hover {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.3);
  }

  .mode-toggle {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid #1e293b;
    color: #475569;
    background: #0f1e32;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
    margin-left: auto;
  }

  .mode-toggle.live {
    color: #22c55e;
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.07);
  }

  .mode-toggle.live-offline {
    color: #475569;
    border-color: rgba(71, 85, 105, 0.3);
    background: rgba(71, 85, 105, 0.07);
  }

  .mode-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #22c55e;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .mode-dot.offline {
    background: #475569;
    animation: none;
    opacity: 0.6;
  }

  @keyframes pulse-dot {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  /* ── Messages ────────────────────────────────────────────────────────────── */
  .msg-list {
    flex: 1;
    overflow-y: auto;
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .msg {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .msg-user {
    flex-direction: row-reverse;
  }

  .msg-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(129, 140, 248, 0.15);
    border: 1px solid rgba(129, 140, 248, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
    color: #818cf8;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .msg-bubble {
    max-width: 240px;
    padding: 9px 12px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.55;
    color: #cbd5e1;
    word-break: break-word;
  }

  .msg-pre {
    font-family: "Consolas", monospace;
    font-size: 10px;
    white-space: pre;
    overflow-x: auto;
    margin: 0;
    color: #94a3b8;
    line-height: 1.5;
  }

  .msg-assistant .msg-bubble {
    background: #0f1e32;
    border: 1px solid #1e293b;
    border-top-left-radius: 3px;
  }

  .msg-elapsed {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 9px;
    color: #4e6884;
    letter-spacing: 0.03em;
  }

  .msg-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .msg-token-count {
    font-size: 9px;
    color: #2d3f55;
    padding-left: 3px;
    letter-spacing: 0.03em;
  }

  .msg-user .msg-bubble {
    background: rgba(129, 140, 248, 0.12);
    border: 1px solid rgba(129, 140, 248, 0.2);
    border-top-right-radius: 3px;
    color: #e2e8f0;
    text-align: right;
  }

  /* Typing indicator */
  .msg-typing {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 12px 14px;
  }

  .msg-typing span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #334155;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .msg-typing span:nth-child(2) {
    animation-delay: 0.2s;
  }
  .msg-typing span:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: scale(0.85);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Input ───────────────────────────────────────────────────────────────── */
  .input-area {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 12px 14px 8px;
    border-top: 1px solid #1a2540;
    flex-shrink: 0;
  }

  .input-box {
    flex: 1;
    background: #0f1e32;
    border: 1px solid #1e293b;
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 12.5px;
    font-family: inherit;
    padding: 8px 11px;
    resize: none;
    line-height: 1.5;
    max-height: 90px;
    overflow-y: auto;
    outline: none;
    transition: border-color 0.15s;
    scrollbar-width: thin;
  }

  .input-box:focus {
    border-color: #334155;
  }
  .input-box::placeholder {
    color: #334155;
  }
  .input-box:disabled {
    opacity: 0.5;
  }

  .send-btn {
    all: unset;
    cursor: pointer;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: radial-gradient(circle at 38% 32%, #a5b4fc 0%, #6366f1 60%, #4f46e5 100%);
    color: #fff;
    border: 1.5px solid #4ade80;
    flex-shrink: 0;
    transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s;
    box-shadow: 0 0 0 0 rgba(74, 222, 128, 0);
  }

  .send-btn:hover:not(:disabled):not(.is-cancel) {
    transform: scale(1.07);
    box-shadow: 0 0 8px 2px rgba(74, 222, 128, 0.25);
  }
  .send-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* Burst rings — hidden by default */
  .burst-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid #4ade80;
    opacity: 0;
    transform: scale(1);
    pointer-events: none;
  }

  /* Bubble pop on send */
  .send-btn.bursting {
    animation: bubble-pop 0.35s cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
  .send-btn.bursting .burst-ring {
    animation: burst-ring 0.5s ease-out forwards;
  }
  .send-btn.bursting .burst-ring--2 {
    animation: burst-ring 0.5s ease-out 0.07s forwards;
  }
  .send-btn.bursting .burst-ring--3 {
    animation: burst-ring 0.5s ease-out 0.14s forwards;
  }

  @keyframes bubble-pop {
    0%   { transform: scale(1); }
    25%  { transform: scale(1.22); }
    55%  { transform: scale(0.9); }
    80%  { transform: scale(1.06); }
    100% { transform: scale(1); }
  }

  @keyframes burst-ring {
    0%   { transform: scale(1);   opacity: 0.7; }
    100% { transform: scale(2.4); opacity: 0;   }
  }

  /* Stop state — button transforms into a cancel control */
  .send-btn.is-cancel {
    border-radius: 8px;
    background: rgba(248, 113, 113, 0.12);
    color: #f87171;
    border: 1px solid rgba(248, 113, 113, 0.25);
    box-shadow: none;
  }
  .send-btn.is-cancel:hover {
    background: rgba(248, 113, 113, 0.22);
    color: #fca5a5;
    transform: none;
  }

  .input-hint {
    font-size: 9.5px;
    color: #1e293b;
    padding: 0 14px 10px;
    margin: 0;
    flex-shrink: 0;
  }
</style>
