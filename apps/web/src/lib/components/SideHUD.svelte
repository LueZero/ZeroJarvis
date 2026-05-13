<script lang="ts">
  /**
   * SideHUD — Sci-fi holographic side panels with live activity feed
   * Shows opencode's real-time processing: reasoning, tool calls, step events
   */
  import {
    getState,
    getActiveTaskCount,
    getActivityFeed,
    type ActivityItem,
  } from "$lib/stores/agent.svelte";
  import {
    sfxActivate,
    sfxDeactivate,
    sfxToolStart,
    sfxToolDone,
    sfxToolError,
    sfxStepTick,
    sfxReasoningPulse,
  } from "$lib/audio/sfx";

  // Reactive derived states
  let state = $derived(getState());
  let taskCount = $derived(getActiveTaskCount());
  let active = $derived(state === "thinking" || taskCount > 0);
  let intensity = $derived(
    state === "thinking" ? "high" : taskCount > 0 ? "medium" : "idle"
  );
  let feed = $derived(getActivityFeed());

  // Split feed: reasoning goes left, tools/steps go right
  let reasoningItems = $derived(feed.filter(i => i.event.kind === "reasoning"));
  let toolItems = $derived(feed.filter(i => i.event.kind !== "reasoning"));

  // Get latest reasoning text
  let latestReasoning = $derived(
    reasoningItems.length > 0
      ? (reasoningItems[reasoningItems.length - 1].event as any).text as string
      : ""
  );

  // ── SFX: Activation / Deactivation ──
  let prevActive = false;
  $effect(() => {
    if (active && !prevActive) {
      sfxActivate();
    } else if (!active && prevActive) {
      sfxDeactivate();
    }
    prevActive = active;
  });

  // ── SFX: Tool & Step events ──
  let lastFeedLen = 0;
  $effect(() => {
    const items = feed;
    if (items.length > lastFeedLen) {
      // Play SFX for each new item
      for (let i = lastFeedLen; i < items.length; i++) {
        const kind = items[i].event.kind;
        switch (kind) {
          case "tool_start": sfxToolStart(); break;
          case "tool_done": sfxToolDone(); break;
          case "tool_error": sfxToolError(); break;
          case "step_start":
          case "step_finish": sfxStepTick(); break;
        }
      }
    }
    lastFeedLen = items.length;
  });

  // ── SFX: Reasoning pulse (throttled — max once per 5s) ──
  let lastReasoningPulse = 0;
  $effect(() => {
    if (reasoningItems.length > 0) {
      const now = Date.now();
      if (now - lastReasoningPulse > 5000) {
        sfxReasoningPulse();
        lastReasoningPulse = now;
      }
    }
  });

  function toolIcon(kind: string): string {
    switch (kind) {
      case "tool_start": return "⚡";
      case "tool_done": return "✓";
      case "tool_error": return "✗";
      case "step_start": return "▶";
      case "step_finish": return "■";
      default: return "·";
    }
  }

  function toolLabel(item: ActivityItem): string {
    const e = item.event;
    switch (e.kind) {
      case "tool_start": return e.tool;
      case "tool_done": return `${e.tool} (${e.elapsed}ms)`;
      case "tool_error": return `${e.tool} ERR`;
      case "step_start": return "STEP";
      case "step_finish": return `$${e.cost.toFixed(4)}`;
      default: return "";
    }
  }

  function toolDetail(item: ActivityItem): string {
    const e = item.event;
    switch (e.kind) {
      case "tool_start": return e.input || "...";
      case "tool_done": return e.output.slice(0, 60);
      case "tool_error": return e.error;
      case "step_finish": return `in:${e.tokens.input} out:${e.tokens.output}`;
      default: return "";
    }
  }

  let feedEl: HTMLDivElement | undefined = $state(undefined);

  // Auto-scroll feed to bottom
  $effect(() => {
    if (feedEl && toolItems.length > 0) {
      feedEl.scrollTop = feedEl.scrollHeight;
    }
  });
</script>

<div class="side-hud" class:active class:high={intensity === "high"} class:medium={intensity === "medium"}>
  <!-- ===== LEFT PANEL — Reasoning ===== -->
  <div class="panel panel-left">
    <div class="scan-line"></div>

    <svg class="bracket bracket-top" viewBox="0 0 60 120" fill="none">
      <path d="M58 2 H20 L2 20 V100 L20 118 H58" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="10" cy="20" r="2" fill="currentColor" opacity="0.8"/>
      <circle cx="10" cy="100" r="2" fill="currentColor" opacity="0.8"/>
    </svg>

    <div class="panel-content">
      <div class="panel-header">
        <span class="panel-icon">🧠</span>
        <span class="panel-title">REASONING</span>
        <span class="panel-dot" class:blink={state === "thinking" && reasoningItems.length > 0}></span>
      </div>

      {#if latestReasoning}
        <div class="reasoning-text">
          {latestReasoning}
          <span class="cursor-blink">|</span>
        </div>
      {:else if state === "thinking"}
        <div class="reasoning-placeholder">
          <span class="loading-dot">·</span>
          <span class="loading-dot d2">·</span>
          <span class="loading-dot d3">·</span>
        </div>
      {/if}

      <!-- Decorative data bars -->
      <div class="deco-section">
        <div class="data-label">SYS</div>
        <div class="data-bars">
          <span class="bar bar-1"></span>
          <span class="bar bar-2"></span>
          <span class="bar bar-3"></span>
          <span class="bar bar-4"></span>
          <span class="bar bar-5"></span>
        </div>
        <div class="data-label">MEM</div>
        <div class="progress-track">
          <div class="progress-fill"></div>
        </div>
      </div>
    </div>

    <svg class="bracket bracket-bottom" viewBox="0 0 60 120" fill="none">
      <path d="M58 118 H20 L2 100 V20 L20 2 H58" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>

    <svg class="circuit-trace" viewBox="0 0 40 300" fill="none">
      <path d="M20 0 V60 L35 75 V120 L15 140 V200 L30 215 V260 L10 280 V300" stroke="currentColor" stroke-width="0.6" stroke-dasharray="4 6" class="trace-path"/>
      <circle cx="20" cy="60" r="2" fill="currentColor" class="trace-node n1"/>
      <circle cx="35" cy="120" r="1.5" fill="currentColor" class="trace-node n2"/>
      <circle cx="15" cy="200" r="2" fill="currentColor" class="trace-node n3"/>
      <circle cx="30" cy="260" r="1.5" fill="currentColor" class="trace-node n4"/>
    </svg>
  </div>

  <!-- ===== RIGHT PANEL — Tool Calls / Steps ===== -->
  <div class="panel panel-right">
    <div class="scan-line"></div>

    <svg class="bracket bracket-top" viewBox="0 0 60 120" fill="none">
      <path d="M2 2 H40 L58 20 V100 L40 118 H2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="50" cy="20" r="2" fill="currentColor" opacity="0.8"/>
      <circle cx="50" cy="100" r="2" fill="currentColor" opacity="0.8"/>
    </svg>

    <div class="panel-content">
      <div class="panel-header">
        <span class="panel-icon">⚙</span>
        <span class="panel-title">TOOLS</span>
        {#if taskCount > 0}
          <span class="task-badge">{taskCount}</span>
        {/if}
      </div>

      <div class="tool-feed" bind:this={feedEl}>
        {#each toolItems.slice(-12) as item (item.id)}
          <div class="feed-item" class:is-start={item.event.kind === "tool_start" || item.event.kind === "step_start"} class:is-done={item.event.kind === "tool_done" || item.event.kind === "step_finish"} class:is-error={item.event.kind === "tool_error"}>
            <span class="feed-icon" class:spin={item.event.kind === "tool_start"}>{toolIcon(item.event.kind)}</span>
            <div class="feed-body">
              <div class="feed-label">{toolLabel(item)}</div>
              {#if toolDetail(item)}
                <div class="feed-detail">{toolDetail(item)}</div>
              {/if}
            </div>
          </div>
        {/each}
        {#if toolItems.length === 0 && state === "thinking"}
          <div class="feed-empty">
            <div class="ring-indicator">
              <svg viewBox="0 0 30 30" fill="none">
                <circle cx="15" cy="15" r="12" stroke="currentColor" stroke-width="0.6" opacity="0.3"/>
                <circle cx="15" cy="15" r="8" stroke="currentColor" stroke-width="0.8" stroke-dasharray="8 4" class="ring-spin"/>
                <circle cx="15" cy="15" r="3" fill="currentColor" opacity="0.6"/>
              </svg>
            </div>
            <span class="feed-empty-text">STANDBY</span>
          </div>
        {/if}
      </div>
    </div>

    <svg class="bracket bracket-bottom" viewBox="0 0 60 120" fill="none">
      <path d="M2 118 H40 L58 100 V20 L40 2 H2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>

    <svg class="circuit-trace" viewBox="0 0 40 300" fill="none">
      <path d="M20 0 V50 L5 70 V130 L25 150 V210 L10 225 V270 L25 285 V300" stroke="currentColor" stroke-width="0.6" stroke-dasharray="4 6" class="trace-path"/>
      <circle cx="20" cy="50" r="2" fill="currentColor" class="trace-node n1"/>
      <circle cx="5" cy="130" r="1.5" fill="currentColor" class="trace-node n2"/>
      <circle cx="25" cy="210" r="2" fill="currentColor" class="trace-node n3"/>
      <circle cx="10" cy="270" r="1.5" fill="currentColor" class="trace-node n4"/>
    </svg>
  </div>

  <!-- ===== CORNER DECORATIONS ===== -->
  <div class="corner corner-tl">
    <svg viewBox="0 0 80 80" fill="none">
      <path d="M0 30 L0 8 Q0 0 8 0 L30 0" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="30" cy="0" r="2" fill="currentColor"/>
    </svg>
  </div>
  <div class="corner corner-tr">
    <svg viewBox="0 0 80 80" fill="none">
      <path d="M80 30 L80 8 Q80 0 72 0 L50 0" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="50" cy="0" r="2" fill="currentColor"/>
    </svg>
  </div>
  <div class="corner corner-bl">
    <svg viewBox="0 0 80 80" fill="none">
      <path d="M0 50 L0 72 Q0 80 8 80 L30 80" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="30" cy="80" r="2" fill="currentColor"/>
    </svg>
  </div>
  <div class="corner corner-br">
    <svg viewBox="0 0 80 80" fill="none">
      <path d="M80 50 L80 72 Q80 80 72 80 L50 80" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="50" cy="80" r="2" fill="currentColor"/>
    </svg>
  </div>

  <!-- Horizontal scan beam -->
  <div class="h-scan-beam"></div>
</div>

<style>
  .side-hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 15;
    opacity: 0;
    transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .side-hud.active {
    opacity: 1;
  }

  /* === PANELS === */
  .panel {
    position: absolute;
    top: 60px;
    bottom: 80px;
    width: 220px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    color: rgba(0, 212, 255, 0.55);
    transition: color 0.4s;
  }

  .side-hud.high .panel { color: rgba(0, 212, 255, 0.8); }
  .side-hud.medium .panel { color: rgba(0, 212, 255, 0.65); }

  .panel-left { left: 6px; }
  .panel-right { right: 6px; }

  /* === SCAN LINE === */
  .scan-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(0, 212, 255, 0.05) 20%,
      rgba(0, 212, 255, 0.5) 48%,
      rgba(123, 97, 255, 0.6) 50%,
      rgba(0, 212, 255, 0.5) 52%,
      rgba(0, 212, 255, 0.05) 80%,
      transparent 100%
    );
    opacity: 0;
  }

  .panel-left .scan-line { right: 0; }
  .panel-right .scan-line { left: 0; }

  .side-hud.active .scan-line {
    opacity: 1;
    animation: scanVertical 3s linear infinite;
  }

  .side-hud.high .scan-line { animation-duration: 1.8s; }

  @keyframes scanVertical {
    0% { clip-path: inset(0 0 100% 0); }
    50% { clip-path: inset(0 0 0 0); }
    50.01% { clip-path: inset(100% 0 0 0); }
    100% { clip-path: inset(0 0 0 0); }
  }

  /* === BRACKETS === */
  .bracket {
    width: 36px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.5s ease;
    align-self: center;
  }

  .side-hud.active .bracket {
    opacity: 1;
    animation: bracketFade 0.6s ease-out forwards;
  }

  @keyframes bracketFade {
    from { opacity: 0; transform: scaleY(0.8); }
    to { opacity: 1; transform: scaleY(1); }
  }

  /* === PANEL CONTENT (shared) === */
  .panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 8px;
    min-height: 0;
    opacity: 0;
    transition: opacity 0.5s ease 0.2s;
    overflow: hidden;
  }

  .side-hud.active .panel-content { opacity: 1; }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 5px;
    padding-bottom: 4px;
    border-bottom: 1px solid rgba(0, 212, 255, 0.15);
    flex-shrink: 0;
  }

  .panel-icon {
    font-size: 13px;
    line-height: 1;
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: rgba(0, 212, 255, 0.6);
    font-family: "Courier New", monospace;
  }

  .side-hud.high .panel-title {
    color: rgba(0, 212, 255, 0.95);
    text-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
  }

  .panel-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgba(0, 212, 255, 0.3);
    margin-left: auto;
  }

  .panel-dot.blink {
    background: rgba(0, 212, 255, 0.9);
    box-shadow: 0 0 6px rgba(0, 212, 255, 0.5);
    animation: dotBlink 0.8s ease-in-out infinite;
  }

  @keyframes dotBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .task-badge {
    margin-left: auto;
    font-size: 10px;
    font-weight: 700;
    font-family: "Courier New", monospace;
    color: #0a0a0f;
    background: rgba(0, 212, 255, 0.8);
    padding: 1px 4px;
    border-radius: 3px;
    line-height: 1.2;
  }

  /* === LEFT PANEL: REASONING === */
  .reasoning-text {
    flex: 1;
    font-size: 12px;
    line-height: 1.6;
    color: rgba(0, 212, 255, 0.7);
    font-family: "Courier New", monospace;
    overflow: hidden;
    word-break: break-all;
    mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  }

  .side-hud.high .reasoning-text {
    color: rgba(0, 212, 255, 0.9);
  }

  .cursor-blink {
    animation: cursorBlink 0.7s step-end infinite;
    color: rgba(0, 212, 255, 0.9);
  }

  @keyframes cursorBlink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .reasoning-placeholder {
    display: flex;
    gap: 4px;
    justify-content: center;
    padding: 12px 0;
  }

  .loading-dot {
    font-size: 16px;
    color: rgba(0, 212, 255, 0.5);
    animation: loadDot 1.4s ease-in-out infinite;
  }

  .loading-dot.d2 { animation-delay: 0.2s; }
  .loading-dot.d3 { animation-delay: 0.4s; }

  @keyframes loadDot {
    0%, 100% { opacity: 0.3; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(-4px); }
  }

  /* Decorative section (bottom of left panel) */
  .deco-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid rgba(0, 212, 255, 0.08);
    flex-shrink: 0;
    margin-top: auto;
  }

  .data-label {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: rgba(0, 212, 255, 0.4);
    font-family: "Courier New", monospace;
  }

  .side-hud.high .data-label {
    color: rgba(0, 212, 255, 0.7);
  }

  .data-bars {
    display: flex;
    gap: 2px;
    align-items: flex-end;
    height: 16px;
  }

  .bar {
    width: 4px;
    background: rgba(0, 212, 255, 0.4);
    border-radius: 1px;
  }

  .side-hud.active .bar { animation: barPulse 1.2s ease-in-out infinite; }
  .side-hud.high .bar {
    background: rgba(0, 212, 255, 0.7);
    box-shadow: 0 0 4px rgba(0, 212, 255, 0.3);
  }

  .bar-1 { height: 6px; animation-delay: 0s !important; }
  .bar-2 { height: 12px; animation-delay: 0.1s !important; }
  .bar-3 { height: 8px; animation-delay: 0.2s !important; }
  .bar-4 { height: 14px; animation-delay: 0.3s !important; }
  .bar-5 { height: 10px; animation-delay: 0.15s !important; }

  @keyframes barPulse {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(1.6); }
  }

  .progress-track {
    width: 90%;
    height: 3px;
    background: rgba(0, 212, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    width: 30%;
    background: linear-gradient(90deg, rgba(0, 212, 255, 0.6), rgba(123, 97, 255, 0.6));
    border-radius: 2px;
  }

  .side-hud.active .progress-fill { animation: progressSweep 2.5s ease-in-out infinite; }
  .side-hud.high .progress-fill { animation-duration: 1.2s; }

  @keyframes progressSweep {
    0% { width: 10%; margin-left: 0; }
    50% { width: 80%; margin-left: 10%; }
    100% { width: 10%; margin-left: 90%; }
  }

  /* === RIGHT PANEL: TOOL FEED === */
  .tool-feed {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    min-height: 0;
  }

  .tool-feed::-webkit-scrollbar { display: none; }

  .feed-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 5px 6px;
    border-radius: 4px;
    background: rgba(0, 212, 255, 0.03);
    border-left: 2px solid rgba(0, 212, 255, 0.2);
    animation: feedSlideIn 0.3s ease-out;
    flex-shrink: 0;
  }

  .feed-item.is-start {
    border-left-color: rgba(0, 212, 255, 0.6);
    background: rgba(0, 212, 255, 0.06);
  }

  .feed-item.is-done {
    border-left-color: rgba(85, 255, 153, 0.5);
  }

  .feed-item.is-error {
    border-left-color: rgba(255, 85, 119, 0.5);
  }

  @keyframes feedSlideIn {
    from { opacity: 0; transform: translateX(8px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .feed-icon {
    font-size: 12px;
    flex-shrink: 0;
    width: 16px;
    text-align: center;
    line-height: 1.4;
    color: rgba(0, 212, 255, 0.8);
  }

  .feed-icon.spin {
    animation: iconSpin 1s linear infinite;
  }

  @keyframes iconSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .feed-body {
    min-width: 0;
    flex: 1;
  }

  .feed-label {
    font-size: 11px;
    font-weight: 600;
    font-family: "Courier New", monospace;
    color: rgba(0, 212, 255, 0.8);
    letter-spacing: 0.05em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feed-detail {
    font-size: 9px;
    font-family: "Courier New", monospace;
    color: rgba(0, 212, 255, 0.45);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }

  .feed-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 16px 0;
    opacity: 0.6;
  }

  .ring-indicator {
    width: 28px;
    height: 28px;
  }

  .ring-spin {
    transform-origin: center;
    animation: ringSpin 3s linear infinite;
  }

  .side-hud.high .ring-spin { animation-duration: 1s; }

  @keyframes ringSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .feed-empty-text {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: rgba(0, 212, 255, 0.4);
    font-family: "Courier New", monospace;
  }

  /* === CIRCUIT TRACES === */
  .circuit-trace {
    position: absolute;
    width: 24px;
    top: 10%;
    bottom: 10%;
    opacity: 0;
    transition: opacity 0.6s ease 0.3s;
  }

  .panel-left .circuit-trace { left: -8px; }
  .panel-right .circuit-trace { right: -8px; }

  .side-hud.active .circuit-trace { opacity: 0.6; }

  .side-hud.active .trace-path { animation: traceFlow 4s linear infinite; }
  .side-hud.high .trace-path { animation-duration: 2s; }

  @keyframes traceFlow {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -40; }
  }

  .trace-node { opacity: 0.3; }
  .side-hud.active .trace-node { animation: nodeGlow 2s ease-in-out infinite; }

  .n1 { animation-delay: 0s !important; }
  .n2 { animation-delay: 0.5s !important; }
  .n3 { animation-delay: 1s !important; }
  .n4 { animation-delay: 1.5s !important; }

  @keyframes nodeGlow {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 1; }
  }

  /* === CORNERS === */
  .corner {
    position: absolute;
    width: 50px;
    height: 50px;
    color: rgba(0, 212, 255, 0.35);
    opacity: 0;
    transition: opacity 0.5s ease 0.15s;
  }

  .side-hud.active .corner { opacity: 1; }
  .side-hud.high .corner { color: rgba(0, 212, 255, 0.6); }

  .corner-tl { top: 50px; left: 8px; }
  .corner-tr { top: 50px; right: 8px; }
  .corner-bl { bottom: 70px; left: 8px; }
  .corner-br { bottom: 70px; right: 8px; }

  .corner svg { width: 100%; height: 100%; }

  /* === HORIZONTAL SCAN BEAM === */
  .h-scan-beam {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(0, 212, 255, 0.05) 10%,
      rgba(0, 212, 255, 0.3) 30%,
      rgba(123, 97, 255, 0.4) 50%,
      rgba(0, 212, 255, 0.3) 70%,
      rgba(0, 212, 255, 0.05) 90%,
      transparent 100%
    );
    opacity: 0;
  }

  .side-hud.active .h-scan-beam {
    opacity: 1;
    animation: hScan 4s linear infinite;
  }

  .side-hud.high .h-scan-beam {
    animation-duration: 2.5s;
    height: 2px;
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.15);
  }

  @keyframes hScan {
    0% { top: 5%; }
    100% { top: 95%; }
  }

  /* === RESPONSIVE === */
  @media (max-width: 900px) {
    .panel { width: 160px; }
    .reasoning-text { font-size: 11px; }
    .feed-label { font-size: 10px; }
    .feed-detail { font-size: 8px; }
  }

  @media (max-width: 700px) {
    .panel { width: 100px; }
    .panel-left { left: 2px; }
    .panel-right { right: 2px; }
    .bracket { width: 24px; }
    .panel-title { font-size: 8px; }
    .reasoning-text { font-size: 9px; line-height: 1.4; }
    .feed-label { font-size: 8px; }
    .feed-detail { display: none; }
    .circuit-trace { display: none; }
    .corner { width: 35px; height: 35px; }
    .deco-section { display: none; }
  }

  @media (max-width: 400px) {
    .panel { width: 65px; }
    .panel-content { padding: 4px 3px; }
    .panel-header { gap: 2px; }
    .panel-icon { display: none; }
    .reasoning-text { font-size: 7px; }
    .corner { width: 25px; height: 25px; }
  }
</style>
