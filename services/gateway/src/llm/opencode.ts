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

/** Timestamp formatter for detailed logs */
function ts(): string {
  const d = new Date();
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

/** Parse action markers from LLM response and return clean text + actions.
 *  Handles both plain [ACTION:X] and [ACTION:X:PAYLOAD] with optional backticks. */
export function parseActions(text: string): { cleanText: string; actions: { action: string; payload?: string }[] } {
  const actionRegex = /`?\[ACTION:([A-Z_]+)(?::([^\]]*))?\]`?/g;
  const actions: { action: string; payload?: string }[] = [];
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    actions.push({ action: match[1], payload: match[2] || undefined });
  }
  const cleanText = text.replace(actionRegex, "").trim();
  return { cleanText, actions };
}

/** Map of managedSessionId → OpenCode sessionId */
const openCodeSessions: Map<string, string> = new Map();

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
) {
  const startTime = performance.now();

  try {
    const client = await getClient();
    const sessionId = await getOrCreateOpenCodeSession(managedSessionId);

    log("LLM", `[${ts()}] Prompt → session ${sessionId.slice(0, 8)}: "${message.slice(0, 60)}"`);

    // 1. Subscribe to SSE events BEFORE triggering prompt
    const eventResult = await client.event.subscribe();
    const eventStream = eventResult.stream ?? eventResult;

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

    // 3. Read events with detailed logging
    let fullText = "";
    let done = false;
    let toolStartTimes: Map<string, number> = new Map();

    // Timeout safety (120s max)
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        log("LLM", `[${ts()}] [TIMEOUT] 120s exceeded`);
      }
    }, 120000);

    try {
      for await (const event of eventStream) {
        if (done) break;
        const evt = event as any;
        const props = evt.properties ?? {};

        // Only process events for our session
        const evtSessionId = props.sessionID ?? props.part?.sessionID;
        if (evtSessionId && evtSessionId !== sessionId) continue;

        if (evt.type === "message.part.updated") {
          const part = props.part;
          if (!part) continue;

          // Text streaming
          if (part.type === "text") {
            const newText = part.text ?? "";
            if (newText.length > fullText.length) {
              const delta = newText.slice(fullText.length);
              fullText = newText;
              onDelta(delta);
              // Log first chunk and every 200 chars
              if (fullText.length === delta.length || fullText.length % 200 < delta.length) {
                log("LLM", `[${ts()}] [TEXT] (${fullText.length} chars) "${fullText.slice(-80)}"`);
              }
            }
          }

          // Tool invocation logging with timing
          if (part.type === "tool-invocation") {
            const inv = part.toolInvocation ?? part;
            const toolName = inv.toolName ?? "unknown";
            const state = inv.state ?? "";
            const toolKey = `${toolName}-${inv.toolCallId ?? ""}`;

            if (state === "call" || state === "partial-call") {
              toolStartTimes.set(toolKey, performance.now());
              const args = inv.args ? JSON.stringify(inv.args).slice(0, 120) : "";
              log("LLM", `[${ts()}] [TOOL:CALL] ${toolName}(${args})`);
            } else if (state === "result") {
              const elapsed = toolStartTimes.has(toolKey)
                ? Math.round(performance.now() - toolStartTimes.get(toolKey)!)
                : 0;
              const result = typeof inv.result === "string"
                ? inv.result.slice(0, 200)
                : JSON.stringify(inv.result ?? "").slice(0, 200);
              log("LLM", `[${ts()}] [TOOL:DONE] ${toolName} → ${result} (${elapsed}ms)`);
              toolStartTimes.delete(toolKey);
            } else {
              log("LLM", `[${ts()}] [TOOL] ${toolName} → ${state}`);
            }
          }
        }

        if (evt.type === "session.idle") {
          log("LLM", `[${ts()}] [EVENT] session.idle`);
          done = true;
          break;
        }

        if (evt.type === "session.error") {
          const errMsg = props.error?.name ?? props.error?.message ?? "Unknown error";
          log("LLM", `[${ts()}] [EVENT] session.error: ${errMsg}`);
          throw new Error(`OpenCode error: ${errMsg}`);
        }

        // Log other event types
        if (evt.type !== "message.part.updated") {
          log("LLM", `[${ts()}] [EVENT] ${evt.type}`);
        }
      }
    } catch (streamErr: any) {
      if (!done) throw streamErr;
    } finally {
      clearTimeout(timeout);
    }

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
