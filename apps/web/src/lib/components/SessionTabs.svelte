<script lang="ts">
  /**
   * Session Tabs — Bottom tab bar showing all parallel sessions (F9)
   * Sci-fi HUD style matching the overall design.
   */
  import { getSessions } from "../stores/agent.svelte.js";

  interface Props {
    onSwitch?: (sessionId: string) => void;
  }

  let { onSwitch }: Props = $props();

  const statusIcon: Record<string, string> = {
    processing: "⏳",
    done: "✅",
    error: "❌",
  };
</script>

{#if getSessions().length > 1}
  <div class="session-tabs">
    {#each getSessions() as tab, i}
      <button
        class="tab"
        class:active={tab.active}
        class:done={tab.status === "done" && !tab.active}
        class:error={tab.status === "error"}
        onclick={() => onSwitch?.(tab.id)}
      >
        <span class="tab-num">#{i + 1}</span>
        <span class="tab-icon">{statusIcon[tab.status] ?? "⏳"}</span>
        <span class="tab-title">{tab.title}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .session-tabs {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 900;
    display: flex;
    gap: 2px;
    padding: 4px 8px;
    background: rgba(10, 10, 15, 0.95);
    border-top: 1px solid rgba(0, 212, 255, 0.2);
    backdrop-filter: blur(8px);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .session-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid rgba(0, 212, 255, 0.15);
    border-radius: 4px;
    background: rgba(15, 20, 40, 0.6);
    color: #8899aa;
    font-size: 0.75rem;
    font-family: "JetBrains Mono", monospace;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
    min-width: 0;
    flex-shrink: 0;
  }

  .tab:hover {
    border-color: rgba(0, 212, 255, 0.4);
    background: rgba(0, 212, 255, 0.05);
    color: #aabbcc;
  }

  .tab.active {
    border-color: #00d4ff;
    background: rgba(0, 212, 255, 0.1);
    color: #00d4ff;
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.2);
  }

  .tab.done:not(.active) {
    animation: flash 1.5s ease-in-out 3;
  }

  .tab.error {
    border-color: rgba(255, 85, 119, 0.4);
    color: #ff5577;
  }

  .tab-num {
    opacity: 0.6;
    font-size: 0.65rem;
  }

  .tab-icon {
    font-size: 0.7rem;
  }

  .tab-title {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes flash {
    0%, 100% { border-color: rgba(0, 212, 255, 0.15); }
    50% { border-color: #55ff99; box-shadow: 0 0 6px rgba(85, 255, 153, 0.3); }
  }
</style>
