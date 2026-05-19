<script lang="ts">
  /**
   * YouTube overlay — Sci-fi HUD style (matches MapOverlay pattern)
   * Triggered by [ACTION:YOUTUBE:{type,data}] from AI
   * Displays search results, video info, channel info, trending, comparisons
   */
  import type { YouTubeData, YouTubeVideoItem } from "@zerojarvis/shared";

  interface Props {
    data: YouTubeData;
    onClose: () => void;
  }

  let { data, onClose }: Props = $props();

  /** Currently playing video ID (null = grid view, string = player view) */
  let playingId = $state<string | null>(null);
  let playingTitle = $state("");

  /** Extract video ID from various formats */
  function extractId(video: YouTubeVideoItem): string {
    return video.id || "";
  }

  // Extract video items from various data shapes
  const videos = $derived.by(() => {
    const d = data.data as any;
    switch (data.type) {
      case "search":
        return (d.results || []) as YouTubeVideoItem[];
      case "trending":
        return (d.videos || []) as YouTubeVideoItem[];
      case "compare":
        return (d.videos || []) as YouTubeVideoItem[];
      case "channel":
        return (d.recentVideos || []) as YouTubeVideoItem[];
      case "video":
        return d.id ? [d] as YouTubeVideoItem[] : [];
      default:
        return [];
    }
  });

  const title = $derived.by(() => {
    const d = data.data as any;
    switch (data.type) {
      case "search": return `搜尋：${d.query || ""}`;
      case "trending": return `熱門排行 — ${d.region || "TW"}`;
      case "compare": return `影片比較 (${d.comparedCount || 0})`;
      case "channel": return d.title || "頻道資訊";
      case "video": return d.title || "影片資訊";
      default: return "YouTube";
    }
  });

  const channelInfo = $derived.by(() => {
    if (data.type !== "channel") return null;
    const d = data.data as any;
    return {
      title: d.title,
      subscribers: d.stats?.subscribers,
      videos: d.stats?.videos,
      totalViews: d.stats?.totalViews,
      thumbnail: d.thumbnail,
      description: d.description,
      customUrl: d.customUrl,
    };
  });

  function openVideo(url: string) {
    if (url) window.open(url, "_blank", "noopener");
  }

  /** Play video inline via iframe embed */
  function playInline(video: YouTubeVideoItem) {
    const id = extractId(video);
    if (id) {
      playingId = id;
      playingTitle = video.title || "";
    }
  }

  /** Close inline player, back to grid */
  function closePlayer() {
    playingId = null;
    playingTitle = "";
  }

  /** Handle thumbnail load failure — try lower quality, then hide */
  function handleThumbError(e: Event) {
    const img = e.target as HTMLImageElement;
    const src = img.src;
    // Try fallback: hqdefault → mqdefault → hide
    if (src.includes("maxresdefault") || src.includes("hqdefault")) {
      img.src = src.replace(/maxresdefault|hqdefault/, "mqdefault");
    } else {
      // All fallbacks exhausted — hide the broken image
      img.style.display = "none";
    }
  }
</script>

<div class="yt-overlay" class:active={true}>
  <!-- Background -->
  <div class="yt-bg"></div>

  <!-- Scan line effect -->
  <div class="scan-line"></div>
  <div class="vignette"></div>

  <!-- Corner brackets -->
  <div class="bracket tl"></div>
  <div class="bracket tr"></div>
  <div class="bracket bl"></div>
  <div class="bracket br"></div>

  <!-- Top HUD -->
  <div class="hud-top">
    <div class="hud-top-left">
      <div class="yt-badge">
        <span class="yt-icon">▶</span>
        <span class="yt-label">YOUTUBE</span>
      </div>
      <span class="hud-data">{title}</span>
    </div>
    <div class="hud-top-right">
      <span class="hud-data">{data.type.toUpperCase()}</span>
      <button class="close-btn" onclick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Channel header (for channel type) -->
  {#if channelInfo}
    <div class="channel-header">
      {#if channelInfo.thumbnail}
        <img class="channel-avatar" src={channelInfo.thumbnail} alt={channelInfo.title} onerror={handleThumbError} />
      {/if}
      <div class="channel-meta">
        <div class="channel-name">{channelInfo.title}</div>
        <div class="channel-stats">
          <span>{channelInfo.subscribers} 訂閱</span>
          <span class="sep">·</span>
          <span>{channelInfo.videos} 部影片</span>
          <span class="sep">·</span>
          <span>{channelInfo.totalViews} 觀看</span>
        </div>
        {#if channelInfo.description}
          <div class="channel-desc">{channelInfo.description}</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Inline YouTube Player -->
  {#if playingId}
    <div class="player-section">
      <div class="player-top-bar">
        <button class="back-btn" onclick={closePlayer}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>返回列表</span>
        </button>
        <span class="player-title">{playingTitle}</span>
        <button class="external-btn" onclick={() => openVideo(`https://youtube.com/watch?v=${playingId}`)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3V13H13V10M9 3H13V7M13 3L7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="player-container">
        <iframe
          src="https://www.youtube.com/embed/{playingId}?autoplay=1&rel=0&modestbranding=1"
          title={playingTitle}
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </div>
  {/if}

  <!-- Video grid (hidden when player is active) -->
  <div class="video-grid" class:single={data.type === "video"} class:hidden={!!playingId}>
    {#each videos as video, i}
      <button
        class="video-card"
        class:featured={data.type === "video"}
        onclick={() => playInline(video)}
      >
        {#if video.thumbnail}
          <div class="thumb-wrap">
            <img class="thumb" src={video.thumbnail} alt={video.title} loading="lazy" onerror={handleThumbError} />
            {#if video.duration}
              <span class="duration">{video.duration}</span>
            {/if}
            {#if data.type === "trending" && (video as any).rank}
              <span class="rank">#{(video as any).rank}</span>
            {/if}
          </div>
        {/if}
        <div class="card-body">
          <div class="card-title">{video.title}</div>
          <div class="card-channel">{video.channel || ""}</div>
          <div class="card-stats">
            {#if video.views}<span>{video.views} 觀看</span>{/if}
            {#if video.likes}<span class="sep">·</span><span>👍 {video.likes}</span>{/if}
            {#if video.comments}<span class="sep">·</span><span>💬 {video.comments}</span>{/if}
            {#if video.engagementRate}<span class="sep">·</span><span>📊 {video.engagementRate}</span>{/if}
          </div>
          {#if video.publishedAt}
            <div class="card-date">{video.publishedAt}</div>
          {/if}
        </div>
      </button>
    {/each}
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
    <span class="hud-hint">{playingId ? '按返回回到列表 · 語音可下達新指令' : '點擊影片播放 · 語音可下達新指令'}</span>
  </div>
</div>

<style>
  .yt-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #0a0a0f;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .yt-overlay.active {
    transform: translateX(0);
    pointer-events: all;
  }

  .yt-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 50%, rgba(255, 0, 0, 0.06) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 50%, rgba(255, 50, 50, 0.04) 0%, transparent 60%);
  }

  /* Scan line */
  .scan-line {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(255, 255, 255, 0.015) 2px,
      rgba(255, 255, 255, 0.015) 4px
    );
    pointer-events: none;
    z-index: 10;
  }

  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.6) 100%);
    pointer-events: none;
    z-index: 10;
  }

  /* Corner brackets */
  .bracket {
    position: absolute;
    width: 24px;
    height: 24px;
    border-color: rgba(255, 60, 60, 0.5);
    border-style: solid;
    border-width: 0;
    z-index: 20;
  }
  .bracket.tl { top: 12px; left: 12px; border-top-width: 2px; border-left-width: 2px; }
  .bracket.tr { top: 12px; right: 12px; border-top-width: 2px; border-right-width: 2px; }
  .bracket.bl { bottom: 12px; left: 12px; border-bottom-width: 2px; border-left-width: 2px; }
  .bracket.br { bottom: 12px; right: 12px; border-bottom-width: 2px; border-right-width: 2px; }

  /* Top HUD */
  .hud-top {
    position: relative;
    z-index: 20;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid rgba(255, 60, 60, 0.15);
  }

  .hud-top-left, .hud-top-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .yt-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 0, 0, 0.15);
    border: 1px solid rgba(255, 60, 60, 0.3);
    border-radius: 4px;
    padding: 4px 10px;
  }

  .yt-icon {
    color: #ff3c3c;
    font-size: 10px;
  }

  .yt-label {
    color: #ff3c3c;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.5px;
    font-family: "JetBrains Mono", monospace;
  }

  .hud-data {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-family: "JetBrains Mono", monospace;
    letter-spacing: 0.5px;
  }

  .close-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.5);
    padding: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .close-btn:hover {
    background: rgba(255, 60, 60, 0.2);
    color: #ff3c3c;
    border-color: rgba(255, 60, 60, 0.3);
  }

  /* Channel header */
  .channel-header {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 16px 24px;
    border-bottom: 1px solid rgba(255, 60, 60, 0.1);
  }

  .channel-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 2px solid rgba(255, 60, 60, 0.3);
  }

  .channel-meta { flex: 1; }
  .channel-name {
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .channel-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    font-family: "JetBrains Mono", monospace;
  }

  .channel-desc {
    color: rgba(255, 255, 255, 0.4);
    font-size: 12px;
    margin-top: 8px;
    line-height: 1.4;
    max-height: 40px;
    overflow: hidden;
  }

  .sep { opacity: 0.3; }

  /* Video grid */
  .video-grid {
    position: relative;
    z-index: 20;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    padding: 16px 24px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 60, 60, 0.3) transparent;
  }

  .video-grid.single {
    grid-template-columns: 1fr;
    max-width: 720px;
    margin: 0 auto;
  }

  .video-grid.hidden {
    display: none;
  }

  /* Inline Player */
  .player-section {
    position: relative;
    z-index: 20;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .player-top-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 24px;
    border-bottom: 1px solid rgba(255, 60, 60, 0.1);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
    font-family: "JetBrains Mono", monospace;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .back-btn:hover {
    background: rgba(255, 60, 60, 0.15);
    color: #ff3c3c;
    border-color: rgba(255, 60, 60, 0.3);
  }

  .player-title {
    flex: 1;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .external-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.4);
    padding: 4px;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .external-btn:hover {
    background: rgba(255, 60, 60, 0.15);
    color: #ff3c3c;
    border-color: rgba(255, 60, 60, 0.3);
  }

  .player-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 24px;
    min-height: 0;
  }

  .player-container iframe {
    width: 100%;
    max-width: 960px;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    border: 1px solid rgba(255, 60, 60, 0.15);
    background: #000;
  }

  .video-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.25s;
    text-align: left;
    color: inherit;
    font: inherit;
    padding: 0;
  }

  .video-card:hover {
    background: rgba(255, 60, 60, 0.06);
    border-color: rgba(255, 60, 60, 0.2);
    transform: translateY(-2px);
  }

  .video-card.featured {
    border-color: rgba(255, 60, 60, 0.2);
  }

  .thumb-wrap {
    position: relative;
    aspect-ratio: 16 / 9;
    background: rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .duration {
    position: absolute;
    bottom: 6px;
    right: 6px;
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .rank {
    position: absolute;
    top: 6px;
    left: 6px;
    background: rgba(255, 0, 0, 0.8);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    font-family: "JetBrains Mono", monospace;
    padding: 2px 8px;
    border-radius: 3px;
  }

  .card-body {
    padding: 10px 12px;
  }

  .card-title {
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .card-channel {
    color: rgba(255, 255, 255, 0.45);
    font-size: 12px;
    margin-bottom: 6px;
  }

  .card-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
  }

  .card-date {
    color: rgba(255, 255, 255, 0.25);
    font-size: 11px;
    font-family: "JetBrains Mono", monospace;
    margin-top: 4px;
  }

  /* Side data strips */
  .hud-side {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 15;
    pointer-events: none;
  }
  .hud-side.left { left: 8px; }
  .hud-side.right { right: 8px; }

  .data-bar {
    width: 3px;
    height: 32px;
    background: rgba(255, 60, 60, 0.2);
    border-radius: 1px;
  }
  .data-bar.short { height: 16px; }

  /* Bottom */
  .hud-bottom {
    position: relative;
    z-index: 20;
    text-align: center;
    padding: 10px;
    border-top: 1px solid rgba(255, 60, 60, 0.1);
  }

  .hud-hint {
    color: rgba(255, 255, 255, 0.3);
    font-size: 12px;
    letter-spacing: 0.5px;
  }
</style>
