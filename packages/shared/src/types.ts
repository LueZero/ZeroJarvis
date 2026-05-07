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
  | { type: "confirm"; text: string }
  | { type: "cancel" }
  | { type: "interrupt" }
  | { type: "new_chat" }
  | { type: "switch_session"; sessionId: string }
  | { type: "config"; settings: Partial<UserConfig> };

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
  // Multi-Session (F9)
  | { type: "session_list"; sessions: SessionTab[] }
  | { type: "session_switch"; sessionId: string; state: SessionSnapshot }
  | { type: "session_done"; sessionId: string; text: string };

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

// --- NotebookLM Content Display ---
export type NotebookContentType = "markdown" | "mindmap" | "quiz" | "flashcards" | "media" | "table";

export interface NotebookContent {
  type: NotebookContentType;
  title: string;
  data: string;
}
