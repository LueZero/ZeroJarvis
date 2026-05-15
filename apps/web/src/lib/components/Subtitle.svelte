<script lang="ts">
  /**
   * Conversation holographic windows ??AI response, user STT, error.
   * Each renders as a draggable + closable FloatingPanel.
   */
  import { getLlmText, getSttText, getState, getError, setError, setLlmText, setSttText } from "$lib/stores/agent.svelte";
  import FloatingPanel from "./FloatingPanel.svelte";

  let displayedLlm = $state("");
  let typewriterTimer: ReturnType<typeof setInterval> | null = null;

  // User-dismissed flags ??re-shown when new content arrives (key changes)
  let aiDismissedFor = $state("");
  let userDismissedFor = $state("");

  $effect(() => {
    const fullText = getLlmText();
    if (!fullText) {
      displayedLlm = "";
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
      return;
    }
    if (!displayedLlm && fullText) {
      displayedLlm = fullText.slice(0, Math.min(3, fullText.length));
    }
    if (!typewriterTimer) {
      typewriterTimer = setInterval(() => {
        const target = getLlmText();
        if (displayedLlm.length < target.length) {
          const step = Math.min(3, target.length - displayedLlm.length);
          displayedLlm = target.slice(0, displayedLlm.length + step);
        }
      }, 22);
    }
    return () => {
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    };
  });

  // Channel IDs ??regenerate when content "session" changes
  const aiChannel = $derived("CH-" + (hashCode(getLlmText().slice(0, 32)) % 0xffff).toString(16).toUpperCase().padStart(4, "0"));
  const userChannel = $derived("CH-" + (hashCode(getSttText().slice(0, 32)) % 0xffff).toString(16).toUpperCase().padStart(4, "0"));

  function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return Math.abs(h) || 1;
  }

  // Visibility: hide when user dismissed THIS specific text
  const showAi = $derived(!!displayedLlm && aiDismissedFor !== getLlmText());
  const showUser = $derived(!!getSttText() && !displayedLlm && userDismissedFor !== getSttText());
  const showError = $derived(!!getError());

  // Read AI panel's saved position so the User STT panel can dock directly above it.
  function getAiSavedPos(): { x: number; y: number } {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("holo-pos:ai-response") : null;
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.x === "number" && typeof p.y === "number") return p;
      }
    } catch {}
    return { x: 160, y: 440 };
  }

  // Default positions ??center area, AVOIDS the SideHUDs (left/right 220px each, top:60, bot:80)
  // AI: upper-center (between left & right SideHUDs, above reactor)
  // User: lower-center (below reactor)
  // Error: very top center
</script>

{#if showError}
  <FloatingPanel
    panelId="error"
    tag="⚠ SYSTEM ALERT"
    channel={"ERR-" + Date.now().toString(36).slice(-4).toUpperCase()}
    tone="danger"
    defaultX={typeof window !== "undefined" ? Math.max(240, window.innerWidth / 2 - 220) : 320}
    defaultY={20}
    defaultWidth={440}
    onClose={() => setError(null)}
  >
    <div class="msg-text danger">{getError()}</div>
  </FloatingPanel>
{/if}

{#if showUser}
  {@const aiPos = getAiSavedPos()}
  <FloatingPanel
    panelId="user-stt"
    tag="INCOMING / VOICE"
    channel={userChannel}
    tone="purple"
    defaultX={aiPos.x}
    defaultY={aiPos.y}
    defaultWidth={400}
    rememberPosition={false}
    onClose={() => { userDismissedFor = getSttText(); setSttText(""); }}
  >
    <div class="msg-text user">{getSttText()}</div>
  </FloatingPanel>
{/if}

{#if showAi}
  <FloatingPanel
    panelId="ai-response"
    tag="JARVIS / RESPONSE"
    channel={aiChannel}
    tone="cyan"
    defaultX={160}
    defaultY={440}
    defaultWidth={400}
    pulse={displayedLlm.length < getLlmText().length || getState() === "thinking"}
    onClose={() => { aiDismissedFor = getLlmText(); setLlmText(""); }}
  >
    <div class="msg-text ai">
      {displayedLlm}{#if displayedLlm.length < getLlmText().length || getState() === "thinking"}<span class="cursor">▍</span>{/if}
    </div>
  </FloatingPanel>
{/if}

<style>
  .msg-text {
    font-family: var(--font);
    font-size: 0.95rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: break-word;
    max-height: 50vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.3) transparent;
    letter-spacing: 0.01em;
  }
  .msg-text::-webkit-scrollbar { width: 4px; }
  .msg-text::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.3);
    border-radius: 2px;
  }
  .msg-text.ai {
    color: rgba(220, 240, 255, 0.95);
    text-shadow: 0 0 12px rgba(0, 212, 255, 0.15);
  }
  .msg-text.user {
    color: rgba(210, 200, 255, 0.85);
    font-style: italic;
    font-size: 0.88rem;
  }
  .msg-text.danger {
    color: var(--danger);
    font-size: 0.88rem;
  }
  .cursor {
    display: inline-block;
    color: var(--accent);
    font-weight: bold;
    margin-left: 2px;
    text-shadow: 0 0 12px var(--accent);
    animation: blink 0.7s steps(1) infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
  }
</style>

