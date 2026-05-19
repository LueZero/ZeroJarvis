// ========================================
// ZeroJarvis Shared Types
// ========================================

// --- Agent State Machine ---
export type AgentState = "idle" | "listening" | "thinking" | "speaking" | "camera";

// --- Confirm Mode ---
export type ConfirmMode = "always" | "auto" | "voice";

// --- WebSocket Messages: Client → Server ---
export type ClientMessage =
  | { type: "audio"; data: ArrayBuffer }
  | { type: "audio_text"; text: string }
  | { type: "image"; data: string; query: string }
  | { type: "screenshot_response"; data: string }
  | { type: "confirm"; text: string }
  | { type: "cancel" }
  | { type: "interrupt" }
  | { type: "new_chat" }
  | { type: "switch_session"; sessionId: string }
  | { type: "config"; settings: Partial<UserConfig> }
  | { type: "notebook_state"; active: boolean; contentType?: NotebookContentType }
  | { type: "task_delete"; taskId: string }
  // Compaction (F17)
  | { type: "summarize_session" };

// --- WebSocket Messages: Server → Client ---
export type ServerMessage =
  | { type: "stt_partial"; text: string }
  | { type: "stt_final"; text: string }
  | { type: "polished"; data: PolishResult }
  | { type: "llm_delta"; text: string }
  | { type: "llm_done"; text: string }
  | { type: "tts_audio"; data: ArrayBuffer }
  | { type: "tts_end" }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "action"; action: string; payload?: string }
  | { type: "state"; state: AgentState }
  | { type: "error"; message: string }
  | { type: "food_results"; data: FoodSearchData }
  | { type: "opentable_results"; data: OpenTableResult }
  // YouTube
  | { type: "youtube_results"; data: YouTubeData }
  // Multi-Session (F9)
  | { type: "session_list"; sessions: SessionTab[] }
  | { type: "session_switch"; sessionId: string; state: SessionSnapshot }
  | { type: "session_done"; sessionId: string; text: string }
  // Background Tasks
  | { type: "task_created"; taskId: string; description: string }
  | { type: "task_done"; taskId: string; text: string }
  | { type: "task_error"; taskId: string; error: string }
  | { type: "task_deleted"; taskId: string }
  // Token & Compaction (F17)
  | { type: "token_update"; usage: TokenUsage }
  | { type: "session_summary"; sessionId: string; success: boolean }
  // Activity Feed (live opencode events)
  | { type: "activity"; event: ActivityEvent };

// --- Polish Result ---
export interface PolishResult {
  raw: string;
  polished: string;
  corrections: string[];
  confidence: number;
}

// --- User Config ---
export interface UserConfig {
  confirmMode: ConfirmMode;
  autoSendThreshold: number;      // 0.0 - 1.0
  wakeWord: string;
  sttProvider: "whisper-local" | "deepgram";
  ttsProvider: "edge-tts" | "elevenlabs";
  ttsVoice: string;
  llmPolish: string;              // e.g. "openai/gpt-4o-mini"
  llmMain: string;                // e.g. "anthropic/claude-sonnet-4"
  visionModel: string;            // e.g. "openai/gpt-4o"
  language: string;               // e.g. "zh-TW"
}

// --- Chat Message ---
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  image?: string;                 // base64 image for vision
  timestamp: number;
  polishResult?: PolishResult;
  toolCalls?: ToolCallRecord[];
}

// --- Tool Call Record ---
export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result?: string;
}

// --- Session ---
export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// --- Multi-Session (F9) ---
export type SessionStatus = "processing" | "done" | "error";

export interface SessionTab {
  id: string;
  title: string;
  status: SessionStatus;
  active: boolean;
  hasSummary?: boolean;
}

export interface SessionSnapshot {
  llmText: string;
  sttText: string;
  agentState: AgentState;
  cameraOn: boolean;
  mapQuery: string;
  notebookContent: NotebookContent | null;
  error: string | null;
}

// --- WebSocket Messages: Server → Client (Multi-Session) ---
export type SessionServerMessage =
  | { type: "session_list"; sessions: SessionTab[] }
  | { type: "session_switch"; sessionId: string; state: SessionSnapshot }
  | { type: "session_done"; sessionId: string; text: string };

// --- Default Config ---
export const DEFAULT_CONFIG: UserConfig = {
  confirmMode: "auto",
  autoSendThreshold: 0.9,
  wakeWord: "jarvis",
  sttProvider: "whisper-local",
  ttsProvider: "edge-tts",
  ttsVoice: "zh-TW-HsiaoChenNeural",
  llmPolish: "openai/gpt-4o-mini",
  llmMain: "anthropic/claude-sonnet-4",
  visionModel: "openai/gpt-4o",
  language: "zh-TW",
};

// --- Restaurant / Food Search (via Google Maps) ---
export interface RestaurantInfo {
  name: string;
  rating: number;
  reviews: number;
  priceRange: string;
  cuisine: string;
  address: string;
  status: string;
  mapsUrl?: string;
}

export interface FoodSearchData {
  query: string;
  restaurants: RestaurantInfo[];
  searchedAt: string;
}

// --- OpenTable Reservation ---
export interface OpenTableSlot {
  time: string;
  bookingUrl: string;
}

export interface OpenTableRestaurant {
  name: string;
  rating: string;
  meta: string;
  slots: OpenTableSlot[];
  pageUrl: string;
}

export interface OpenTableResult {
  restaurant: string;
  found: boolean;
  results: OpenTableRestaurant[];
  searchUrl: string;
  noResults?: boolean;
  date: string;
  time: string;
  partySize: number;
  error?: string;
  searchedAt: string;
}

// --- Token Usage (F17) ---
export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  total: number;
  contextLimit: number;
  usagePercent: number;
}

// --- Activity Feed (live opencode events for HUD) ---
export type ActivityEvent =
  | { kind: "tool_start"; tool: string; input: string }
  | { kind: "tool_done"; tool: string; output: string; elapsed: number }
  | { kind: "tool_error"; tool: string; error: string }
  | { kind: "reasoning"; text: string }
  | { kind: "step_start" }
  | { kind: "step_finish"; cost: number; tokens: { input: number; output: number; reasoning: number } };

// --- YouTube Data ---
export type YouTubeOverlayType = "search" | "video" | "channel" | "trending" | "compare";

export interface YouTubeVideoItem {
  id: string;
  title: string;
  channel: string;
  channelId?: string;
  publishedAt?: string;
  thumbnail?: string;
  url?: string;
  views?: string;
  likes?: string;
  comments?: string;
  duration?: string;
  engagementRate?: string;
}

export interface YouTubeData {
  type: YouTubeOverlayType;
  data: Record<string, unknown>;
}

// --- NotebookLM Content Display ---
export type NotebookContentType = "markdown" | "mindmap" | "quiz" | "flashcards" | "media" | "table";

export interface NotebookContent {
  type: NotebookContentType;
  title: string;
  data: string;
}
