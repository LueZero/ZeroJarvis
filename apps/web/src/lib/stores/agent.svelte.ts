/**
 * Agent state store using Svelte 5 runes ($state)
 * Per-session isolated state (F9) — each session has independent UI state
 *
 * Architecture: Active session uses direct $state variables (full Svelte reactivity).
 * Inactive sessions are stored in a plain Map as snapshots (no reactivity needed).
 * On switch: save current $state → Map, load target Map → $state.
 */

import type { AgentState, PolishResult, ChatMessage, SessionTab, SessionSnapshot } from "@zerojarvis/shared";

// --- Per-Session Snapshot (stored for inactive sessions) ---
interface SessionState {
  agentState: AgentState;
  sttText: string;
  polish: PolishResult | null;
  llmText: string;
  cameraOn: boolean;
  mapQuery: string;
  youtubeVideoId: string;
  error: string | null;
  messages: ChatMessage[];
}

// --- Active Session State (reactive $state — drives all UI) ---
let agentState = $state<AgentState>("idle");
let currentSttText = $state("");
let currentPolish = $state<PolishResult | null>(null);
let currentLlmText = $state("");
let isCameraOn = $state(false);
let mapQuery = $state("");
let youtubeVideoId = $state("");
let error = $state<string | null>(null);
let messages = $state<ChatMessage[]>([]);

// --- Global State (shared across all sessions) ---
let isConnected = $state(false);

// --- Multi-Session State ---
let sessions = $state<SessionTab[]>([]);
let activeSessionId = $state<string>("__default__");

// Plain Map for inactive session snapshots (NOT reactive — that's intentional)
const inactiveStates = new Map<string, SessionState>();

// --- Save current $state into snapshot ---
function saveCurrentToMap(sessionId: string) {
  inactiveStates.set(sessionId, {
    agentState,
    sttText: currentSttText,
    polish: currentPolish,
    llmText: currentLlmText,
    cameraOn: isCameraOn,
    mapQuery,
    youtubeVideoId,
    error,
    messages,
  });
}

// --- Load snapshot into $state ---
function loadFromMap(sessionId: string) {
  const stored = inactiveStates.get(sessionId);
  if (stored) {
    agentState = stored.agentState;
    currentSttText = stored.sttText;
    currentPolish = stored.polish;
    currentLlmText = stored.llmText;
    isCameraOn = stored.cameraOn;
    mapQuery = stored.mapQuery;
    youtubeVideoId = stored.youtubeVideoId;
    error = stored.error;
    messages = stored.messages;
    inactiveStates.delete(sessionId);
  } else {
    // New session — reset to defaults
    agentState = "idle";
    currentSttText = "";
    currentPolish = null;
    currentLlmText = "";
    isCameraOn = false;
    mapQuery = "";
    youtubeVideoId = "";
    error = null;
    messages = [];
  }
}

// --- Getters ---
export function getState(): AgentState {
  return agentState;
}

export function getMessages(): ChatMessage[] {
  return messages;
}

export function getSttText(): string {
  return currentSttText;
}

export function getPolish(): PolishResult | null {
  return currentPolish;
}

export function getLlmText(): string {
  return currentLlmText;
}

export function getConnected(): boolean {
  return isConnected;
}

export function getCameraOn(): boolean {
  return isCameraOn;
}

export function getMapQuery(): string {
  return mapQuery;
}

export function getYoutubeVideoId(): string {
  return youtubeVideoId;
}

export function getError(): string | null {
  return error;
}

// --- Setters ---
export function setState(s: AgentState) {
  agentState = s;
}

export function setSttText(t: string) {
  currentSttText = t;
}

export function setPolish(p: PolishResult | null) {
  currentPolish = p;
}

export function setLlmText(t: string) {
  currentLlmText = t;
}

export function appendLlmText(delta: string) {
  currentLlmText += delta;
}

export function setConnected(c: boolean) {
  isConnected = c;
}

export function setCameraOn(on: boolean) {
  isCameraOn = on;
}

export function setMapQuery(q: string) {
  mapQuery = q;
}

export function clearMapQuery() {
  mapQuery = "";
}

export function setYoutubeVideoId(id: string) {
  youtubeVideoId = id;
}

export function clearYoutubeVideoId() {
  youtubeVideoId = "";
}

export function setError(e: string | null) {
  error = e;
}

export function addMessage(msg: ChatMessage) {
  messages = [...messages, msg];
}

export function clearCurrent() {
  currentSttText = "";
  currentPolish = null;
  currentLlmText = "";
  error = null;
}

// --- Multi-Session (F9) ---
export function getSessions(): SessionTab[] {
  return sessions;
}

export function getActiveSessionId(): string {
  return activeSessionId;
}

export function setSessions(tabs: SessionTab[]) {
  sessions = tabs;
  // Only update tab metadata — actual session switch is handled by switchSession()
  // If activeSessionId doesn't exist in tabs, pick the server's active
  const activetab = tabs.find(t => t.active);
  const currentExists = tabs.some(t => t.id === activeSessionId);
  if (!currentExists && activetab) {
    // Current session was removed or this is first connection — adopt server's active
    saveCurrentToMap(activeSessionId);
    activeSessionId = activetab.id;
    loadFromMap(activetab.id);
  }
}

export function switchSession(sessionId: string, snapshot: SessionSnapshot) {
  if (sessionId === activeSessionId) return;

  // Save current active session to map
  saveCurrentToMap(activeSessionId);

  // Switch active ID
  activeSessionId = sessionId;

  // Try load from local map first (has full state including messages)
  if (inactiveStates.has(sessionId)) {
    loadFromMap(sessionId);
  } else {
    // First time seeing this session — use server snapshot
    agentState = snapshot.agentState;
    currentSttText = snapshot.sttText;
    currentPolish = null;
    currentLlmText = snapshot.llmText;
    isCameraOn = snapshot.cameraOn;
    mapQuery = snapshot.mapQuery;
    youtubeVideoId = snapshot.youtubeVideoId;
    error = snapshot.error;
    messages = [];
  }

  // Update active flags in tabs
  sessions = sessions.map(s => ({ ...s, active: s.id === sessionId }));
}

export function updateSessionDone(sessionId: string, text: string) {
  // Update tab status
  sessions = sessions.map(s =>
    s.id === sessionId ? { ...s, status: "done" as const } : s
  );
  // If it's a background session, update its stored state
  if (sessionId !== activeSessionId && inactiveStates.has(sessionId)) {
    const stored = inactiveStates.get(sessionId)!;
    stored.llmText = text;
    stored.agentState = "idle";
  }
  // If it's the active session, update directly
  if (sessionId === activeSessionId) {
    currentLlmText = text;
  }
}

/** Get current active session's snapshot */
export function getActiveSnapshot(): SessionSnapshot {
  return {
    llmText: currentLlmText,
    sttText: currentSttText,
    agentState,
    cameraOn: isCameraOn,
    mapQuery,
    youtubeVideoId,
    error,
  };
}
