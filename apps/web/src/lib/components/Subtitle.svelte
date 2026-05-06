<script lang="ts">
  /**
   * Live subtitle display — shows STT input & LLM response
   * Floating glass-panel style at bottom of viewport
   */
  import { getLlmText, getSttText, getState, getError } from "$lib/stores/agent.svelte";

  let displayedLlm = $state("");
  let typewriterTimer: ReturnType<typeof setInterval> | null = null;

  // Single effect: sync typewriter with LLM text
  $effect(() => {
    const fullText = getLlmText();

    // Text cleared — reset immediately
    if (!fullText) {
      displayedLlm = "";
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
      return;
    }

    // Start typewriter if not already running
    if (!typewriterTimer) {
      typewriterTimer = setInterval(() => {
        const target = getLlmText();
        if (displayedLlm.length < target.length) {
          const step = Math.min(3, target.length - displayedLlm.length);
          displayedLlm = target.slice(0, displayedLlm.length + step);
        } else {
          // Caught up — keep timer alive for more incoming text
        }
      }, 25);
    }

    // Cleanup on destroy
    return () => {
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    };
  });

  // Determine if we have content to show
  function hasContent(): boolean {
    return !!(getError() || getSttText() || displayedLlm);
  }
</script>

{#if hasContent()}
  <div class="glass-panel">
    <!-- Error -->
    {#if getError()}
      <div class="msg error">
        <span class="indicator error-dot"></span>
        <span class="msg-text">{getError()}</span>
      </div>
    {/if}

    <!-- User STT text (listening/recognizing) -->
    {#if getSttText() && !displayedLlm}
      <div class="msg user">
        <span class="indicator user-dot"></span>
        <span class="msg-text">{getSttText()}</span>
      </div>
    {/if}

    <!-- AI response -->
    {#if displayedLlm}
      <div class="msg ai">
        <span class="indicator ai-dot"></span>
        <span class="msg-text">
          {displayedLlm}{#if displayedLlm.length < getLlmText().length || getState() === "thinking"}<span class="cursor">▍</span>{/if}
        </span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .glass-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 560px;
    padding: 14px 18px;
    border-radius: 16px;
    background: rgba(8, 12, 24, 0.75);
    backdrop-filter: blur(20px) saturate(1.4);
    border: 1px solid rgba(0, 212, 255, 0.12);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 1px rgba(0, 212, 255, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.03);
    animation: panelIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: auto;
  }

  .msg {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    line-height: 1.6;
  }

  .indicator {
    flex-shrink: 0;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-top: 8px;
  }

  .user-dot {
    background: rgba(123, 97, 255, 0.8);
    box-shadow: 0 0 6px rgba(123, 97, 255, 0.5);
    animation: dotPulse 1.5s infinite;
  }

  .ai-dot {
    background: rgba(0, 212, 255, 0.8);
    box-shadow: 0 0 6px rgba(0, 212, 255, 0.5);
  }

  .error-dot {
    background: var(--danger);
    box-shadow: 0 0 6px rgba(255, 85, 119, 0.5);
  }

  .msg-text {
    font-size: 0.9rem;
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
    font-family: var(--font);
  }

  .msg.user .msg-text {
    color: rgba(200, 200, 220, 0.7);
    font-style: italic;
  }

  .msg.error .msg-text {
    color: var(--danger);
    font-size: 0.8rem;
  }

  .cursor {
    display: inline-block;
    animation: blink 0.7s steps(1) infinite;
    color: var(--accent);
    font-weight: bold;
    margin-left: 1px;
  }

  @keyframes panelIn {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @media (max-width: 600px) {
    .glass-panel {
      padding: 10px 14px;
      border-radius: 12px;
      max-width: 100%;
    }
    .msg-text {
      font-size: 0.82rem;
    }
  }
</style>
