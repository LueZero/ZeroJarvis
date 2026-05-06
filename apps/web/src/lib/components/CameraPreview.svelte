<script lang="ts">
  /**
   * Full-screen camera overlay — Sci-fi HUD style
   * Slides in from right, with scanning lines, targeting reticle, and holographic UI
   */
  import { openCamera, closeCamera, captureFrame, isCameraOpen } from "$lib/capture/camera";
  import { getCameraOn, setCameraOn, getState } from "$lib/stores/agent.svelte";

  interface Props {
    onCapture: (imageBase64: string) => void;
  }

  let { onCapture }: Props = $props();

  let videoEl: HTMLVideoElement;
  let capturing = $state(false);

  // React to store changes — auto open/close camera
  $effect(() => {
    const shouldBeOn = getCameraOn();
    if (shouldBeOn && videoEl && !isCameraOpen()) {
      openCamera(videoEl).catch(() => setCameraOn(false));
    } else if (!shouldBeOn && isCameraOpen()) {
      closeCamera();
    }
  });

  function handleCapture() {
    capturing = true;
    const frame = captureFrame();
    if (frame) {
      onCapture(frame);
    }
    setTimeout(() => { capturing = false; }, 300);
  }

  function handleClose() {
    setCameraOn(false);
  }
</script>

<div class="cam-overlay" class:active={getCameraOn()} class:flash={capturing}>
  <!-- Video feed -->
  <video bind:this={videoEl} class="cam-feed" playsinline muted></video>

  {#if getCameraOn()}
    <!-- Scan line animation -->
    <div class="scan-line"></div>

    <!-- Vignette -->
    <div class="vignette"></div>

    <!-- HUD Grid -->
    <div class="hud-grid">
      <!-- Fine grid (subtle) -->
      <div class="fine-grid"></div>

      <!-- Major grid lines -->
      <div class="grid-v" style="left: 33.33%"></div>
      <div class="grid-v" style="left: 66.66%"></div>
      <div class="grid-h" style="top: 33.33%"></div>
      <div class="grid-h" style="top: 66.66%"></div>

      <!-- Center reticle -->
      <div class="reticle">
        <div class="reticle-ring"></div>
        <div class="reticle-cross h"></div>
        <div class="reticle-cross v"></div>
        <div class="reticle-dot"></div>
      </div>

      <!-- Corner brackets (large, tech style) -->
      <div class="bracket tl"></div>
      <div class="bracket tr"></div>
      <div class="bracket bl"></div>
      <div class="bracket br"></div>
    </div>

    <!-- Top HUD info -->
    <div class="hud-top">
      <div class="hud-top-left">
        <div class="rec-badge">
          <span class="rec-dot"></span>
          <span class="rec-text">REC</span>
        </div>
        <span class="hud-data">VISION MODULE</span>
      </div>
      <div class="hud-top-right">
        <span class="hud-data">{getState().toUpperCase()}</span>
        <button class="close-btn" onclick={handleClose}>
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

    <!-- Bottom capture area -->
    <div class="hud-bottom">
      <div class="capture-area">
        <button class="shutter" onclick={handleCapture}>
          <span class="shutter-outer"></span>
          <span class="shutter-inner"></span>
          <span class="shutter-icon">⬡</span>
        </button>
      </div>
      <span class="hud-hint">語音或按下擷取</span>
    </div>
  {/if}
</div>

<style>
  .cam-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    overflow: hidden;
  }

  .cam-overlay.active {
    transform: translateX(0);
    pointer-events: all;
  }

  .cam-overlay.flash::after {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 212, 255, 0.3);
    animation: flashAnim 0.3s ease-out forwards;
    z-index: 50;
  }

  .cam-feed {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Scan line */
  .scan-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, rgba(0, 212, 255, 0.6) 50%, transparent 100%);
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.4), 0 0 30px rgba(0, 212, 255, 0.1);
    animation: scanMove 4s linear infinite;
    z-index: 10;
    pointer-events: none;
  }

  /* Vignette */
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.6) 100%);
    pointer-events: none;
    z-index: 5;
  }

  /* HUD Grid */
  .hud-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  }

  .fine-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
    background-size: 40px 40px;
  }

  .grid-v {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(to bottom,
      transparent 0%,
      rgba(0, 212, 255, 0.15) 20%,
      rgba(0, 212, 255, 0.25) 50%,
      rgba(0, 212, 255, 0.15) 80%,
      transparent 100%
    );
  }

  .grid-h {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(to right,
      transparent 0%,
      rgba(0, 212, 255, 0.15) 20%,
      rgba(0, 212, 255, 0.25) 50%,
      rgba(0, 212, 255, 0.15) 80%,
      transparent 100%
    );
  }

  /* Center reticle */
  .reticle {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80px;
    height: 80px;
  }

  .reticle-ring {
    position: absolute;
    inset: 0;
    border: 1.5px solid rgba(0, 212, 255, 0.5);
    border-radius: 50%;
    animation: reticleRotate 8s linear infinite;
    border-top-color: transparent;
    border-bottom-color: transparent;
  }

  .reticle-cross {
    position: absolute;
    background: rgba(0, 212, 255, 0.6);
  }
  .reticle-cross.h {
    top: 50%;
    left: 10px;
    right: 10px;
    height: 1px;
    transform: translateY(-0.5px);
  }
  .reticle-cross.v {
    left: 50%;
    top: 10px;
    bottom: 10px;
    width: 1px;
    transform: translateX(-0.5px);
  }

  .reticle-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 6px;
    height: 6px;
    background: rgba(0, 212, 255, 0.8);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
    animation: dotPulse 2s ease-in-out infinite;
  }

  /* Corner brackets */
  .bracket {
    position: absolute;
    width: 40px;
    height: 40px;
    border-color: rgba(0, 212, 255, 0.6);
    border-style: solid;
    border-width: 0;
  }
  .bracket.tl { top: 20px; left: 20px; border-top-width: 2px; border-left-width: 2px; }
  .bracket.tr { top: 20px; right: 20px; border-top-width: 2px; border-right-width: 2px; }
  .bracket.bl { bottom: 20px; left: 20px; border-bottom-width: 2px; border-left-width: 2px; }
  .bracket.br { bottom: 20px; right: 20px; border-bottom-width: 2px; border-right-width: 2px; }

  /* Top HUD */
  .hud-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px;
    padding-top: max(20px, env(safe-area-inset-top));
    z-index: 20;
    background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%);
  }

  .hud-top-left, .hud-top-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .rec-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    background: rgba(255, 40, 40, 0.15);
    border: 1px solid rgba(255, 40, 40, 0.4);
  }

  .rec-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff3333;
    animation: recPulse 1s infinite;
    box-shadow: 0 0 6px #ff3333;
  }

  .rec-text {
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: #ff6666;
    font-weight: 700;
    font-family: monospace;
  }

  .hud-data {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: rgba(0, 212, 255, 0.7);
    font-family: monospace;
    text-transform: uppercase;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: rgba(0, 212, 255, 0.08);
    color: rgba(0, 212, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(0, 212, 255, 0.2);
    transition: all 0.2s;
  }
  .close-btn:hover {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.2);
  }

  /* Side data strips */
  .hud-side {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 10;
    pointer-events: none;
  }
  .hud-side.left { left: 24px; }
  .hud-side.right { right: 24px; align-items: flex-end; }

  .data-bar {
    width: 40px;
    height: 3px;
    background: rgba(0, 212, 255, 0.3);
    border-radius: 1px;
    animation: barFlicker 3s ease-in-out infinite;
  }
  .data-bar.short { width: 24px; }

  /* Bottom capture */
  .hud-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    padding-bottom: max(28px, env(safe-area-inset-bottom));
    z-index: 20;
    background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%);
  }

  .capture-area {
    position: relative;
  }

  .shutter {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: transparent;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
    transition: transform 0.15s;
  }
  .shutter:active {
    transform: scale(0.9);
  }

  .shutter-outer {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(0, 212, 255, 0.6);
    animation: shutterSpin 10s linear infinite;
    border-top-color: rgba(123, 97, 255, 0.6);
    border-right-color: transparent;
  }

  .shutter-inner {
    position: absolute;
    inset: 6px;
    border-radius: 50%;
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.3);
    transition: all 0.2s;
  }
  .shutter:hover .shutter-inner {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.6);
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 12px rgba(0, 212, 255, 0.1);
  }

  .shutter-icon {
    position: relative;
    font-size: 1.2rem;
    color: rgba(0, 212, 255, 0.8);
    z-index: 1;
    filter: drop-shadow(0 0 4px rgba(0, 212, 255, 0.4));
  }

  .hud-hint {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.4);
    letter-spacing: 0.1em;
    font-family: monospace;
  }

  /* Animations */
  @keyframes scanMove {
    0% { top: -2px; }
    100% { top: 100%; }
  }

  @keyframes reticleRotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes dotPulse {
    0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    50% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.7); }
  }

  @keyframes recPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.2; }
  }

  @keyframes barFlicker {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.8; }
  }

  @keyframes shutterSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes flashAnim {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
</style>
