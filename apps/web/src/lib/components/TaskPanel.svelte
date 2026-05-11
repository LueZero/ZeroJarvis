<script lang="ts">
  import {
    getTaskItems,
    getTaskPanelOpen,
    setTaskPanelOpen,
    clearCompletedTasks,
    getActiveTaskCount,
    removeTask,
  } from "$lib/stores/agent.svelte";
  import { send } from "$lib/ws/client";

  interface Props {
    anchor?: "header" | "float";
  }
  let { anchor = "float" }: Props = $props();

  function elapsed(from: number, to?: number): string {
    const sec = Math.round(((to ?? Date.now()) - from) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}m${s > 0 ? ` ${s}s` : ""}`;
  }

  // Live timer tick
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const items = $derived(getTaskItems());
  const isOpen = $derived(getTaskPanelOpen());
  const runningCount = $derived(getActiveTaskCount());
  const hasCompleted = $derived(items.some(t => t.status !== "running"));

  function handleDelete(taskId: string) {
    removeTask(taskId);
    send({ type: "task_delete", taskId });
  }
</script>

<!-- Inline wrapper — flows with header layout -->
<div class="task-wrapper" class:is-header={anchor === "header"}>
  <!-- Badge button -->
  {#if items.length > 0}
    <button
      class="task-badge"
      class:has-running={runningCount > 0}
      class:is-open={isOpen}
      onclick={() => setTaskPanelOpen(!isOpen)}
      title="背景任務"
    >
      <svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 14l2 2 4-4" />
      </svg>
      {#if runningCount > 0}
        <span class="badge-count">{runningCount}</span>
      {/if}
      <span class="badge-scan-line"></span>
    </button>
  {/if}

  <!-- Dropdown panel -->
  {#if isOpen && items.length > 0}
    <div class="task-panel-backdrop" onclick={() => setTaskPanelOpen(false)}></div>
    <aside class="task-panel">
      <!-- Header -->
      <div class="panel-header">
        <div class="panel-title-row">
          <div class="panel-hex"></div>
          <h2 class="panel-title">TASKS</h2>
          <div class="panel-line"></div>
          <span class="panel-count">{items.length}</span>
        </div>
        <div class="panel-actions">
          {#if hasCompleted}
            <button class="panel-btn clear" onclick={clearCompletedTasks} title="清除已完成">
              <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
                <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                <path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2h3a1 1 0 011-1h3a1 1 0 011 1h3a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118z"/>
              </svg>
            </button>
          {/if}
          <button class="panel-btn close" onclick={() => setTaskPanelOpen(false)} title="關閉">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Task list -->
      <div class="task-list">
        {#each items as task, i (task.id)}
          <div
            class="task-item"
            class:running={task.status === "running"}
            class:done={task.status === "done"}
            class:error={task.status === "error"}
            style="animation-delay: {i * 60}ms"
          >
            <div class="task-status">
              {#if task.status === "running"}
                <div class="spinner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <circle cx="12" cy="12" r="9" stroke-opacity="0.2" />
                    <path d="M12 3a9 9 0 019 9" stroke-linecap="round" />
                  </svg>
                </div>
              {:else if task.status === "done"}
                <div class="check-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
              {:else}
                <div class="error-icon">✕</div>
              {/if}
            </div>
            <div class="task-content">
              <div class="task-desc">{task.description}</div>
              <div class="task-meta">
                {#if task.status === "running"}
                  <span class="task-time pulse">{elapsed(task.createdAt, now)}</span>
                {:else}
                  <span class="task-time">{elapsed(task.createdAt, task.completedAt)}</span>
                {/if}
                {#if task.resultText}
                  <span class="task-result" title={task.resultText}>
                    {task.resultText.length > 60 ? task.resultText.slice(0, 60) + "…" : task.resultText}
                  </span>
                {/if}
              </div>
            </div>
            <button class="task-delete" onclick={() => handleDelete(task.id)} title="刪除任務">
              <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
              </svg>
            </button>
            {#if task.status === "running"}
              <div class="task-progress-track">
                <div class="task-progress-bar"></div>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="panel-scan-line"></div>
    </aside>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════
     Wrapper — inline flow element
     ═══════════════════════════════════════════════ */
  .task-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  /* ═══════════════════════════════════════════════
     Badge — inline button, no position:fixed
     ═══════════════════════════════════════════════ */
  .task-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(10, 14, 28, 0.7);
    border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 6px;
    color: var(--accent, #00d4ff);
    font-size: 12px;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: all 0.25s ease;
    overflow: hidden;
    position: relative;
  }

  .task-badge:hover {
    border-color: rgba(0, 212, 255, 0.45);
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.12);
  }

  .task-badge.has-running {
    border-color: rgba(0, 212, 255, 0.35);
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.1);
  }

  .task-badge.is-open {
    background: rgba(0, 212, 255, 0.08);
    border-color: rgba(0, 212, 255, 0.45);
  }

  .badge-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .badge-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: rgba(0, 212, 255, 0.15);
    border-radius: 8px;
    font-size: 10px;
    font-weight: 700;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    letter-spacing: -0.5px;
    animation: count-pulse 2s ease-in-out infinite;
  }

  .badge-scan-line {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.06), transparent);
    animation: scan-badge 3s linear infinite;
    pointer-events: none;
  }

  .has-running .badge-scan-line {
    animation-duration: 2s;
    background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.1), transparent);
  }

  /* ═══════════════════════════════════════════════
     Panel backdrop
     ═══════════════════════════════════════════════ */
  .task-panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 950;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(2px);
    animation: fade-in 0.2s ease;
  }

  /* ═══════════════════════════════════════════════
     Panel — anchored below badge via absolute positioning
     ═══════════════════════════════════════════════ */
  .task-panel {
    position: fixed;
    top: 44px;
    right: 16px;
    z-index: 960;
    width: min(380px, calc(100vw - 32px));
    max-height: calc(100vh - 100px);
    display: flex;
    flex-direction: column;
    background: rgba(8, 12, 24, 0.92);
    border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 12px;
    backdrop-filter: blur(24px);
    box-shadow:
      0 0 30px rgba(0, 212, 255, 0.06),
      0 8px 32px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(0, 212, 255, 0.08);
    overflow: hidden;
    animation: panel-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* ═══════════════════════════════════════════════
     Panel header
     ═══════════════════════════════════════════════ */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 10px;
    border-bottom: 1px solid rgba(0, 212, 255, 0.1);
  }

  .panel-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-hex {
    width: 7px;
    height: 7px;
    background: var(--accent, #00d4ff);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    opacity: 0.7;
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    color: var(--accent, #00d4ff);
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .panel-line {
    width: 20px;
    height: 1px;
    background: linear-gradient(90deg, rgba(0, 212, 255, 0.3), transparent);
  }

  .panel-count {
    font-size: 10px;
    color: var(--text-dim, #6b7280);
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .panel-actions {
    display: flex;
    gap: 2px;
  }

  .panel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    color: var(--text-dim, #6b7280);
    transition: all 0.2s ease;
  }

  .panel-btn:hover {
    background: rgba(0, 212, 255, 0.08);
    color: var(--text, #e8eaf0);
  }

  .panel-btn.clear:hover {
    color: var(--danger, #ff5577);
    background: rgba(255, 85, 119, 0.08);
  }

  /* ═══════════════════════════════════════════════
     Task list
     ═══════════════════════════════════════════════ */
  .task-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.15) transparent;
  }

  /* ═══════════════════════════════════════════════
     Task item
     ═══════════════════════════════════════════════ */
  .task-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 9px 11px;
    border-radius: 8px;
    background: rgba(0, 212, 255, 0.02);
    border: 1px solid rgba(0, 212, 255, 0.06);
    transition: all 0.3s ease;
    animation: item-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    overflow: hidden;
  }

  .task-item.running {
    border-color: rgba(0, 212, 255, 0.15);
    background: rgba(0, 212, 255, 0.04);
  }

  .task-item.done {
    border-color: rgba(85, 255, 153, 0.15);
    animation: item-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) both, done-flash 0.8s ease 0.4s;
  }

  .task-item.error {
    border-color: rgba(255, 85, 119, 0.15);
  }

  .task-status {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner svg {
    width: 16px;
    height: 16px;
    color: var(--accent, #00d4ff);
    animation: spin 1s linear infinite;
  }

  .check-icon svg {
    width: 16px;
    height: 16px;
    color: var(--success, #55ff99);
    animation: check-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .error-icon {
    font-size: 13px;
    color: var(--danger, #ff5577);
    font-weight: 700;
  }

  .task-content {
    flex: 1;
    min-width: 0;
  }

  .task-delete {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-dim, #6b7280);
    cursor: pointer;
    opacity: 0;
    transition: all 0.2s ease;
    padding: 0;
  }

  .task-item:hover .task-delete {
    opacity: 0.6;
  }

  .task-delete:hover {
    opacity: 1 !important;
    color: var(--danger, #ff5577);
    border-color: rgba(255, 85, 119, 0.3);
    background: rgba(255, 85, 119, 0.08);
  }

  .task-desc {
    font-size: 12.5px;
    color: var(--text, #e8eaf0);
    line-height: 1.4;
    word-break: break-word;
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: 10px;
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .task-time {
    color: var(--text-dim, #6b7280);
  }

  .task-time.pulse {
    color: var(--accent, #00d4ff);
    opacity: 0.8;
  }

  .task-result {
    color: var(--text-dim, #6b7280);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }

  .task-progress-track {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: rgba(0, 212, 255, 0.06);
    overflow: hidden;
  }

  .task-progress-bar {
    height: 100%;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--accent, #00d4ff), transparent);
    animation: progress-sweep 2s ease-in-out infinite;
  }

  .panel-scan-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 10%, rgba(0, 212, 255, 0.4), transparent 90%);
    animation: scan-v 4s linear infinite;
    pointer-events: none;
  }

  /* ═══════════════════════════════════════════════
     Animations
     ═══════════════════════════════════════════════ */
  @keyframes panel-enter {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes item-enter {
    from { opacity: 0; transform: translateX(12px); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes done-flash {
    0%   { box-shadow: 0 0 0 rgba(85, 255, 153, 0); }
    40%  { box-shadow: 0 0 16px rgba(85, 255, 153, 0.2); }
    100% { box-shadow: 0 0 0 rgba(85, 255, 153, 0); }
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes check-pop { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes count-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
  @keyframes scan-badge { from { left: -100%; } to { left: 200%; } }
  @keyframes progress-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
  @keyframes scan-v { from { top: 0; } to { top: 100%; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* ═══════════════════════════════════════════════
     RWD
     ═══════════════════════════════════════════════ */
  @media (min-width: 768px) {
    .task-panel {
      width: 400px;
    }
  }

  @media (max-width: 600px) {
    .task-panel {
      right: 8px;
      left: 8px;
      width: auto;
      top: 40px;
      max-height: calc(100vh - 80px);
    }

    .task-result {
      max-width: 120px;
    }
  }

  @media (max-width: 380px) {
    .badge-icon {
      width: 12px;
      height: 12px;
    }
    .task-badge {
      padding: 3px 6px;
      gap: 3px;
    }
    .badge-count {
      min-width: 14px;
      height: 14px;
      font-size: 9px;
    }
  }
</style>
