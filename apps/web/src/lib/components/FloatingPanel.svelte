<script lang="ts">
  /**
   * FloatingPanel — Reusable draggable + closable holographic window.
   * Used for AI response, user STT, errors, and task notifications.
   * Sci-fi style: angular clip-path frame, corner brackets, scanline, header drag handle.
   */
  import type { Snippet } from "svelte";

  type Tone = "cyan" | "purple" | "danger" | "gold" | "success";

  interface Props {
    panelId: string;            // unique key for localStorage position memory
    tag: string;                // header label (e.g. "JARVIS / RESPONSE")
    channel?: string;           // small ID shown right of tag
    tone?: Tone;
    defaultX?: number;          // default left in px (or pct via vw)
    defaultY?: number;          // default top in px
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    pulse?: boolean;            // breathing glow
    rememberPosition?: boolean; // persist to localStorage (default true)
    onClose?: () => void;
    children?: Snippet;
  }

  let {
    panelId,
    tag,
    channel,
    tone = "cyan",
    defaultX = 80,
    defaultY = 80,
    defaultWidth = 380,
    minWidth = 220,
    maxWidth = 520,
    pulse = false,
    rememberPosition = true,
    onClose,
    children,
  }: Props = $props();

  const STORAGE_KEY = `holo-pos:${panelId}`;

  // Initial position — try restore from localStorage (when remembered)
  function loadPos(): { x: number; y: number } {
    if (!rememberPosition) return { x: defaultX, y: defaultY };
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.x === "number" && typeof p.y === "number") return p;
      }
    } catch {}
    return { x: defaultX, y: defaultY };
  }

  let pos = $state(loadPos());
  let dragging = $state(false);
  let dragOffset = { x: 0, y: 0 };

  function clampToViewport(x: number, y: number, w: number, h: number) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      x: Math.max(8, Math.min(vw - w - 8, x)),
      y: Math.max(8, Math.min(vh - h - 8, y)),
    };
  }

  let panelEl: HTMLDivElement | undefined = $state(undefined);

  function startDrag(e: PointerEvent) {
    if (!panelEl) return;
    // Don't start drag from interactive elements
    const target = e.target as HTMLElement;
    if (target.closest(".fp-close")) return;
    dragging = true;
    const rect = panelEl.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    panelEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onDragMove(e: PointerEvent) {
    if (!dragging || !panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    const next = clampToViewport(
      e.clientX - dragOffset.x,
      e.clientY - dragOffset.y,
      rect.width,
      rect.height,
    );
    pos = next;
  }

  function endDrag(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    panelEl?.releasePointerCapture(e.pointerId);
    if (rememberPosition) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
      } catch {}
    }
  }

  function resetPos() {
    pos = { x: defaultX, y: defaultY };
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // Re-clamp on viewport resize
  $effect(() => {
    function handle() {
      if (!panelEl) return;
      const rect = panelEl.getBoundingClientRect();
      pos = clampToViewport(pos.x, pos.y, rect.width, rect.height);
    }
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  });
</script>

<div
  bind:this={panelEl}
  class="fp"
  class:tone-cyan={tone === "cyan"}
  class:tone-purple={tone === "purple"}
  class:tone-danger={tone === "danger"}
  class:tone-gold={tone === "gold"}
  class:tone-success={tone === "success"}
  class:pulse
  class:dragging
  style="left: {pos.x}px; top: {pos.y}px; width: {defaultWidth}px; min-width: {minWidth}px; max-width: {maxWidth}px;"
  onpointermove={onDragMove}
  onpointerup={endDrag}
  onpointercancel={endDrag}
>
  <!-- Corner brackets -->
  <span class="fp-bracket tl"></span>
  <span class="fp-bracket tr"></span>
  <span class="fp-bracket bl"></span>
  <span class="fp-bracket br"></span>

  <!-- Header (drag handle) -->
  <div
    class="fp-header"
    role="button"
    tabindex="0"
    onpointerdown={startDrag}
    ondblclick={resetPos}
    title="按住拖曳 · 雙擊重置位置"
  >
    <span class="fp-dot"></span>
    <span class="fp-tag">{tag}</span>
    {#if channel}
      <span class="fp-channel">{channel}</span>
    {/if}
    {#if onClose}
      <button class="fp-close" onclick={onClose} title="關閉" aria-label="關閉視窗">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square">
          <path d="M3 3 L13 13 M13 3 L3 13" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Body -->
  <div class="fp-body">
    {@render children?.()}
  </div>

  <!-- Scanline overlay -->
  <div class="fp-scanline" aria-hidden="true"></div>
</div>

<style>
  .fp {
    position: fixed;
    z-index: 60;
    background:
      linear-gradient(135deg, rgba(0, 22, 40, 0.84) 0%, rgba(8, 12, 28, 0.88) 100%);
    backdrop-filter: blur(18px) saturate(1.5);
    -webkit-backdrop-filter: blur(18px) saturate(1.5);
    clip-path: polygon(
      0 0,
      calc(100% - 18px) 0,
      100% 18px,
      100% 100%,
      18px 100%,
      0 calc(100% - 18px)
    );
    border: 1px solid rgba(0, 212, 255, 0.4);
    box-shadow:
      0 0 0 1px rgba(0, 212, 255, 0.08),
      0 8px 40px rgba(0, 212, 255, 0.18),
      0 0 80px rgba(0, 212, 255, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
    animation: fpMaterialize 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    overflow: hidden;
    isolation: isolate;
    user-select: none;
    pointer-events: auto;
  }
  .fp.dragging { cursor: grabbing; transition: none; box-shadow: 0 12px 60px rgba(0,212,255,0.35); }

  /* === Tones === */
  .fp.tone-purple {
    background: linear-gradient(135deg, rgba(20,12,40,0.84) 0%, rgba(8,8,24,0.88) 100%);
    border-color: rgba(123,97,255,0.45);
    box-shadow: 0 0 0 1px rgba(123,97,255,0.1), 0 8px 40px rgba(123,97,255,0.2), 0 0 80px rgba(123,97,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04);
  }
  .fp.tone-danger {
    background: linear-gradient(135deg, rgba(40,8,16,0.86) 0%, rgba(20,4,10,0.9) 100%);
    border-color: rgba(255,85,119,0.55);
    box-shadow: 0 0 0 1px rgba(255,85,119,0.15), 0 8px 40px rgba(255,85,119,0.25), 0 0 100px rgba(255,85,119,0.1);
  }
  .fp.tone-gold {
    background: linear-gradient(135deg, rgba(40,30,8,0.84) 0%, rgba(20,16,4,0.88) 100%);
    border-color: rgba(232,184,48,0.5);
    box-shadow: 0 0 0 1px rgba(232,184,48,0.12), 0 8px 40px rgba(232,184,48,0.22), 0 0 80px rgba(232,184,48,0.1);
  }
  .fp.tone-success {
    background: linear-gradient(135deg, rgba(8,32,20,0.84) 0%, rgba(4,18,12,0.88) 100%);
    border-color: rgba(85,255,153,0.45);
    box-shadow: 0 0 0 1px rgba(85,255,153,0.12), 0 8px 40px rgba(85,255,153,0.2), 0 0 80px rgba(85,255,153,0.08);
  }

  /* === Brackets === */
  .fp-bracket {
    position: absolute;
    width: 12px;
    height: 12px;
    border-color: var(--accent);
    pointer-events: none;
    z-index: 2;
  }
  .fp-bracket.tl { top: 4px; left: 4px; border-top: 2px solid; border-left: 2px solid; }
  .fp-bracket.tr { top: 4px; right: 4px; border-top: 2px solid; border-right: 2px solid; }
  .fp-bracket.bl { bottom: 4px; left: 4px; border-bottom: 2px solid; border-left: 2px solid; }
  .fp-bracket.br { bottom: 4px; right: 4px; border-bottom: 2px solid; border-right: 2px solid; }
  .fp.tone-purple .fp-bracket { border-color: var(--purple); }
  .fp.tone-danger .fp-bracket { border-color: var(--danger); }
  .fp.tone-gold .fp-bracket { border-color: var(--gold); }
  .fp.tone-success .fp-bracket { border-color: var(--success); }

  /* === Header === */
  .fp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 8px;
    margin: 4px 4px 0;
    border-bottom: 1px dashed rgba(0, 212, 255, 0.22);
    font-family: var(--font-mono);
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    cursor: grab;
    touch-action: none;
  }
  .fp-header:active { cursor: grabbing; }
  .fp.tone-purple .fp-header { border-bottom-color: rgba(123,97,255,0.25); }
  .fp.tone-danger .fp-header { border-bottom-color: rgba(255,85,119,0.3); }
  .fp.tone-gold .fp-header { border-bottom-color: rgba(232,184,48,0.3); }
  .fp.tone-success .fp-header { border-bottom-color: rgba(85,255,153,0.3); }

  .fp-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
    animation: fpDot 1.6s ease-in-out infinite;
    flex-shrink: 0;
  }
  .fp.tone-purple .fp-dot { background: var(--purple); box-shadow: 0 0 8px var(--purple); }
  .fp.tone-danger .fp-dot { background: var(--danger); box-shadow: 0 0 8px var(--danger); animation-duration: 0.7s; }
  .fp.tone-gold .fp-dot { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
  .fp.tone-success .fp-dot { background: var(--success); box-shadow: 0 0 8px var(--success); }

  .fp-tag {
    color: var(--accent);
    font-weight: 600;
    flex: 1;
    text-shadow: 0 0 8px rgba(0,212,255,0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fp.tone-purple .fp-tag { color: var(--purple); text-shadow: 0 0 8px rgba(123,97,255,0.5); }
  .fp.tone-danger .fp-tag { color: var(--danger); text-shadow: 0 0 8px rgba(255,85,119,0.5); }
  .fp.tone-gold .fp-tag { color: var(--gold); text-shadow: 0 0 8px rgba(232,184,48,0.5); }
  .fp.tone-success .fp-tag { color: var(--success); text-shadow: 0 0 8px rgba(85,255,153,0.5); }

  .fp-channel {
    color: rgba(200, 220, 255, 0.4);
    font-size: 0.58rem;
    flex-shrink: 0;
  }

  .fp-close {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(200, 220, 255, 0.55);
    background: transparent;
    border: 1px solid rgba(0, 212, 255, 0.22);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    clip-path: polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px);
  }
  .fp-close svg { width: 11px; height: 11px; }
  .fp-close:hover {
    color: var(--accent);
    border-color: var(--accent);
    background: rgba(0, 212, 255, 0.1);
    box-shadow: 0 0 10px rgba(0, 212, 255, 0.4);
  }
  .fp.tone-danger .fp-close:hover { color: var(--danger); border-color: var(--danger); box-shadow: 0 0 10px rgba(255,85,119,0.5); }

  /* === Body === */
  .fp-body {
    padding: 10px 16px 14px;
    user-select: text;
  }

  /* === Scanline === */
  .fp-scanline {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg,
      transparent 0%,
      rgba(0, 212, 255, 0.04) 48%,
      rgba(0, 212, 255, 0.12) 50%,
      rgba(0, 212, 255, 0.04) 52%,
      transparent 100%);
    background-size: 100% 200%;
    animation: fpScan 4.5s linear infinite;
    mix-blend-mode: screen;
    opacity: 0.6;
    z-index: 1;
  }
  .fp.tone-purple .fp-scanline { background: linear-gradient(180deg, transparent 0%, rgba(123,97,255,0.04) 48%, rgba(123,97,255,0.12) 50%, rgba(123,97,255,0.04) 52%, transparent 100%); background-size: 100% 200%; }
  .fp.tone-danger .fp-scanline { background: linear-gradient(180deg, transparent 0%, rgba(255,85,119,0.04) 48%, rgba(255,85,119,0.14) 50%, rgba(255,85,119,0.04) 52%, transparent 100%); background-size: 100% 200%; }
  .fp.tone-gold .fp-scanline { background: linear-gradient(180deg, transparent 0%, rgba(232,184,48,0.04) 48%, rgba(232,184,48,0.12) 50%, rgba(232,184,48,0.04) 52%, transparent 100%); background-size: 100% 200%; }

  /* Pulse glow */
  .fp.pulse {
    animation: fpMaterialize 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2),
               fpBreath 2.4s ease-in-out 0.4s infinite;
  }

  @keyframes fpMaterialize {
    from { opacity: 0; transform: scale(0.94); filter: blur(6px); }
    to   { opacity: 1; transform: scale(1); filter: blur(0); }
  }
  @keyframes fpScan {
    0%   { background-position: 0 -100%; }
    100% { background-position: 0 100%; }
  }
  @keyframes fpDot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.85); }
  }
  @keyframes fpBreath {
    0%, 100% { box-shadow: 0 0 0 1px rgba(0,212,255,0.1), 0 8px 50px rgba(0,212,255,0.22), 0 0 120px rgba(0,212,255,0.12), inset 0 1px 0 rgba(255,255,255,0.05); }
    50%      { box-shadow: 0 0 0 1px rgba(0,212,255,0.25), 0 12px 70px rgba(0,212,255,0.36), 0 0 160px rgba(0,212,255,0.22), inset 0 1px 0 rgba(255,255,255,0.08); }
  }

  /* Mobile: panels go full-width at bottom, NOT draggable horizontally */
  @media (max-width: 900px) {
    .fp {
      left: 12px !important;
      right: 12px !important;
      width: auto !important;
      max-width: none !important;
      min-width: 0 !important;
    }
    .fp-header { cursor: default; }
  }
</style>
