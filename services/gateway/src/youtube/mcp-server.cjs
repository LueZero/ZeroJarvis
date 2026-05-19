/**
 * MCP server for YouTube research & analysis.
 * Run by OpenCode as a local MCP server (Node.js).
 *
 * Protocol: JSON-RPC 2.0 over stdio (line-delimited JSON).
 * Tools:
 *   - youtube_search          : Search YouTube videos by keyword
 *   - youtube_video_info      : Get detailed info for a specific video
 *   - youtube_channel_info    : Get channel statistics & recent videos
 *   - youtube_trending        : Get trending videos by region/category
 *   - youtube_comments        : Get top comments for a video
 *   - youtube_transcript      : Get video transcript/subtitles
 *   - youtube_compare         : Compare metrics of multiple videos
 *   - youtube_keyword_ideas   : Suggest related keywords & search volume hints
 *
 * Requires: YOUTUBE_API_KEY env variable (YouTube Data API v3)
 */

const https = require("https");
const { URL, URLSearchParams } = require("url");
const fs = require("fs");
const path = require("path");

// ── Load .env from project root ──
function loadEnv() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const envPath = path.join(dir, ".env");
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
      break;
    }
    dir = path.dirname(dir);
  }
}
loadEnv();

const API_KEY = process.env.YOUTUBE_API_KEY || "";
const API_BASE = "https://www.googleapis.com/youtube/v3";

// ── Helpers ──

function send(obj) {
  const json = JSON.stringify(obj);
  process.stdout.write(json + "\n");
}

function log(...args) {
  process.stderr.write("[youtube-mcp] " + args.join(" ") + "\n");
}

function apiUrl(endpoint, params) {
  params.key = API_KEY;
  const url = new URL(`${API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  return url.toString();
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "Accept": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
      res.on("error", reject);
    }).on("error", reject);
  });
}

function formatDuration(iso) {
  if (!iso) return "N/A";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  const h = m[1] ? `${m[1]}:` : "";
  const min = (m[2] || "0").padStart(h ? 2 : 1, "0");
  const sec = (m[3] || "0").padStart(2, "0");
  return `${h}${min}:${sec}`;
}

function formatNumber(n) {
  if (!n) return "0";
  const num = parseInt(n, 10);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return String(num);
}

function extractVideoId(input) {
  if (!input) return null;
  // Direct ID (11 chars)
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  // URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = input.match(p);
    if (m) return m[1];
  }
  return input; // assume it's an ID
}

function extractChannelId(input) {
  if (!input) return null;
  if (/^UC[A-Za-z0-9_-]{22}$/.test(input)) return input;
  const m = input.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (m) return m[1];
  return null; // might be a handle
}

// ── Tool Implementations ──

async function youtubeSearch(args) {
  const { query, maxResults = 10, order = "relevance", type = "video", publishedAfter, regionCode } = args;
  const params = {
    part: "snippet",
    q: query,
    maxResults: Math.min(maxResults, 50),
    order, // relevance, date, viewCount, rating
    type,
    regionCode: regionCode || "TW",
  };
  if (publishedAfter) params.publishedAfter = publishedAfter;

  const data = await fetchJson(apiUrl("search", params));

  // Get video stats in bulk
  const videoIds = data.items
    .filter((i) => i.id?.videoId)
    .map((i) => i.id.videoId)
    .join(",");

  let statsMap = {};
  if (videoIds) {
    const stats = await fetchJson(apiUrl("videos", {
      part: "statistics,contentDetails",
      id: videoIds,
    }));
    for (const v of stats.items) {
      statsMap[v.id] = {
        views: formatNumber(v.statistics?.viewCount),
        likes: formatNumber(v.statistics?.likeCount),
        comments: formatNumber(v.statistics?.commentCount),
        duration: formatDuration(v.contentDetails?.duration),
      };
    }
  }

  const results = data.items.map((item) => {
    const id = item.id?.videoId || item.id?.channelId || item.id?.playlistId;
    const s = statsMap[id] || {};
    return {
      type: item.id?.kind?.replace("youtube#", "") || type,
      id,
      title: item.snippet?.title,
      channel: item.snippet?.channelTitle,
      channelId: item.snippet?.channelId,
      publishedAt: item.snippet?.publishedAt?.slice(0, 10),
      thumbnail: item.snippet?.thumbnails?.high?.url,
      url: item.id?.videoId ? `https://youtube.com/watch?v=${item.id.videoId}` : null,
      ...s,
    };
  });

  return {
    query,
    totalResults: data.pageInfo?.totalResults,
    results,
  };
}

async function youtubeVideoInfo(args) {
  const videoId = extractVideoId(args.videoId || args.url);
  if (!videoId) throw new Error("請提供有效的影片 ID 或 URL");

  const data = await fetchJson(apiUrl("videos", {
    part: "snippet,statistics,contentDetails,topicDetails,status",
    id: videoId,
  }));

  if (!data.items?.length) throw new Error(`找不到影片: ${videoId}`);
  const v = data.items[0];

  return {
    id: v.id,
    url: `https://youtube.com/watch?v=${v.id}`,
    title: v.snippet?.title,
    description: v.snippet?.description?.slice(0, 1000),
    channel: v.snippet?.channelTitle,
    channelId: v.snippet?.channelId,
    publishedAt: v.snippet?.publishedAt,
    tags: v.snippet?.tags?.slice(0, 30) || [],
    category: v.snippet?.categoryId,
    duration: formatDuration(v.contentDetails?.duration),
    durationRaw: v.contentDetails?.duration,
    definition: v.contentDetails?.definition,
    caption: v.contentDetails?.caption === "true",
    // Flat formatted fields for overlay compatibility (YouTubeVideoItem)
    views: formatNumber(v.statistics?.viewCount),
    likes: formatNumber(v.statistics?.likeCount),
    comments: formatNumber(v.statistics?.commentCount),
    stats: {
      views: parseInt(v.statistics?.viewCount || "0", 10),
      likes: parseInt(v.statistics?.likeCount || "0", 10),
      comments: parseInt(v.statistics?.commentCount || "0", 10),
      viewsFormatted: formatNumber(v.statistics?.viewCount),
      likesFormatted: formatNumber(v.statistics?.likeCount),
      commentsFormatted: formatNumber(v.statistics?.commentCount),
    },
    topics: v.topicDetails?.topicCategories || [],
    thumbnail: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.high?.url,
    status: v.status?.privacyStatus,
  };
}

async function youtubeChannelInfo(args) {
  const { channelId, handle } = args;
  let params = { part: "snippet,statistics,contentDetails,brandingSettings" };

  if (channelId) {
    params.id = extractChannelId(channelId) || channelId;
  } else if (handle) {
    // Use search to find channel by handle
    const search = await fetchJson(apiUrl("search", {
      part: "snippet",
      q: handle,
      type: "channel",
      maxResults: 1,
    }));
    if (!search.items?.length) throw new Error(`找不到頻道: ${handle}`);
    params.id = search.items[0].snippet?.channelId || search.items[0].id?.channelId;
  } else {
    throw new Error("請提供 channelId 或 handle");
  }

  const data = await fetchJson(apiUrl("channels", params));
  if (!data.items?.length) throw new Error("找不到頻道");
  const ch = data.items[0];

  // Get recent videos
  const uploadsPlaylistId = ch.contentDetails?.relatedPlaylists?.uploads;
  let recentVideos = [];
  if (uploadsPlaylistId) {
    const playlist = await fetchJson(apiUrl("playlistItems", {
      part: "snippet",
      playlistId: uploadsPlaylistId,
      maxResults: 10,
    }));
    const vIds = playlist.items
      .map((i) => i.snippet?.resourceId?.videoId)
      .filter(Boolean)
      .join(",");
    if (vIds) {
      const vStats = await fetchJson(apiUrl("videos", {
        part: "statistics,contentDetails",
        id: vIds,
      }));
      const statsMap = {};
      for (const v of vStats.items) {
        statsMap[v.id] = v;
      }
      recentVideos = playlist.items.map((item) => {
        const vid = item.snippet?.resourceId?.videoId;
        const s = statsMap[vid];
        return {
          id: vid,
          title: item.snippet?.title,
          channel: ch.snippet?.title,
          publishedAt: item.snippet?.publishedAt?.slice(0, 10),
          thumbnail: item.snippet?.thumbnails?.high?.url,
          url: `https://youtube.com/watch?v=${vid}`,
          views: formatNumber(s?.statistics?.viewCount),
          likes: formatNumber(s?.statistics?.likeCount),
          duration: formatDuration(s?.contentDetails?.duration),
        };
      });
    }
  }

  return {
    id: ch.id,
    title: ch.snippet?.title,
    description: ch.snippet?.description?.slice(0, 500),
    customUrl: ch.snippet?.customUrl,
    publishedAt: ch.snippet?.publishedAt?.slice(0, 10),
    thumbnail: ch.snippet?.thumbnails?.high?.url,
    country: ch.snippet?.country,
    stats: {
      subscribers: formatNumber(ch.statistics?.subscriberCount),
      videos: parseInt(ch.statistics?.videoCount || "0", 10),
      totalViews: formatNumber(ch.statistics?.viewCount),
    },
    keywords: ch.brandingSettings?.channel?.keywords || "",
    recentVideos,
  };
}

async function youtubeTrending(args) {
  const { regionCode = "TW", categoryId, maxResults = 20 } = args;
  const params = {
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    regionCode,
    maxResults: Math.min(maxResults, 50),
  };
  if (categoryId) params.videoCategoryId = categoryId;

  const data = await fetchJson(apiUrl("videos", params));

  return {
    region: regionCode,
    category: categoryId || "all",
    videos: data.items.map((v, i) => ({
      rank: i + 1,
      id: v.id,
      title: v.snippet?.title,
      channel: v.snippet?.channelTitle,
      publishedAt: v.snippet?.publishedAt?.slice(0, 10),
      url: `https://youtube.com/watch?v=${v.id}`,
      duration: formatDuration(v.contentDetails?.duration),
      views: formatNumber(v.statistics?.viewCount),
      likes: formatNumber(v.statistics?.likeCount),
      thumbnail: v.snippet?.thumbnails?.high?.url,
    })),
  };
}

async function youtubeComments(args) {
  const videoId = extractVideoId(args.videoId || args.url);
  if (!videoId) throw new Error("請提供有效的影片 ID 或 URL");
  const { maxResults = 20, order = "relevance" } = args;

  const data = await fetchJson(apiUrl("commentThreads", {
    part: "snippet",
    videoId,
    maxResults: Math.min(maxResults, 100),
    order, // relevance, time
    textFormat: "plainText",
  }));

  return {
    videoId,
    totalComments: data.pageInfo?.totalResults,
    comments: data.items.map((item) => {
      const c = item.snippet?.topLevelComment?.snippet;
      return {
        author: c?.authorDisplayName,
        text: c?.textDisplay?.slice(0, 500),
        likes: parseInt(c?.likeCount || "0", 10),
        publishedAt: c?.publishedAt?.slice(0, 10),
        replyCount: item.snippet?.totalReplyCount || 0,
      };
    }),
  };
}

async function youtubeTranscript(args) {
  const videoId = extractVideoId(args.videoId || args.url);
  if (!videoId) throw new Error("請提供有效的影片 ID 或 URL");
  const { lang = "zh-TW" } = args;

  // YouTube Data API doesn't directly provide transcripts.
  // Use captions.list to check availability, then note limitations.
  const data = await fetchJson(apiUrl("captions", {
    part: "snippet",
    videoId,
  }));

  const captions = data.items?.map((c) => ({
    id: c.id,
    language: c.snippet?.language,
    name: c.snippet?.name,
    trackKind: c.snippet?.trackKind, // standard, ASR (auto-generated)
    isAutoGenerated: c.snippet?.trackKind === "ASR",
  })) || [];

  // Check if requested language is available
  const available = captions.find((c) => c.language === lang || c.language === lang.split("-")[0]);

  return {
    videoId,
    url: `https://youtube.com/watch?v=${videoId}`,
    requestedLanguage: lang,
    availableCaptions: captions,
    hasRequestedLanguage: !!available,
    note: captions.length > 0
      ? "字幕可用。YouTube API 不直接提供完整字幕文本下載，建議使用影片頁面的字幕功能或第三方工具取得完整逐字稿。"
      : "此影片沒有可用的字幕。",
  };
}

async function youtubeCompare(args) {
  const { videoIds, urls } = args;
  const ids = (videoIds || urls || []).map((v) => extractVideoId(v)).filter(Boolean);
  if (ids.length < 2) throw new Error("請提供至少 2 個影片 ID 或 URL 進行比較");

  const data = await fetchJson(apiUrl("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.join(","),
  }));

  // Build with raw numbers for sorting, then format for display
  const raw = data.items.map((v) => {
    const viewCount = parseInt(v.statistics?.viewCount || "0", 10);
    const likeCount = parseInt(v.statistics?.likeCount || "0", 10);
    const commentCount = parseInt(v.statistics?.commentCount || "0", 10);
    const engRate = viewCount > 0
      ? ((likeCount + commentCount) / viewCount * 100).toFixed(2) + "%"
      : "N/A";
    return { viewCount, likeCount, commentCount, engRate, item: v };
  });

  // Sort for ranking (using raw numbers)
  const byViews = [...raw].sort((a, b) => b.viewCount - a.viewCount);
  const byEngagement = [...raw].sort((a, b) => parseFloat(b.engRate) - parseFloat(a.engRate));

  // Build formatted output (compatible with YouTubeVideoItem)
  const videos = raw.map(({ engRate, item: v }) => ({
    id: v.id,
    title: v.snippet?.title,
    channel: v.snippet?.channelTitle,
    publishedAt: v.snippet?.publishedAt?.slice(0, 10),
    duration: formatDuration(v.contentDetails?.duration),
    views: formatNumber(v.statistics?.viewCount),
    likes: formatNumber(v.statistics?.likeCount),
    comments: formatNumber(v.statistics?.commentCount),
    engagementRate: engRate,
    url: `https://youtube.com/watch?v=${v.id}`,
    thumbnail: v.snippet?.thumbnails?.high?.url,
  }));

  return {
    comparedCount: videos.length,
    videos,
    ranking: {
      byViews: byViews.map((r) => r.item.snippet?.title),
      byEngagement: byEngagement.map((r) => r.item.snippet?.title),
    },
  };
}

async function youtubeKeywordIdeas(args) {
  const { keyword, regionCode = "TW" } = args;

  // Use YouTube search suggestions (autocomplete) + search to find related content
  const searchResults = await fetchJson(apiUrl("search", {
    part: "snippet",
    q: keyword,
    maxResults: 15,
    order: "relevance",
    type: "video",
    regionCode,
  }));

  // Extract common themes from titles
  const titles = searchResults.items.map((i) => i.snippet?.title || "");
  const channels = [...new Set(searchResults.items.map((i) => i.snippet?.channelTitle))];

  // Generate related keyword variations
  const prefixes = ["如何", "最佳", "教學", "比較", "推薦", "評測"];
  const suffixes = ["教學", "技巧", "2026", "入門", "進階", "比較"];
  const relatedKeywords = [
    ...prefixes.map((p) => `${p} ${keyword}`),
    ...suffixes.map((s) => `${keyword} ${s}`),
  ];

  return {
    keyword,
    region: regionCode,
    topResults: searchResults.items.slice(0, 5).map((i) => ({
      title: i.snippet?.title,
      channel: i.snippet?.channelTitle,
      videoId: i.id?.videoId,
    })),
    relatedKeywords,
    topChannels: channels.slice(0, 10),
    suggestion: `根據搜尋結果，「${keyword}」相關內容主要由 ${channels.slice(0, 3).join("、")} 等頻道製作。建議嘗試以上關鍵字變體來尋找內容缺口。`,
  };
}

// ── MCP Protocol Handler ──

const TOOLS = [
  {
    name: "youtube_search",
    description: "搜尋 YouTube 影片，回傳標題、頻道、觀看數、按讚數等資訊。可依關鍵字、排序方式、發布時間篩選。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜尋關鍵字" },
        maxResults: { type: "number", description: "回傳數量（1-50），預設 10" },
        order: { type: "string", enum: ["relevance", "date", "viewCount", "rating"], description: "排序方式，預設 relevance" },
        type: { type: "string", enum: ["video", "channel", "playlist"], description: "搜尋類型，預設 video" },
        publishedAfter: { type: "string", description: "只搜尋此日期之後的影片，ISO 8601 格式（如 2025-01-01T00:00:00Z）" },
        regionCode: { type: "string", description: "地區代碼（如 TW、US、JP），預設 TW" },
      },
      required: ["query"],
    },
  },
  {
    name: "youtube_video_info",
    description: "取得 YouTube 影片的詳細資訊：標題、描述、標籤、觀看數、按讚數、留言數、時長、縮圖等。支援影片 URL 或 ID。",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube 影片 ID（如 dQw4w9WgXcQ）" },
        url: { type: "string", description: "YouTube 影片 URL（如 https://youtube.com/watch?v=xxx）" },
      },
    },
  },
  {
    name: "youtube_channel_info",
    description: "取得 YouTube 頻道資訊：訂閱數、影片數、總觀看數、最近影片、頻道描述等。支援頻道 ID 或名稱。",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "YouTube 頻道 ID（以 UC 開頭）" },
        handle: { type: "string", description: "YouTube 頻道名稱或 @handle" },
      },
    },
  },
  {
    name: "youtube_trending",
    description: "取得指定地區的 YouTube 熱門影片排行榜。可指定影片類別。",
    inputSchema: {
      type: "object",
      properties: {
        regionCode: { type: "string", description: "地區代碼，預設 TW" },
        categoryId: { type: "string", description: "影片類別 ID（如 10=音樂, 20=遊戲, 24=娛樂, 25=新聞, 28=科技）" },
        maxResults: { type: "number", description: "回傳數量（1-50），預設 20" },
      },
    },
  },
  {
    name: "youtube_comments",
    description: "取得 YouTube 影片的熱門留言。可分析觀眾反饋、情緒、常見問題。",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube 影片 ID" },
        url: { type: "string", description: "YouTube 影片 URL" },
        maxResults: { type: "number", description: "回傳數量（1-100），預設 20" },
        order: { type: "string", enum: ["relevance", "time"], description: "排序方式，預設 relevance" },
      },
    },
  },
  {
    name: "youtube_transcript",
    description: "查詢 YouTube 影片的字幕/逐字稿可用性。列出所有可用語言及是否為自動生成。",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube 影片 ID" },
        url: { type: "string", description: "YouTube 影片 URL" },
        lang: { type: "string", description: "偏好語言代碼，預設 zh-TW" },
      },
    },
  },
  {
    name: "youtube_compare",
    description: "比較多部 YouTube 影片的數據：觀看數、按讚數、互動率。適合競品分析或影片成效比較。",
    inputSchema: {
      type: "object",
      properties: {
        videoIds: {
          type: "array",
          items: { type: "string" },
          description: "要比較的影片 ID 或 URL 列表（至少 2 個）",
        },
      },
      required: ["videoIds"],
    },
  },
  {
    name: "youtube_keyword_ideas",
    description: "根據關鍵字分析 YouTube 搜尋趨勢，提供相關關鍵字建議、競爭頻道、內容方向。適合 SEO 研究和選題。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "要分析的關鍵字" },
        regionCode: { type: "string", description: "地區代碼，預設 TW" },
      },
      required: ["keyword"],
    },
  },
];

const TOOL_MAP = {
  youtube_search: youtubeSearch,
  youtube_video_info: youtubeVideoInfo,
  youtube_channel_info: youtubeChannelInfo,
  youtube_trending: youtubeTrending,
  youtube_comments: youtubeComments,
  youtube_transcript: youtubeTranscript,
  youtube_compare: youtubeCompare,
  youtube_keyword_ideas: youtubeKeywordIdeas,
};

async function handleMessage(msg) {
  if (!msg.method) return; // ignore responses / notifications without method

  switch (msg.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "youtube-toolkit", version: "1.0.0" },
        },
      });
      break;

    case "notifications/initialized":
      log("Client initialized");
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: TOOLS },
      });
      break;

    case "tools/call": {
      const { name, arguments: args } = msg.params || {};
      const fn = TOOL_MAP[name];
      if (!fn) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          },
        });
        break;
      }

      if (!API_KEY) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [{
              type: "text",
              text: "錯誤：未設定 YOUTUBE_API_KEY 環境變數。請在系統環境變數中設定 YouTube Data API v3 的 API Key。",
            }],
            isError: true,
          },
        });
        break;
      }

      try {
        const result = await fn(args || {});
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        log("Tool error:", name, err.message);
        send({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            content: [{ type: "text", text: `錯誤：${err.message}` }],
            isError: true,
          },
        });
      }
      break;
    }

    default:
      if (msg.id != null) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        });
      }
  }
}

// ── stdio transport (line-delimited JSON) ──
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  processBuffer();
});

function processBuffer() {
  while (true) {
    const newlineIdx = buffer.indexOf("\n");
    if (newlineIdx === -1) break;
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    try {
      handleMessage(JSON.parse(line));
    } catch (e) {
      log("Parse error:", e.message);
    }
  }
}

process.stdin.on("end", () => process.exit(0));
log("YouTube MCP server started");
