<script lang="ts">
  /**
   * Full-screen YouTube overlay — Sci-fi HUD style
   * Plays a specific video by ID: [ACTION:YOUTUBE:hN5MBlGv2Ac]
   * AI uses websearch to find the video ID before outputting the action.
   */
  interface Props {
    videoId: string;
    onClose: () => void;
  }

  let { videoId, onClose }: Props = $props();
  let loaded = $state(false);

  const embedUrl = $derived(
    `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`
  );
</script>

<div class="yt-overlay" class:active={true}>
  <!-- YouTube iframe (background layer) -->
  <div class="yt-body">
    {#if !loaded}
      <div class="yt-loading">
        <div class="loading-ring"></div>
        <span>LOADING VIDEO...</span>
      </div>
    {/if}
    <!-- @ts-ignore: anonymous is a valid attribute for cross-origin iframe isolation -->
    <iframe
      src={embedUrl}
      class="yt-frame"
      class:visible={loaded}
      title="YouTube video player"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      anonymous
      credentialless
      onload={() => loaded = true}
    ></iframe>
  </div>

  <!-- HUD Overlay elements -->
  <div class="scan-line"></div>
  <div class="vignette"></div>

  <!-- Corner brackets -->
  <div class="bracket tl"></div>
  <div class="bracket tr"></div>
  <div class="bracket bl"></div>
  <div class="bracket br"></div>

  <!-- Top HUD info -->
  <div class="hud-top">
    <div class="hud-top-left">
      <div class="yt-badge">
        <span class="yt-icon">▶</span>
        <span class="yt-text">VIDEO</span>
      </div>
      <span class="hud-data">{videoId}</span>
    </div>
    <div class="hud-top-right">
      <span class="hud-data">STREAMING</span>
      <button class="close-btn" onclick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Side data strips -->
  <div class="hud-side left">
    <div class="data-bar"></div>
    <div class="data-bar short"></div>
    <div class="data-bar"></div>
  </div>
  <div class="hud-side right">
    <div class="data-bar"></div>
    <div class="data-bar short"></div>
    <div class="data-bar"></div>
  </div>

  <!-- Bottom hint -->
  <div class="hud-bottom">
    <span class="hud-hint">影片播放中 · 語音可下達新指令</span>
  </div>
</div>

<style>
  .yt-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    overflow: hidden;
  }

  .yt-overlay.active {
    transform: translateX(0);
    pointer-events: all;
  }

  /* YouTube body */
  .yt-body {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px 40px;
  }

  .yt-frame {
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  .yt-frame.visible {
    opacity: 1;
  }

  .yt-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: rgba(255, 0, 80, 0.6);
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    font-weight: 300;
  }

  .loading-ring {
    width: 40px;
    height: 40px;
    border: 2px solid rgba(255, 0, 80, 0.1);
    border-top-color: rgba(255, 0, 80, 0.8);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* Scan line */
  .scan-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 0, 80, 0.4) 50%, transparent 100%);
    box-shadow: 0 0 12px rgba(255, 0, 80, 0.3);
    animation: scanMove 5s linear infinite;
    z-index: 10;
    pointer-events: none;
  }

  /* Vignette */
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.6) 100%);
    pointer-events: none;
    z-index: 5;
  }

  /* Corner brackets */
  .bracket {
    position: absolute;
    width: 40px;
    height: 40px;
    z-index: 15;
    pointer-events: none;
  }

  .bracket::before,
  .bracket::after {
    content: '';
    position: absolute;
    background: rgba(255, 0, 80, 0.6);
    box-shadow: 0 0 6px rgba(255, 0, 80, 0.3);
  }

  .bracket::before {
    width: 100%;
    height: 1.5px;
  }

  .bracket::after {
    width: 1.5px;
    height: 100%;
  }

  .bracket.tl { top: 20px; left: 20px; }
  .bracket.tl::before { top: 0; left: 0; }
  .bracket.tl::after { top: 0; left: 0; }

  .bracket.tr { top: 20px; right: 20px; }
  .bracket.tr::before { top: 0; right: 0; }
  .bracket.tr::after { top: 0; right: 0; }

  .bracket.bl { bottom: 20px; left: 20px; }
  .bracket.bl::before { bottom: 0; left: 0; }
  .bracket.bl::after { bottom: 0; left: 0; }

  .bracket.br { bottom: 20px; right: 20px; }
  .bracket.br::before { bottom: 0; right: 0; }
  .bracket.br::after { bottom: 0; right: 0; }

  /* Top HUD */
  .hud-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
    z-index: 20;
    pointer-events: none;
  }

  .hud-top-left,
  .hud-top-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .yt-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(255, 0, 80, 0.12);
    border: 1px solid rgba(255, 0, 80, 0.3);
  }

  .yt-icon {
    font-size: 0.6rem;
    color: #ff0050;
  }

  .yt-text {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #ff0050;
  }

  .hud-data {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.08em;
    font-weight: 300;
  }

  .close-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 0, 80, 0.2);
    color: rgba(255, 255, 255, 0.6);
    transition: all 0.2s;
    pointer-events: all;
    cursor: pointer;
  }

  .close-btn:hover {
    background: rgba(255, 85, 119, 0.2);
    border-color: rgba(255, 85, 119, 0.5);
    color: #ff5577;
  }

  /* Side data strips */
  .hud-side {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 15;
    pointer-events: none;
  }

  .hud-side.left { left: 12px; }
  .hud-side.right { right: 12px; }

  .data-bar {
    width: 3px;
    height: 20px;
    background: rgba(255, 0, 80, 0.3);
    border-radius: 2px;
    animation: flicker 2s infinite alternate;
  }

  .data-bar.short {
    height: 12px;
    opacity: 0.5;
  }

  /* Bottom */
  .hud-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    padding: 16px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
    z-index: 20;
    pointer-events: none;
  }

  .hud-hint {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.1em;
  }

  /* Animations */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes scanMove {
    0% { top: -2px; }
    100% { top: 100%; }
  }

  @keyframes flicker {
    0% { opacity: 0.3; }
    100% { opacity: 0.8; }
  }
</style>
