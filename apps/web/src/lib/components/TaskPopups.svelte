<script lang="ts">
  /**
   * TaskPopups — Spawns a draggable holographic window for each background task.
   * - Running task: cyan, pulsing
   * - Done: success-green, auto-dismiss after 12s
   * - Error: danger-red, manual dismiss
   */
  import FloatingPanel from "./FloatingPanel.svelte";
  import { getTaskItems, removeTask } from "$lib/stores/agent.svelte";
  import { send } from "$lib/ws/client";

  // Live ticking timer
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  // Track user-dismissed task IDs (so they don't reappear)
  let dismissed = $state(new Set<string>());

  // Auto-hide done tasks after 12s
  let autoHidden = $state(new Set<string>());
  $effect(() => {
    const items = getTaskItems();
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of items) {
      if (t.status === "done" && t.completedAt && !autoHidden.has(t.id) && !dismissed.has(t.id)) {
        const remaining = 12000 - (Date.now() - t.completedAt);
        if (remaining <= 0) {
          autoHidden.add(t.id);
          autoHidden = new Set(autoHidden);
        } else {
          const id = setTimeout(() => {
            autoHidden.add(t.id);
            autoHidden = new Set(autoHidden);
          }, remaining);
          timers.push(id);
        }
      }
    }
    return () => timers.forEach(clearTimeout);
  });

  // Visible tasks = not user-dismissed AND not auto-hidden
  const visible = $derived(
    getTaskItems().filter(t => !dismissed.has(t.id) && !autoHidden.has(t.id)),
  );

  function elapsed(from: number, to?: number): string {
    const sec = Math.round(((to ?? now) - from) / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m${s > 0 ? ` ${s}s` : ""}`;
  }

  function close(id: string) {
    dismissed.add(id);
    dismissed = new Set(dismissed);
  }

  function killTask(id: string) {
    removeTask(id);
    send({ type: "task_delete", taskId: id } as any);
    close(id);
  }

  function tone(status: string): "cyan" | "success" | "danger" {
    if (status === "done") return "success";
    if (status === "error") return "danger";
    return "cyan";
  }

  function tag(status: string): string {
    if (status === "done") return "TASK / COMPLETE";
    if (status === "error") return "TASK / FAILED";
    return "TASK / RUNNING";
  }

  // Stack tasks vertically in TOP-RIGHT corner, away from center work area
  // (mirrors how AI response sits to the side rather than blocking the middle)
  const PANEL_W = 340;
  const GAP = 12;
  const PANEL_H_EST = 130; // approximate height of a task card

  function defaultX(_idx: number): number {
    if (typeof window === "undefined") return 280;
    // Right edge with margin (avoid right SideHUD ~220 wide)
    return Math.max(20, window.innerWidth - PANEL_W - 24);
  }

  function defaultY(idx: number): number {
    return 80 + idx * (PANEL_H_EST + GAP);
  }
</script>

{#each visible as task, i (task.id)}
  <FloatingPanel
    panelId={"task-" + task.id}
    tag={tag(task.status)}
    channel={"#" + task.id.slice(0, 6).toUpperCase()}
    tone={tone(task.status)}
    pulse={task.status === "running"}
    defaultX={defaultX(i)}
    defaultY={defaultY(i)}
    defaultWidth={PANEL_W}
    rememberPosition={false}
    onClose={() => close(task.id)}
  >
    <div class="task-card">
      <div class="task-desc">{task.description}</div>

      {#if task.resultText}
        <div class="task-result" class:err={task.status === "error"}>
          {task.resultText}
        </div>
      {/if}

      <div class="task-foot">
        <div class="task-meta">
          <span class="meta-pill">
            <span class="meta-key">⌁</span>
            <span class="meta-val">
              {#if task.status === "running"}
                {elapsed(task.createdAt)}
              {:else}
                {elapsed(task.createdAt, task.completedAt)}
              {/if}
            </span>
          </span>
          {#if task.status === "running"}
            <span class="meta-pill pulse">
              <span class="meta-dot"></span>
              <span class="meta-val">PROCESSING</span>
            </span>
          {:else if task.status === "done"}
            <span class="meta-pill success">
              <span class="meta-val">✓ DONE</span>
            </span>
          {:else}
            <span class="meta-pill danger">
              <span class="meta-val">✗ ERROR</span>
            </span>
          {/if}
        </div>

        {#if task.status === "running"}
          <button class="task-kill" onclick={() => killTask(task.id)} title="中止任務">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="4" y="4" width="8" height="8" />
            </svg>
            <span>STOP</span>
          </button>
        {/if}
      </div>
    </div>
  </FloatingPanel>
{/each}

<style>
  .task-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .task-desc {
    font-family: var(--font);
    font-size: 0.9rem;
    line-height: 1.5;
    color: rgba(220, 240, 255, 0.95);
    word-break: break-word;
  }

  .task-result {
    font-family: var(--font-mono);
    font-size: 0.78rem;
    line-height: 1.5;
    padding: 8px 10px;
    background: rgba(0, 212, 255, 0.06);
    border-left: 2px solid var(--accent);
    color: rgba(200, 230, 255, 0.85);
    max-height: 140px;
    overflow-y: auto;
    word-break: break-word;
    white-space: pre-wrap;
  }
  .task-result.err {
    background: rgba(255, 85, 119, 0.08);
    border-left-color: var(--danger);
    color: rgba(255, 200, 210, 0.95);
  }

  .task-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .meta-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border: 1px solid rgba(0, 212, 255, 0.3);
    color: rgba(200, 230, 255, 0.75);
    clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
    background: rgba(0, 212, 255, 0.06);
  }
  .meta-pill.pulse {
    border-color: var(--accent);
    color: var(--accent);
  }
  .meta-pill.success {
    border-color: var(--success);
    color: var(--success);
    background: rgba(85, 255, 153, 0.08);
  }
  .meta-pill.danger {
    border-color: var(--danger);
    color: var(--danger);
    background: rgba(255, 85, 119, 0.08);
  }

  .meta-key { opacity: 0.6; }
  .meta-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
    animation: tdot 1.2s ease-in-out infinite;
  }
  @keyframes tdot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.8); }
  }

  .task-kill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: rgba(255, 180, 180, 0.85);
    border: 1px solid rgba(255, 85, 119, 0.4);
    background: rgba(255, 85, 119, 0.06);
    cursor: pointer;
    clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
    transition: all 0.15s;
  }
  .task-kill svg { width: 9px; height: 9px; }
  .task-kill:hover {
    background: rgba(255, 85, 119, 0.18);
    color: var(--danger);
    box-shadow: 0 0 10px rgba(255, 85, 119, 0.4);
  }
</style>
