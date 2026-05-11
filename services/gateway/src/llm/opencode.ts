/**
 * LLM chat via OpenCode server (http://localhost:4096)
 * Uses the OpenCode SDK with event streaming for real-time responses.
 *
 * Architecture:
 *   User voice → STT (Groq Whisper) → text
 *   text → OpenCode session.chat() → Agent Loop (LLM + tools) → response
 *   response → TTS → voice output
 *
 * Multi-Session (F9):
 *   Each managed session has its own OpenCode session ID.
 *   chatStream accepts a managedSessionId to route to the correct session.
 *   Background sessions continue processing while user interacts with active session.
 *
 * Streaming Logs (F10):
 *   All SSE events logged with timestamps and timing info.
 */

import { getClient } from "./client.js";
import { log } from "../logger.js";
import * as sessionManager from "../session/manager.js";
import * as eventHub from "../task/event-hub.js";

/** Timestamp formatter for detailed logs */
function ts(): string {
  const d = new Date();
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

/** Parse action markers from LLM response and return clean text + actions.
 *  Handles both plain [ACTION:X] and [ACTION:X:PAYLOAD] with optional backticks.
 *  For JSON payloads (starting with {), uses brace-counting to handle nested brackets. */
export function parseActions(text: string): { cleanText: string; actions: { action: string; payload?: string }[] } {
  const actions: { action: string; payload?: string }[] = [];
  const spans: [number, number][] = []; // regions to remove from text

  const prefix = /`?\[ACTION:([A-Z_]+)(?::)?/g;
  let m;
  while ((m = prefix.exec(text)) !== null) {
    const actionName = m[1];
    const afterPrefix = m.index + m[0].length;

    // No payload — expect immediate ]
    if (text[afterPrefix - 1] !== ':' || text[afterPrefix] === ']') {
      const end = text.indexOf(']', afterPrefix);
      if (end === -1) continue;
      const endPos = text[end + 1] === '`' ? end + 2 : end + 1;
      actions.push({ action: actionName, payload: undefined });
      spans.push([m.index, endPos]);
      continue;
    }

    // Has payload — check if JSON (starts with {)
    if (text[afterPrefix] === '{') {
      // Brace-counting to find matching end
      let depth = 0;
      let i = afterPrefix;
      for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
      }
      if (depth !== 0) continue; // malformed
      const payload = text.slice(afterPrefix, i + 1);
      // Expect ] after the JSON
      const afterJson = i + 1;
      const closeBracket = text.indexOf(']', afterJson);
      if (closeBracket === -1) continue;
      const endPos = text[closeBracket + 1] === '`' ? closeBracket + 2 : closeBracket + 1;
      actions.push({ action: actionName, payload });
      spans.push([m.index, endPos]);
    } else {
      // Simple payload — find next ]
      const end = text.indexOf(']', afterPrefix);
      if (end === -1) continue;
      const payload = text.slice(afterPrefix, end);
      const endPos = text[end + 1] === '`' ? end + 2 : end + 1;
      actions.push({ action: actionName, payload });
      spans.push([m.index, endPos]);
    }
  }

  // Remove action spans from text (reverse order to preserve indices)
  let cleanText = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    cleanText = cleanText.slice(0, spans[i][0]) + cleanText.slice(spans[i][1]);
  }
  return { cleanText: cleanText.trim(), actions };
}

/** Map of managedSessionId → OpenCode sessionId */
const openCodeSessions: Map<string, string> = new Map();

/** Parse [ASYNC_TASK:description] markers from LLM response */
export function parseAsyncTask(text: string): { cleanText: string; taskDescription: string | null } {
  const pattern = /\[ASYNC_TASK:([^\]]+)\]/g;
  let taskDescription: string | null = null;
  let cleanText = text;

  const match = pattern.exec(text);
  if (match) {
    taskDescription = match[1].trim();
    cleanText = text.slice(0, match.index) + text.slice(match.index + match[0].length);
    cleanText = cleanText.trim();
  } else {
    // Fallback: strip any malformed [ASYNC_TASK:...] markers
    cleanText = text.replace(/\[ASYNC_TASK:[^\]]*\]/g, "").trim();
  }
  return { cleanText, taskDescription };
}

/** Parse [SCHEDULE:ISO_TIME:description] markers from LLM response.
 *  ISO times contain colons (e.g. 2026-05-11T15:00:00), so we match the time part
 *  with a specific date-time pattern first, then the description after the last colon. */
export function parseSchedule(text: string): { cleanText: string; schedule: { time: string; prompt: string } | null } {
  // Match ISO datetime (with or without seconds, timezone), then optionally :description
  const pattern = /\[SCHEDULE:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)(?::([^\]]+))?\]/g;
  let schedule: { time: string; prompt: string } | null = null;
  let cleanText = text;

  const match = pattern.exec(text);
  if (match) {
    const time = match[1].trim();
    const prompt = match[2]?.trim() || "排程任務";
    schedule = { time, prompt };
    cleanText = text.slice(0, match.index) + text.slice(match.index + match[0].length);
    cleanText = cleanText.trim();
  } else {
    // Fallback: strip any malformed [SCHEDULE:...] markers so TTS doesn't read them
    cleanText = text.replace(/\[SCHEDULE:[^\]]*\]/g, "").trim();
  }
  return { cleanText, schedule };
}

/** Parse [SCHEDULE_REPEAT:freq:HH:mm:description] markers.
 *  freq = daily|weekly|monthly|yearly|Ns|Nm|Nh  (e.g. 30s, 5m, 2h) */
export function parseScheduleRepeat(text: string): { cleanText: string; repeat: { freq: string; time: string; prompt: string } | null } {
  const pattern = /\[SCHEDULE_REPEAT:(\d+[smh]|hourly|daily|weekly|monthly|yearly):(\d{2}:\d{2}):([^\]]+)\]/g;
  let repeat: { freq: string; time: string; prompt: string } | null = null;
  let cleanText = text;

  const match = pattern.exec(text);
  if (match) {
    // Normalize: "hourly" → "1h"
    const rawFreq = match[1] === "hourly" ? "1h" : match[1];
    repeat = { freq: rawFreq, time: match[2], prompt: match[3].trim() };
    cleanText = text.slice(0, match.index) + text.slice(match.index + match[0].length);
    cleanText = cleanText.trim();
  } else {
    // Fallback: strip any malformed [SCHEDULE_REPEAT:...] markers
    cleanText = text.replace(/\[SCHEDULE_REPEAT:[^\]]*\]/g, "").trim();
  }
  return { cleanText, repeat };
}

/** Parse [MEMORY:name:type:content] markers from AI response */
export function parseMemory(text: string): { cleanText: string; memories: { name: string; type: string; content: string }[] | null } {
  const pattern = /\[MEMORY:([^:]+):([^:]+):([^\]]+)\]/g;
  const memories: { name: string; type: string; content: string }[] = [];
  let cleanText = text;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    memories.push({
      name: match[1].trim(),
      type: match[2].trim(),
      content: match[3].trim(),
    });
    cleanText = cleanText.replace(match[0], "");
  }

  cleanText = cleanText.trim();
  return { cleanText, memories: memories.length > 0 ? memories : null };
}

/** Get or create an OpenCode session for a managed session */
async function getOrCreateOpenCodeSession(managedSessionId: string): Promise<string> {
  const existing = openCodeSessions.get(managedSessionId);
  if (existing) return existing;

  const client = await getClient();
  const result = await client.session.create();
  const session = (result as any).data ?? result;
  const sessionId = session?.id;
  if (!sessionId) {
    throw new Error(`Failed to create OpenCode session: ${JSON.stringify(result)}`);
  }
  openCodeSessions.set(managedSessionId, sessionId);
  sessionManager.setOpenCodeSessionId(managedSessionId, sessionId);
  log("SESSION", `OpenCode session created: ${sessionId} (managed: ${managedSessionId.slice(0, 8)})`);
  return sessionId;
}

/** Reset a specific managed session's OpenCode session */
export function resetSession(managedSessionId?: string) {
  if (managedSessionId) {
    openCodeSessions.delete(managedSessionId);
  } else {
    // Legacy: clear all
    openCodeSessions.clear();
  }
}

/**
 * Streaming chat via OpenCode with enhanced logging (F10).
 * Supports multi-session routing (F9).
 * Uses global EventHub for SSE event dispatch.
 *
 * @param message - User message text
 * @param managedSessionId - Which managed session to use
 * @param onDelta - Called with each text chunk
 * @param onDone - Called with full response text
 * @param onError - Called on error
 */
export async function chatStream(
  message: string,
  managedSessionId: string,
  onDelta: (text: string) => void,
  onDone: (fullText: string) => void,
  onError: (err: Error) => void,
  onToolResult?: (toolName: string, output: string) => void,
) {
  const startTime = performance.now();

  try {
    const client = await getClient();
    const sessionId = await getOrCreateOpenCodeSession(managedSessionId);

    log("LLM", `[${ts()}] Prompt → session ${sessionId.slice(0, 8)}: "${message.slice(0, 60)}"`);

    // 0. Check if session is busy, abort if so
    try {
      const statusResult = await client.session.status() as any;
      const statusData = statusResult?.data ?? statusResult;
      const sessionStatus = statusData?.[sessionId];
      if (sessionStatus?.type === "busy") {
        log("LLM", `[${ts()}] Session busy, aborting...`);
        await client.session.abort({ path: { id: sessionId } } as any);
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (statusErr: any) {
      log("LLM", `[${ts()}] [WARN] Status check failed: ${statusErr.message}`);
    }

    // 1. Set up promise-based completion via EventHub
    let fullText = "";
    let reasoningText = "";
    let done = false;
    let toolStartTimes: Map<string, number> = new Map();

    const completionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          log("LLM", `[${ts()}] [TIMEOUT] 120s exceeded`);
          eventHub.off(sessionId);
          resolve();
        }
      }, 120000);

      // Register handler for this session's events
      eventHub.on(sessionId, (evt: any) => {
        if (done) return;
        const props = evt.properties ?? {};

        // ── message.part.delta: incremental text/reasoning streaming ──
        if (evt.type === "message.part.delta") {
          const delta = props.delta ?? "";
          const partType = props.part?.type ?? props.type;

          if (partType === "reasoning") {
            reasoningText += delta;
            if (reasoningText.length <= 30 || reasoningText.length % 200 < (delta.length + 5)) {
              log("LLM", `[${ts()}] [REASONING] (+${delta.length}) (${reasoningText.length} total) "${reasoningText.slice(-100)}"`);
            }
          } else {
            if (delta.trim() === message.trim()) return;
            fullText += delta;
            onDelta(delta);
            if (fullText.length <= 30 || fullText.length % 200 < (delta.length + 5)) {
              log("LLM", `[${ts()}] [TEXT] (+${delta.length}) (${fullText.length} total) "${fullText.slice(-80)}"`);
            }
          }
          return;
        }

        // ── message.part.updated: structural part snapshots ──
        if (evt.type === "message.part.updated") {
          const part = props.part;
          if (!part) return;

          if (part.type === "text") {
            const newText = part.text ?? "";
            if (newText.trim() === message.trim()) return;
            if (newText.length > fullText.length) {
              const missed = newText.slice(fullText.length);
              fullText = newText;
              onDelta(missed);
              log("LLM", `[${ts()}] [TEXT:SYNC] (+${missed.length}) (${fullText.length} total)`);
            }
          }

          if (part.type === "reasoning") {
            const text = part.text ?? "";
            if (text.length > reasoningText.length) {
              reasoningText = text;
              log("LLM", `[${ts()}] [REASONING:SYNC] (${reasoningText.length} total)`);
            }
          }

          if (part.type === "tool") {
            const toolName = part.tool ?? "unknown";
            const state = part.state;
            const toolKey = `${toolName}-${part.callID ?? part.id ?? ""}`;

            if (state?.status === "running") {
              toolStartTimes.set(toolKey, performance.now());
              const input = state.input ? JSON.stringify(state.input).slice(0, 120) : "";
              log("LLM", `[${ts()}] [TOOL:CALL] ${toolName}(${input})`);
            } else if (state?.status === "completed") {
              const elapsed = toolStartTimes.has(toolKey)
                ? Math.round(performance.now() - toolStartTimes.get(toolKey)!)
                : 0;
              const fullOutput = typeof state.output === "string"
                ? state.output
                : JSON.stringify(state.output ?? "");
              log("LLM", `[${ts()}] [TOOL:DONE] ${toolName} → ${fullOutput.slice(0, 200)} (${elapsed}ms)`);
              if (onToolResult) {
                onToolResult(toolName, fullOutput);
              }
              toolStartTimes.delete(toolKey);
            } else if (state?.status === "error") {
              log("LLM", `[${ts()}] [TOOL:ERR] ${toolName} → ${state.error ?? "unknown error"}`);
              toolStartTimes.delete(toolKey);
            } else if (state?.status === "pending") {
              log("LLM", `[${ts()}] [TOOL:PEND] ${toolName}`);
            }
          }

          if (part.type === "step-start") {
            log("LLM", `[${ts()}] [STEP:START] part=${part.id}`);
          }
          if (part.type === "step-finish") {
            const tokens = part.tokens;
            const cost = part.cost ?? 0;
            log("LLM", `[${ts()}] [STEP:FINISH] reason=${part.reason ?? "?"} cost=$${cost.toFixed(4)} tokens=[in:${tokens?.input ?? 0} out:${tokens?.output ?? 0} reasoning:${tokens?.reasoning ?? 0} cache_r:${tokens?.cache?.read ?? 0} cache_w:${tokens?.cache?.write ?? 0}]`);
          }
          return;
        }

        if (evt.type === "session.idle") {
          log("LLM", `[${ts()}] [EVENT] session.idle`);
          done = true;
          clearTimeout(timeout);
          eventHub.off(sessionId);
          resolve();
          return;
        }

        if (evt.type === "session.error") {
          const errMsg = props.error?.name ?? props.error?.message ?? "Unknown error";
          log("LLM", `[${ts()}] [EVENT] session.error: ${errMsg}`);
          done = true;
          clearTimeout(timeout);
          eventHub.off(sessionId);
          reject(new Error(`OpenCode error: ${errMsg}`));
          return;
        }

        if (evt.type !== "message.updated") {
          log("LLM", `[${ts()}] [EVENT] ${evt.type}`);
        }
      });
    });

    // 2. Fire promptAsync with agent: "jarvis"
    client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: message }],
        agent: "jarvis",
      },
    } as any).catch((err: any) => {
      log("LLM", `[${ts()}] [ERROR] promptAsync: ${err.message}`);
    });

    // 3. Wait for completion
    await completionPromise;

    // Fallback: if events gave no text, fetch from messages API
    if (!fullText) {
      log("LLM", `[${ts()}] No text from events, fetching messages...`);
      const msgs = await client.session.messages({ path: { id: sessionId } } as any);
      const messagesData = (msgs as any).data ?? msgs;
      if (Array.isArray(messagesData)) {
        for (let i = messagesData.length - 1; i >= 0; i--) {
          const msg = messagesData[i];
          if (msg.info?.role === "assistant") {
            for (const part of msg.parts ?? []) {
              if (part?.type === "text" && part?.text) {
                fullText += part.text;
              }
            }
            break;
          }
        }
      }
    }

    const llmTime = Math.round(performance.now() - startTime);
    log("LLM", `[${ts()}] [DONE] ${fullText.length} chars, ${llmTime}ms: "${fullText.slice(0, 80)}..."`);

    if (fullText) {
      onDone(fullText);
    } else {
      onError(new Error("OpenCode returned empty response"));
    }
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - startTime);
    log("LLM", `[${ts()}] [ERROR] ${err.message} (after ${elapsed}ms)`);
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Non-streaming chat (convenience wrapper)
 */
export async function chat(message: string, managedSessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chatStream(
      message,
      managedSessionId,
      () => {},
      (full) => resolve(full),
      (err) => reject(err),
    );
  });
}
