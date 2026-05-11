<script lang="ts">
  import {
    getTokenUsage,
    getSummaryPanelOpen,
    setSummaryPanelOpen,
    getLastCompactSuccess,
    setLastCompactSuccess,
  } from "$lib/stores/agent.svelte";
  import { send } from "$lib/ws/client";

  const usage = $derived(getTokenUsage());
  const isOpen = $derived(getSummaryPanelOpen());
  const lastCompact = $derived(getLastCompactSuccess());

  const percent = $derived(usage?.usagePercent ?? 0);
  const barColor = $derived(
    percent >= 70 ? "var(--color-danger)" :
    percent >= 50 ? "var(--color-warn)" :
    "var(--color-ok)"
  );
  const hasUsage = $derived(usage !== null && usage.total > 0);

  let compacting = $state(false);

  function handleCompact() {
    compacting = true;
    setLastCompactSuccess(null);
    send({ type: "summarize_session" });
    // Reset after result arrives
    const unwatch = $effect.root(() => {
      $effect(() => {
        const result = getLastCompactSuccess();
        if (result !== null) {
          compacting = false;
          unwatch();
        }
      });
    });
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  }
</script>

{#if hasUsage}
  <div class="summary-wrapper">
    <!-- Badge button -->
    <button
      class="token-badge"
      class:warn={percent >= 50 && percent < 70}
      class:danger={percent >= 70}
      class:is-open={isOpen}
      onclick={() => setSummaryPanelOpen(!isOpen)}
      title="Token 使用量"
    >
      <svg class="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span class="badge-pct">{percent}%</span>
    </button>

    <!-- Dropdown panel -->
    {#if isOpen && usage}
      <div class="panel-backdrop" onclick={() => setSummaryPanelOpen(false)}></div>
      <aside class="summary-panel">
        <div class="panel-header">
          <div class="panel-hex"></div>
          <h2 class="panel-title">CONTEXT</h2>
          <div class="panel-line"></div>
          <span class="panel-pct" style:color={barColor}>{percent}%</span>
        </div>

        <!-- Progress bar -->
        <div class="progress-track">
          <div class="progress-fill" style:width="{Math.min(percent, 100)}%" style:background={barColor}></div>
          <div class="progress-threshold" style:left="70%"></div>
        </div>
        <div class="progress-labels">
          <span>{formatTokens(usage.total)} / {formatTokens(usage.contextLimit)}</span>
          <span>Cost: ${usage.cost.toFixed(4)}</span>
        </div>

        <!-- Breakdown -->
        <div class="breakdown">
          <div class="row"><span class="label">Input</span><span class="val">{formatTokens(usage.input)}</span></div>
          <div class="row"><span class="label">Output</span><span class="val">{formatTokens(usage.output)}</span></div>
          <div class="row"><span class="label">Reasoning</span><span class="val">{formatTokens(usage.reasoning)}</span></div>
          <div class="row"><span class="label">Cache Read</span><span class="val">{formatTokens(usage.cacheRead)}</span></div>
          <div class="row"><span class="label">Cache Write</span><span class="val">{formatTokens(usage.cacheWrite)}</span></div>
        </div>

        <!-- Compact button -->
        <button
          class="compact-btn"
          class:compacting
          disabled={compacting}
          onclick={handleCompact}
        >
          {#if compacting}
            壓縮中...
          {:else if lastCompact === true}
            ✅ 壓縮完成
          {:else if lastCompact === false}
            ❌ 壓縮失敗，重試
          {:else}
            🗜️ 壓縮對話
          {/if}
        </button>
      </aside>
    {/if}
  </div>
{/if}

<style>
  .summary-wrapper {
    position: relative;
    display: inline-flex;
  }

  .token-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(0, 255, 200, 0.08);
    border: 1px solid rgba(0, 255, 200, 0.25);
    border-radius: 6px;
    color: rgba(0, 255, 200, 0.8);
    cursor: pointer;
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    transition: all 0.2s;
  }
  .token-badge:hover, .token-badge.is-open {
    background: rgba(0, 255, 200, 0.15);
    border-color: rgba(0, 255, 200, 0.5);
  }
  .token-badge.warn {
    color: rgba(255, 200, 0, 0.9);
    border-color: rgba(255, 200, 0, 0.3);
    background: rgba(255, 200, 0, 0.08);
  }
  .token-badge.danger {
    color: rgba(255, 60, 60, 0.9);
    border-color: rgba(255, 60, 60, 0.3);
    background: rgba(255, 60, 60, 0.08);
  }

  .badge-icon {
    width: 14px;
    height: 14px;
  }
  .badge-pct {
    font-weight: 600;
  }

  .panel-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .summary-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 280px;
    background: rgba(10, 18, 24, 0.95);
    border: 1px solid rgba(0, 255, 200, 0.2);
    border-radius: 8px;
    padding: 12px;
    z-index: 100;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 10px;
  }
  .panel-hex {
    width: 8px;
    height: 8px;
    background: rgba(0, 255, 200, 0.6);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  }
  .panel-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    color: rgba(0, 255, 200, 0.8);
    margin: 0;
  }
  .panel-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, rgba(0, 255, 200, 0.3), transparent);
  }
  .panel-pct {
    font-size: 13px;
    font-weight: 700;
    font-family: "JetBrains Mono", monospace;
  }

  .progress-track {
    position: relative;
    height: 6px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 3px;
    overflow: visible;
    margin-bottom: 4px;
  }
  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease, background 0.3s;
  }
  .progress-threshold {
    position: absolute;
    top: -2px;
    width: 1px;
    height: 10px;
    background: rgba(255, 60, 60, 0.5);
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    font-family: "JetBrains Mono", monospace;
    margin-bottom: 10px;
  }

  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 10px;
    padding: 8px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 4px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-family: "JetBrains Mono", monospace;
  }
  .label {
    color: rgba(255, 255, 255, 0.4);
  }
  .val {
    color: rgba(0, 255, 200, 0.7);
  }

  .compact-btn {
    width: 100%;
    padding: 6px 12px;
    background: rgba(0, 255, 200, 0.1);
    border: 1px solid rgba(0, 255, 200, 0.3);
    border-radius: 4px;
    color: rgba(0, 255, 200, 0.8);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }
  .compact-btn:hover:not(:disabled) {
    background: rgba(0, 255, 200, 0.2);
    border-color: rgba(0, 255, 200, 0.5);
  }
  .compact-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .compact-btn.compacting {
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
</style>
