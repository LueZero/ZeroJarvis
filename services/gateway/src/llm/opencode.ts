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
import { getContextLimit } from "./client.js";
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

/** Strip markdown syntax from text so TTS reads naturally.
 *  Removes headings markers, bold/italic markers, code fences, links, emojis, special symbols, etc. */
export function stripMarkdown(text: string): string {
  return text
    // Code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Headings
    .replace(/^#{1,6}\s+/gm, "")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/___(.+?)___/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Strikethrough
    .replace(/~~(.+?)~~/g, "$1")
    // Links [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Blockquotes
    .replace(/^\s*>\s?/gm, "")
    // Unordered list markers
    .replace(/^\s*[-*+]\s+/gm, "")
    // Ordered list markers
    .replace(/^\s*\d+\.\s+/gm, "")
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // HTML tags (basic)
    .replace(/<[^>]+>/g, "")
    // Emojis (Unicode emoji ranges)
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    // Special symbols that TTS reads awkwardly (★☆●○■□▲△▶◀◆◇※→←↑↓✓✗✔✘⚡💡🔥🎉👍📚🔄⏳✅❌⏭️)
    .replace(/[★☆●○■□▲△▶◀◆◇※✓✗✔✘]/g, "")
    // Leftover standalone special punctuation that adds nothing vocally
    .replace(/\s*[|─━═╔╗╚╝╠╣╦╩]+\s*/g, " ")
    // Multiple blank lines → single
    .replace(/\n{3,}/g, "\n\n")
    // Multiple spaces → single
    .replace(/ {2,}/g, " ")
    .trim();
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
  onActivity?: (event: import("@zerojarvis/shared").ActivityEvent) => void,
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
            if (onActivity) {
              onActivity({ kind: "reasoning", text: reasoningText.slice(-120) });
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
              if (onActivity) {
                onActivity({ kind: "tool_start", tool: toolName, input: input.slice(0, 80) });
              }
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
              if (onActivity) {
                onActivity({ kind: "tool_done", tool: toolName, output: fullOutput.slice(0, 120), elapsed });
              }
              toolStartTimes.delete(toolKey);
            } else if (state?.status === "error") {
              log("LLM", `[${ts()}] [TOOL:ERR] ${toolName} → ${state.error ?? "unknown error"}`);
              if (onActivity) {
                onActivity({ kind: "tool_error", tool: toolName, error: (state.error ?? "unknown error").slice(0, 100) });
              }
              toolStartTimes.delete(toolKey);
            } else if (state?.status === "pending") {
              log("LLM", `[${ts()}] [TOOL:PEND] ${toolName}`);
            }
          }

          if (part.type === "step-start") {
            log("LLM", `[${ts()}] [STEP:START] part=${part.id}`);
            if (onActivity) {
              onActivity({ kind: "step_start" });
            }
          }
          if (part.type === "step-finish") {
            const tokens = part.tokens;
            const cost = part.cost ?? 0;
            log("LLM", `[${ts()}] [STEP:FINISH] reason=${part.reason ?? "?"} cost=$${cost.toFixed(4)} tokens=[in:${tokens?.input ?? 0} out:${tokens?.output ?? 0} reasoning:${tokens?.reasoning ?? 0} cache_r:${tokens?.cache?.read ?? 0} cache_w:${tokens?.cache?.write ?? 0}]`);
            if (onActivity) {
              onActivity({
                kind: "step_finish",
                cost,
                tokens: {
                  input: tokens?.input ?? 0,
                  output: tokens?.output ?? 0,
                  reasoning: tokens?.reasoning ?? 0,
                },
              });
            }

            // F17: Accumulate tokens for this session
            if (tokens) {
              const usage = accumulateTokens(sessionId, tokens, cost);
              log("LLM", `[${ts()}] [TOKEN] session ${sessionId.slice(0, 8)}: ${usage.total.toLocaleString()} tokens (${usage.usagePercent}%)`);
            }
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

// ── F16: Structured Output ──

/** JSON Schema for structured worker/vision responses */
const STRUCTURED_OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    text: { type: "string", description: "The response text (without any action markers)" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action name e.g. CAMERA_ON, MAP, NOTEBOOK" },
          payload: { type: "string", description: "Optional action payload" },
        },
        required: ["action"],
      },
      description: "UI actions to trigger",
    },
    asyncTask: { type: "string", description: "Background task description, if any" },
    schedule: {
      type: "object",
      properties: {
        time: { type: "string", description: "ISO 8601 datetime" },
        prompt: { type: "string", description: "Task description" },
      },
      required: ["time", "prompt"],
      description: "One-time scheduled task",
    },
    scheduleRepeat: {
      type: "object",
      properties: {
        freq: { type: "string", description: "Frequency: daily, weekly, Ns, Nm, Nh" },
        time: { type: "string", description: "HH:mm time" },
        prompt: { type: "string", description: "Task description" },
      },
      required: ["freq", "time", "prompt"],
      description: "Recurring scheduled task",
    },
  },
  required: ["text"],
};

export interface StructuredResponse {
  text: string;
  actions?: { action: string; payload?: string }[];
  asyncTask?: string;
  schedule?: { time: string; prompt: string };
  scheduleRepeat?: { freq: string; time: string; prompt: string };
}

/**
 * F16: Structured chat using session.prompt() + format (synchronous).
 * Used by worker and vision — not for main conversation (which needs streaming + TTS).
 * Falls back to regex parsing on structured output failure.
 */
export async function chatStructured(
  sessionId: string,
  message: string,
  agent?: string,
): Promise<StructuredResponse> {
  const client = await getClient();

  try {
    const result = await client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: message }],
        ...(agent ? { agent } : {}),
        format: {
          type: "json_schema",
          schema: STRUCTURED_OUTPUT_SCHEMA,
        },
      },
    } as any);

    const data = (result as any).data ?? result;

    // Check for StructuredOutputError
    if (data?.info?.error?.name === "StructuredOutputError") {
      log("LLM", `[STRUCTURED] StructuredOutputError, falling back to regex`);
      return fallbackRegexParse(data, sessionId);
    }

    // Attempt to extract structured output
    const structured = data?.info?.structured_output ?? data?.info?.structured;
    if (structured && typeof structured === "object" && structured.text) {
      log("LLM", `[STRUCTURED] OK — text=${(structured.text as string).length} chars, actions=${structured.actions?.length ?? 0}`);
      return structured as StructuredResponse;
    }

    // If no structured output, try extracting text and parsing with regex
    log("LLM", `[STRUCTURED] No structured output in response, falling back to regex`);
    return fallbackRegexParse(data, sessionId);

  } catch (err: any) {
    log("LLM", `[STRUCTURED] Error: ${err.message}, falling back to regex`);
    // Try a plain prompt as fallback
    try {
      const fallbackResult = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: message }],
          ...(agent ? { agent } : {}),
        },
      } as any);
      return fallbackRegexParse((fallbackResult as any).data ?? fallbackResult, sessionId);
    } catch (fallbackErr: any) {
      return { text: `Error: ${fallbackErr.message}` };
    }
  }
}

/** Extract text from a prompt response and parse with regex fallback */
function fallbackRegexParse(data: any, sessionId: string): StructuredResponse {
  // Extract text from parts
  let rawText = "";
  const parts = data?.parts ?? [];
  for (const part of parts) {
    if (part?.type === "text" && part?.text) {
      rawText += part.text;
    }
  }

  if (!rawText) {
    rawText = data?.info?.text ?? "";
  }

  // Parse with existing regex functions
  const { cleanText: t1, actions } = parseActions(rawText);
  const { cleanText: t2, taskDescription } = parseAsyncTask(t1);
  const { cleanText: t3, schedule } = parseSchedule(t2);
  const { cleanText: finalText, repeat } = parseScheduleRepeat(t3);

  const result: StructuredResponse = { text: finalText, actions };
  if (taskDescription) result.asyncTask = taskDescription;
  if (schedule) result.schedule = schedule;
  if (repeat) result.scheduleRepeat = repeat;

  return result;
}

// ── F17: Session Summarize ──

/** Token accumulator per OpenCode session */
const sessionTokens: Map<string, { input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; cost: number }> = new Map();

/**
 * Accumulate token usage from a step-finish event.
 * Called from chatStream's event handler.
 * Returns the updated total token count for the session.
 */
export function accumulateTokens(
  openCodeSessionId: string,
  tokens: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } },
  cost: number,
): { total: number; usagePercent: number } {
  const prev = sessionTokens.get(openCodeSessionId) ?? { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  prev.input += tokens.input ?? 0;
  prev.output += tokens.output ?? 0;
  prev.reasoning += tokens.reasoning ?? 0;
  prev.cacheRead += tokens.cache?.read ?? 0;
  prev.cacheWrite += tokens.cache?.write ?? 0;
  prev.cost += cost;
  sessionTokens.set(openCodeSessionId, prev);

  const total = prev.input + prev.output + prev.reasoning + prev.cacheRead + prev.cacheWrite;
  const contextLimit = getContextLimit();
  const usagePercent = contextLimit > 0 ? Math.round((total / contextLimit) * 100) : 0;

  return { total, usagePercent };
}

/** Get token usage for an OpenCode session */
export function getSessionTokens(openCodeSessionId: string) {
  const t = sessionTokens.get(openCodeSessionId);
  if (!t) return null;
  const total = t.input + t.output + t.reasoning + t.cacheRead + t.cacheWrite;
  const contextLimit = getContextLimit();
  return {
    ...t,
    total,
    contextLimit,
    usagePercent: contextLimit > 0 ? Math.round((total / contextLimit) * 100) : 0,
  };
}

/** Reset token tracking for a session (after compaction) */
export function resetSessionTokens(openCodeSessionId: string): void {
  sessionTokens.delete(openCodeSessionId);
}

/** Compaction threshold (70% of context window) */
const COMPACTION_THRESHOLD = 0.7;

/**
 * F17: Summarize (compact) a session to free up context window.
 * Calls session.summarize() on the OpenCode server.
 */
export async function summarizeSession(openCodeSessionId: string): Promise<boolean> {
  try {
    const client = await getClient();
    log("LLM", `[SUMMARIZE] Triggering compaction for session ${openCodeSessionId.slice(0, 8)}`);

    await client.session.summarize({
      path: { id: openCodeSessionId },
      body: {},
    } as any);

    // Reset token tracking after compaction
    resetSessionTokens(openCodeSessionId);
    log("LLM", `[SUMMARIZE] Compaction completed, token counters reset`);
    return true;
  } catch (err: any) {
    log("LLM", `[SUMMARIZE] Failed: ${err.message}`);
    return false;
  }
}

/**
 * Check if a session should be auto-compacted based on token usage.
 * Returns true if compaction was triggered.
 */
export function shouldAutoCompact(openCodeSessionId: string): boolean {
  const usage = getSessionTokens(openCodeSessionId);
  if (!usage) return false;
  return usage.usagePercent >= COMPACTION_THRESHOLD * 100;
}
