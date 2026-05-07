/**
 * Multi-Session Manager (F9)
 * Manages multiple parallel OpenCode sessions with voice switching.
 */

import type { SessionTab, SessionStatus, SessionSnapshot, AgentState, NotebookContent } from "@zerojarvis/shared";

export interface ManagedSession {
  id: string;
  openCodeSessionId: string | null; // OpenCode server session ID
  status: SessionStatus;
  title: string;
  lastText: string;                  // Last LLM response text
  agentState: AgentState;            // UI state when this session was last active
  sttText: string;                   // STT text at time of switch
  cameraOn: boolean;
  mapQuery: string;
  youtubeVideoId: string;
  notebookContent: NotebookContent | null;
  error: string | null;
  createdAt: number;
}

const sessions: Map<string, ManagedSession> = new Map();
let activeId: string | null = null;
let sessionOrder: string[] = []; // Maintain insertion order for prev/next

/** Create a new session and make it active */
export function createSession(title?: string): ManagedSession {
  const session: ManagedSession = {
    id: crypto.randomUUID(),
    openCodeSessionId: null,
    status: "processing",
    title: title || "新對話",
    lastText: "",
    agentState: "idle",
    sttText: "",
    cameraOn: false,
    mapQuery: "",
    youtubeVideoId: "",
    notebookContent: null,
    error: null,
    createdAt: Date.now(),
  };
  sessions.set(session.id, session);
  sessionOrder.push(session.id);
  activeId = session.id;
  return session;
}

/** Get the active session */
export function getActive(): ManagedSession | null {
  if (!activeId) return null;
  return sessions.get(activeId) || null;
}

/** Get active session ID */
export function getActiveId(): string | null {
  return activeId;
}

/** Set active session by ID */
export function setActive(id: string): ManagedSession | null {
  if (!sessions.has(id)) return null;
  activeId = id;
  return sessions.get(id)!;
}

/** Switch to previous session */
export function switchPrev(): ManagedSession | null {
  if (sessionOrder.length <= 1) return null;
  const idx = sessionOrder.indexOf(activeId!);
  if (idx <= 0) return null; // Already at first
  activeId = sessionOrder[idx - 1];
  return sessions.get(activeId)!;
}

/** Switch to next session */
export function switchNext(): ManagedSession | null {
  if (sessionOrder.length <= 1) return null;
  const idx = sessionOrder.indexOf(activeId!);
  if (idx >= sessionOrder.length - 1) return null; // Already at last
  activeId = sessionOrder[idx + 1];
  return sessions.get(activeId)!;
}

/** Update session status */
export function setStatus(id: string, status: SessionStatus): void {
  const session = sessions.get(id);
  if (session) session.status = status;
}

/** Update session last text */
export function setLastText(id: string, text: string): void {
  const session = sessions.get(id);
  if (session) session.lastText = text;
}

/** Update session title (auto from first message) */
export function setTitle(id: string, title: string): void {
  const session = sessions.get(id);
  if (session && session.title === "新對話") {
    session.title = title.slice(0, 20);
  }
}

/** Set the OpenCode session ID for a managed session */
export function setOpenCodeSessionId(id: string, openCodeSessionId: string): void {
  const session = sessions.get(id);
  if (session) session.openCodeSessionId = openCodeSessionId;
}

/** Save agent state snapshot for a session (when switching away) */
export function saveSnapshot(id: string, agentState: AgentState): void {
  const session = sessions.get(id);
  if (session) {
    session.agentState = agentState;
  }
}

/** Get session snapshot for switching */
export function getSnapshot(id: string): SessionSnapshot | null {
  const session = sessions.get(id);
  if (!session) return null;
  return {
    llmText: session.lastText,
    sttText: session.sttText,
    agentState: session.agentState,
    cameraOn: session.cameraOn,
    mapQuery: session.mapQuery,
    youtubeVideoId: session.youtubeVideoId,
    notebookContent: session.notebookContent,
    error: session.error,
  };
}

/** Get all sessions as tabs */
export function getAllTabs(): SessionTab[] {
  return sessionOrder.map(id => {
    const s = sessions.get(id)!;
    return {
      id: s.id,
      title: s.title,
      status: s.status,
      active: s.id === activeId,
    };
  });
}

/** Get session by ID */
export function getSession(id: string): ManagedSession | null {
  return sessions.get(id) || null;
}

/** Get total session count */
export function getCount(): number {
  return sessions.size;
}

/** Initialize with a default session if empty */
export function ensureSession(): ManagedSession {
  if (sessions.size === 0) {
    return createSession();
  }
  return getActive()!;
}
