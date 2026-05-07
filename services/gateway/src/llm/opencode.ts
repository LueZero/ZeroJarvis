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

    // 0. Check if session is busy, abort if so
    try {
      const statusResult = await client.session.status() as any;
      const statusData = statusResult?.data ?? statusResult;
      const sessionStatus = statusData?.[sessionId];
      if (sessionStatus?.type === "busy") {
        log("LLM", `[${ts()}] Session busy, aborting...`);
        await client.session.abort({ path: { id: sessionId } } as any);
        // Brief wait for abort to take effect
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (statusErr: any) {
      log("LLM", `[${ts()}] [WARN] Status check failed: ${statusErr.message}`);
    }

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
    let reasoningText = "";
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

        // ── message.part.delta: incremental text/reasoning streaming ──
        if (evt.type === "message.part.delta") {
          const delta = props.delta ?? "";
          const partType = props.part?.type ?? props.type;
          const evtPartSessionId = props.part?.sessionID ?? props.sessionID;
          if (evtPartSessionId && evtPartSessionId !== sessionId) continue;

          if (partType === "reasoning") {
            reasoningText += delta;
            if (reasoningText.length <= 30 || reasoningText.length % 200 < (delta.length + 5)) {
              log("LLM", `[${ts()}] [REASONING] (+${delta.length}) (${reasoningText.length} total) "${reasoningText.slice(-100)}"`);
            }
          } else {
            // Default: text delta
            // Skip user echo
            if (delta.trim() === message.trim()) continue;
            fullText += delta;
            onDelta(delta);
            if (fullText.length <= 30 || fullText.length % 200 < (delta.length + 5)) {
              log("LLM", `[${ts()}] [TEXT] (+${delta.length}) (${fullText.length} total) "${fullText.slice(-80)}"`);
            }
          }
          continue;
        }

        // ── message.part.updated: structural part snapshots ──
        if (evt.type === "message.part.updated") {
          const part = props.part;
          if (!part) continue;

          // Text snapshot — sync fullText if delta missed something
          if (part.type === "text") {
            const newText = part.text ?? "";
            // Skip user's own message echo
            if (newText.trim() === message.trim()) continue;
            if (newText.length > fullText.length) {
              const missed = newText.slice(fullText.length);
              fullText = newText;
              onDelta(missed);
              log("LLM", `[${ts()}] [TEXT:SYNC] (+${missed.length}) (${fullText.length} total)`);
            }
          }

          // Reasoning snapshot
          if (part.type === "reasoning") {
            const text = part.text ?? "";
            if (text.length > reasoningText.length) {
              reasoningText = text;
              log("LLM", `[${ts()}] [REASONING:SYNC] (${reasoningText.length} total)`);
            }
          }

          // Tool invocation logging (SDK: type "tool", state.status)
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
              const result = typeof state.output === "string"
                ? state.output.slice(0, 200)
                : JSON.stringify(state.output ?? "").slice(0, 200);
              log("LLM", `[${ts()}] [TOOL:DONE] ${toolName} → ${result} (${elapsed}ms)`);
              toolStartTimes.delete(toolKey);
            } else if (state?.status === "error") {
              log("LLM", `[${ts()}] [TOOL:ERR] ${toolName} → ${state.error ?? "unknown error"}`);
              toolStartTimes.delete(toolKey);
            } else if (state?.status === "pending") {
              log("LLM", `[${ts()}] [TOOL:PEND] ${toolName}`);
            }
          }

          // Step start/finish for token tracking
          if (part.type === "step-start") {
            log("LLM", `[${ts()}] [STEP:START] part=${part.id}`);
          }
          if (part.type === "step-finish") {
            const tokens = part.tokens;
            const cost = part.cost ?? 0;
            log("LLM", `[${ts()}] [STEP:FINISH] reason=${part.reason ?? "?"} cost=$${cost.toFixed(4)} tokens=[in:${tokens?.input ?? 0} out:${tokens?.output ?? 0} reasoning:${tokens?.reasoning ?? 0} cache_r:${tokens?.cache?.read ?? 0} cache_w:${tokens?.cache?.write ?? 0}]`);
          }
          continue;
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

        // Log other event types (skip high-frequency ones)
        if (evt.type !== "message.updated") {
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
