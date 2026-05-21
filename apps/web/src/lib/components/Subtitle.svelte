<script lang="ts">
  /**
   * Conversation holographic windows ??AI response, user STT, error.
   * Each renders as a draggable + closable FloatingPanel.
   */
  import { getLlmText, getSttText, getState, getError, setError, setLlmText, setSttText } from "$lib/stores/agent.svelte";
  import FloatingPanel from "./FloatingPanel.svelte";
  import { marked } from "marked";

  // Configure marked for clean output
  marked.use({ breaks: true, gfm: true });

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

  /** Render markdown to safe HTML — escapes raw HTML tags in source */
  function renderMd(text: string): string {
    if (!text) return "";
    const escaped = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return marked.parse(escaped, { async: false }) as string;
  }

  const renderedHtml = $derived(renderMd(displayedLlm));

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
    defaultWidth={520}
    pulse={displayedLlm.length < getLlmText().length || getState() === "thinking"}
    onClose={() => { aiDismissedFor = getLlmText(); setLlmText(""); }}
  >
    <div class="msg-text ai markdown-body">
      {@html renderedHtml}{#if displayedLlm.length < getLlmText().length || getState() === "thinking"}<span class="cursor">▍</span>{/if}
    </div>
  </FloatingPanel>
{/if}

<style>
  .msg-text {
    font-family: var(--font);
    font-size: clamp(1.05rem, 1.8vw, 1.5rem);
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
  .msg-text.markdown-body {
    white-space: normal;
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
  /* Markdown styles for AI response */
  .msg-text.ai.markdown-body :global(p) {
    margin: 0.3em 0;
  }
  .msg-text.ai.markdown-body :global(p:first-child) {
    margin-top: 0;
  }
  .msg-text.ai.markdown-body :global(p:last-child) {
    margin-bottom: 0;
  }
  .msg-text.ai.markdown-body :global(h1),
  .msg-text.ai.markdown-body :global(h2),
  .msg-text.ai.markdown-body :global(h3) {
    color: rgba(0, 212, 255, 0.95);
    text-shadow: 0 0 8px rgba(0, 212, 255, 0.3);
    margin: 0.5em 0 0.2em;
    font-weight: 600;
  }
  .msg-text.ai.markdown-body :global(h1) { font-size: 1.2em; }
  .msg-text.ai.markdown-body :global(h2) { font-size: 1.1em; }
  .msg-text.ai.markdown-body :global(h3) { font-size: 1.0em; }
  .msg-text.ai.markdown-body :global(strong) {
    color: rgba(255, 255, 255, 0.98);
    text-shadow: 0 0 6px rgba(0, 212, 255, 0.2);
  }
  .msg-text.ai.markdown-body :global(em) {
    color: rgba(180, 230, 255, 0.9);
    font-style: italic;
  }
  .msg-text.ai.markdown-body :global(code) {
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 3px;
    padding: 0.1em 0.35em;
    font-size: 0.88em;
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }
  .msg-text.ai.markdown-body :global(pre) {
    background: rgba(0, 10, 20, 0.6);
    border: 1px solid rgba(0, 212, 255, 0.15);
    border-radius: 4px;
    padding: 0.6em 0.8em;
    overflow-x: auto;
    margin: 0.4em 0;
  }
  .msg-text.ai.markdown-body :global(pre code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85em;
  }
  .msg-text.ai.markdown-body :global(ul),
  .msg-text.ai.markdown-body :global(ol) {
    padding-left: 1.4em;
    margin: 0.3em 0;
  }
  .msg-text.ai.markdown-body :global(li) {
    margin: 0.15em 0;
  }
  .msg-text.ai.markdown-body :global(li::marker) {
    color: rgba(0, 212, 255, 0.6);
  }
  .msg-text.ai.markdown-body :global(blockquote) {
    border-left: 3px solid rgba(0, 212, 255, 0.4);
    padding-left: 0.8em;
    margin: 0.4em 0;
    color: rgba(200, 230, 255, 0.8);
  }
  .msg-text.ai.markdown-body :global(hr) {
    border: none;
    border-top: 1px solid rgba(0, 212, 255, 0.2);
    margin: 0.5em 0;
  }
  .msg-text.ai.markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 0.4em 0;
    font-size: 0.9em;
  }
  .msg-text.ai.markdown-body :global(th),
  .msg-text.ai.markdown-body :global(td) {
    border: 1px solid rgba(0, 212, 255, 0.2);
    padding: 0.3em 0.6em;
  }
  .msg-text.ai.markdown-body :global(th) {
    background: rgba(0, 212, 255, 0.08);
    color: rgba(0, 212, 255, 0.9);
  }
  .msg-text.user {
    color: rgba(210, 200, 255, 0.85);
    font-style: italic;
    font-size: clamp(0.95rem, 1.5vw, 1.3rem);
  }
  .msg-text.danger {
    color: var(--danger);
    font-size: clamp(0.95rem, 1.5vw, 1.3rem);
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

