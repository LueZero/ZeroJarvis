<script lang="ts">
  /**
   * Full-screen map overlay — Sci-fi HUD style (matches CameraPreview)
   * Triggered by [ACTION:MAP:query] from AI
   */
  import type { FoodSearchData, RestaurantInfo } from "@zerojarvis/shared";
  import RestaurantPanel from "./RestaurantPanel.svelte";

  interface Props {
    query: string;
    foodData?: FoodSearchData | null;
    onClose: () => void;
  }

  let { query, foodData = null, onClose }: Props = $props();
  let loaded = $state(false);

  let activeQuery = $state(query);
  let selectedName = $state("");
  $effect(() => { activeQuery = query; });

  function handleRestaurantSelect(restaurant: RestaurantInfo) {
    selectedName = restaurant.name;
    loaded = false;
    activeQuery = restaurant.name + (restaurant.address ? " " + restaurant.address : "");
  }

  const mapUrl = $derived(
    `https://www.google.com/maps?q=${encodeURIComponent(activeQuery)}&z=${selectedName ? 17 : 14}&iwloc=B&output=embed`
  );
</script>

<div class="map-overlay" class:active={true}>
  <!-- Map iframe (background layer) -->
  <div class="map-body">
    {#if !loaded}
      <div class="map-loading">
        <div class="loading-ring"></div>
        <span>LOADING MAP...</span>
      </div>
    {/if}
    <iframe
      src={mapUrl}
      class="map-frame"
      class:visible={loaded}
      title="Google Maps - {query}"
      allowfullscreen
      loading="eager"
      referrerpolicy="no-referrer-when-downgrade"
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
      <div class="loc-badge">
        <span class="loc-dot"></span>
        <span class="loc-text">MAP</span>
      </div>
      <span class="hud-data">{query}</span>
    </div>
    <div class="hud-top-right">
      <span class="hud-data">NAVIGATION</span>
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

  <!-- Restaurant results panel -->
  {#if foodData && foodData.restaurants.length > 0}
    <RestaurantPanel data={foodData} selectedName={selectedName} onSelect={handleRestaurantSelect} />
  {/if}

  <!-- Bottom hint -->
  <div class="hud-bottom">
    <span class="hud-hint">點擊地圖互動 · 語音可下達新指令</span>
  </div>
</div>

<style>
  .map-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    overflow: hidden;
  }

  .map-overlay.active {
    transform: translateX(0);
    pointer-events: all;
  }

  /* Map body */
  .map-body {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .map-frame {
    width: 100%;
    height: 100%;
    border: none;
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  .map-frame.visible {
    opacity: 1;
  }

  .map-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: rgba(0, 212, 255, 0.6);
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    font-weight: 300;
  }

  .loading-ring {
    width: 40px;
    height: 40px;
    border: 2px solid rgba(0, 212, 255, 0.1);
    border-top-color: rgba(0, 212, 255, 0.8);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  /* Scan line */
  .scan-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, rgba(0, 212, 255, 0.4) 50%, transparent 100%);
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.3);
    animation: scanMove 5s linear infinite;
    z-index: 10;
    pointer-events: none;
  }

  /* Vignette */
  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.5) 100%);
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
    background: rgba(0, 212, 255, 0.6);
    box-shadow: 0 0 6px rgba(0, 212, 255, 0.3);
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

  .loc-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(0, 212, 255, 0.12);
    border: 1px solid rgba(0, 212, 255, 0.3);
  }

  .loc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00d4ff;
    box-shadow: 0 0 8px #00d4ff;
    animation: pulse 1.5s infinite;
  }

  .loc-text {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #00d4ff;
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
    border: 1px solid rgba(0, 212, 255, 0.2);
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
    background: rgba(0, 212, 255, 0.3);
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

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @keyframes flicker {
    0% { opacity: 0.3; }
    50% { opacity: 0.7; }
    100% { opacity: 0.3; }
  }


</style>
