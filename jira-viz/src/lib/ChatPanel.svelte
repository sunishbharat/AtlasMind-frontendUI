<script lang="ts">
  import type { QueryResponse } from "./charts/chartStore.svelte.js";
  import { dataStore } from "./dataStore.svelte.js";
  import { chartStore } from "./charts/index.js";

  let { open = false }: { open?: boolean } = $props();

  interface Message {
    role: 'user' | 'assistant';
    text?: string;
    type?: string;
    data?: QueryResponse;
    raw?: boolean;
    elapsed?: number;  // ms from request start to response received
  }

  let messages = $state<Message[]>([
    {
      role: "assistant",
      text: "Hi! I can answer questions about your sprint data - try asking about epics, assignees, story points, or issue status.",
    },
  ]);

  let query   = $state("");
  let loading = $state(false);
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
      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text }),
        });
        const data = await res.json();
        const elapsed = Date.now() - t0;
        console.log('[AtlasMind] raw API response:', JSON.stringify(data, null, 2));
        if (data.error) {
          messages = [
            ...messages,
            { role: "assistant", text: `**Error:** ${data.error}`, elapsed },
          ];
        } else if (data.output?.type === "jql") {
          messages = [
            ...messages,
            { role: "assistant", type: "table", data: data.output, elapsed },
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
      }
    }

    loading = false;
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
          <div
            class="msg-bubble"
          >
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
        onclick={send}
        disabled={!query.trim() || loading}
        aria-label="Send"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M12 7L2 2l2.5 5L2 12l10-5z"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
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
    color: #334155;
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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: #818cf8;
    color: #fff;
    flex-shrink: 0;
    transition:
      background 0.15s,
      opacity 0.15s;
  }

  .send-btn:hover:not(:disabled) {
    background: #6366f1;
  }
  .send-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .input-hint {
    font-size: 9.5px;
    color: #1e293b;
    padding: 0 14px 10px;
    margin: 0;
    flex-shrink: 0;
  }
</style>
