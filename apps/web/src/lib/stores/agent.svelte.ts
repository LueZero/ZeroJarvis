/**
 * Agent state store using Svelte 5 runes ($state)
 * Per-session isolated state (F9) — each session has independent UI state
 *
 * Architecture: Active session uses direct $state variables (full Svelte reactivity).
 * Inactive sessions are stored in a plain Map as snapshots (no reactivity needed).
 * On switch: save current $state → Map, load target Map → $state.
 */

import type { AgentState, PolishResult, ChatMessage, SessionTab, SessionSnapshot, NotebookContent, FoodSearchData, OpenTableResult, TokenUsage, YouTubeData } from "@zerojarvis/shared";

// --- Per-Session Snapshot (stored for inactive sessions) ---
interface SessionState {
  agentState: AgentState;
  sttText: string;
  polish: PolishResult | null;
  llmText: string;
  cameraOn: boolean;
  mapQuery: string;
  notebookContent: NotebookContent | null;
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
let foodData = $state<FoodSearchData | null>(null);
let opentableData = $state<OpenTableResult | null>(null);
let youtubeData = $state<YouTubeData | null>(null);
let notebookContent = $state<NotebookContent | null>(null);
let error = $state<string | null>(null);
let messages = $state<ChatMessage[]>([]);

// --- Global State (shared across all sessions) ---
let isConnected = $state(false);

// --- Background Task Notifications ---
interface TaskNotification {
  taskId: string;
  text: string;
  receivedAt: number;
}

export interface TaskItem {
  id: string;
  description: string;
  status: "running" | "done" | "error";
  createdAt: number;
  completedAt?: number;
  resultText?: string;
}

let pendingTaskNotifications = $state<TaskNotification[]>([]);
let activeTaskCount = $state(0);
let taskItems = $state<TaskItem[]>([]);
let taskPanelOpen = $state(false);

// --- Token Usage & Summary (F17) ---
let tokenUsage = $state<TokenUsage | null>(null);
let summaryPanelOpen = $state(false);
let lastCompactSuccess = $state<boolean | null>(null);

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
    notebookContent,
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
    notebookContent = stored.notebookContent;
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
    notebookContent = null;
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

export function getNotebookContent(): NotebookContent | null {
  return notebookContent;
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
  foodData = null;
}

export function getFoodData(): FoodSearchData | null {
  return foodData;
}

export function setFoodData(data: FoodSearchData | null) {
  foodData = data;
}

export function getOpenTableData(): OpenTableResult | null {
  return opentableData;
}

export function setOpenTableData(data: OpenTableResult | null) {
  opentableData = data;
}

export function clearOpenTableData() {
  opentableData = null;
}

export function getYouTubeData(): YouTubeData | null {
  return youtubeData;
}

export function setYouTubeData(data: YouTubeData | null) {
  youtubeData = data;
}

export function clearYouTubeData() {
  youtubeData = null;
}

export function setNotebookContent(c: NotebookContent | null) {
  notebookContent = c;
}

export function clearNotebookContent() {
  notebookContent = null;
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
    notebookContent = snapshot.notebookContent;
    error = snapshot.error;
    messages = [];
  }

  // After loading, if the session was in speaking/thinking but audio is now gone,
  // reset to idle so the UI doesn't get stuck in a non-idle animation
  if (agentState === "speaking" || agentState === "thinking") {
    agentState = "idle";
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
    notebookContent,
    error,
  };
}

// --- Background Task Functions ---
export function addTaskNotification(taskId: string, text: string) {
  pendingTaskNotifications = [...pendingTaskNotifications, { taskId, text, receivedAt: Date.now() }];
}

export function popTaskNotification(): TaskNotification | null {
  if (pendingTaskNotifications.length === 0) return null;
  const [first, ...rest] = pendingTaskNotifications;
  pendingTaskNotifications = rest;
  return first;
}

export function getPendingNotifications(): TaskNotification[] {
  return pendingTaskNotifications;
}

export function getActiveTaskCount(): number {
  return activeTaskCount;
}

export function incrementActiveTaskCount() {
  activeTaskCount++;
}

export function decrementActiveTaskCount() {
  if (activeTaskCount > 0) activeTaskCount--;
}

// --- Task Panel Functions ---
export function addTask(id: string, description: string) {
  taskItems = [...taskItems, { id, description, status: "running", createdAt: Date.now() }];
  taskPanelOpen = true;
}

export function completeTask(id: string, resultText?: string) {
  taskItems = taskItems.map(t => t.id === id ? { ...t, status: "done" as const, completedAt: Date.now(), resultText } : t);
}

export function failTask(id: string, errorText?: string) {
  taskItems = taskItems.map(t => t.id === id ? { ...t, status: "error" as const, completedAt: Date.now(), resultText: errorText } : t);
}

export function getTaskItems(): TaskItem[] {
  return taskItems;
}

export function getTaskPanelOpen(): boolean {
  return taskPanelOpen;
}

export function setTaskPanelOpen(open: boolean) {
  taskPanelOpen = open;
}

export function clearCompletedTasks() {
  taskItems = taskItems.filter(t => t.status === "running");
  if (taskItems.length === 0) taskPanelOpen = false;
}

export function removeTask(id: string) {
  taskItems = taskItems.filter(t => t.id !== id);
  if (taskItems.length === 0) taskPanelOpen = false;
}

// --- Token Usage & Summary (F17) ---
export function getTokenUsage(): TokenUsage | null {
  return tokenUsage;
}

export function setTokenUsage(usage: TokenUsage | null) {
  tokenUsage = usage;
}

export function getSummaryPanelOpen(): boolean {
  return summaryPanelOpen;
}

export function setSummaryPanelOpen(open: boolean) {
  summaryPanelOpen = open;
}

export function getLastCompactSuccess(): boolean | null {
  return lastCompactSuccess;
}

export function setLastCompactSuccess(success: boolean | null) {
  lastCompactSuccess = success;
}

// --- Activity Feed (live opencode events for side HUD) ---
import type { ActivityEvent } from "@zerojarvis/shared";

export interface ActivityItem {
  id: number;
  event: ActivityEvent;
  timestamp: number;
}

let activityFeed = $state<ActivityItem[]>([]);
let activityCounter = 0;
const MAX_ACTIVITY_ITEMS = 30;

export function pushActivity(event: ActivityEvent) {
  activityCounter++;
  const item: ActivityItem = { id: activityCounter, event, timestamp: Date.now() };
  activityFeed = [...activityFeed.slice(-(MAX_ACTIVITY_ITEMS - 1)), item];
}

export function getActivityFeed(): ActivityItem[] {
  return activityFeed;
}

export function clearActivityFeed() {
  activityFeed = [];
}
