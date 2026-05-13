import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage, AgentState, NotebookContentType } from "@zerojarvis/shared";
import { transcribe } from "../stt/whisper.js";
import { chatStream, resetSession, parseActions, parseAsyncTask, parseSchedule, parseScheduleRepeat, parseMemory, getSessionTokens, summarizeSession, shouldAutoCompact } from "../llm/opencode.js";
import { processVision } from "../vision/processor.js";
import { synthesize } from "../tts/edge-tts.js";
import { polish } from "../polish/polisher.js";
import { log, logWarn, logError } from "../logger.js";
import * as sessionManager from "../session/manager.js";
import { checkHealth, fetchContextLimit } from "../llm/client.js";
import * as taskQueue from "../task/queue.js";
import * as taskWorker from "../task/worker.js";
import * as scheduler from "../task/scheduler.js";
import * as eventHub from "../task/event-hub.js";
import * as memory from "../task/memory.js";

interface WSData {
  id: string;
  state: AgentState;
  audioChunks: ArrayBuffer[];
  processing: boolean;
  cameraOn: boolean;
  lastSttText: string;
  notebookActive: boolean;
  notebookType: NotebookContentType | null;
}

/** Session command patterns (loose match — tolerates punctuation and filler words) */
const SESSION_COMMANDS: { cmd: "new" | "prev" | "next"; pattern: RegExp }[] = [
  { cmd: "new", pattern: /新(的)?對話|開新的|new\s*chat/i },
  { cmd: "prev", pattern: /(上|前)一個|切(到|換)?上一個|previous/i },
  { cmd: "next", pattern: /(下|後)一個|切(到|換)?下一個|next/i },
];

/** Detect session voice commands from STT text */
function detectSessionCommand(text: string): "new" | "prev" | "next" | null {
  // Strip common punctuation Whisper may add
  const cleaned = text.trim().replace(/[。，！？、.!?,\s]+$/g, "");
  // Only match if the cleaned text is short (avoid false positives in longer sentences)
  if (cleaned.length > 8) return null;
  for (const { cmd, pattern } of SESSION_COMMANDS) {
    if (pattern.test(cleaned)) return cmd;
  }
  return null;
}

// ── Notebook voice command patterns ──
type NotebookCmd =
  | { cmd: "answer"; value: number }
  | { cmd: "next" | "prev" | "flip" | "reset" | "close" | "expand" | "collapse" | "scroll_down" | "scroll_up" };

const NOTEBOOK_COMMANDS_QUIZ: { match: RegExp; result: NotebookCmd }[] = [
  { match: /^[Aa]$|^答[Aa]$|^選[Aa]$/,   result: { cmd: "answer", value: 0 } },
  { match: /^[Bb]$|^答[Bb]$|^選[Bb]$/,   result: { cmd: "answer", value: 1 } },
  { match: /^[Cc]$|^答[Cc]$|^選[Cc]$/,   result: { cmd: "answer", value: 2 } },
  { match: /^[Dd]$|^答[Dd]$|^選[Dd]$/,   result: { cmd: "answer", value: 3 } },
  { match: /下一題|next/i,                result: { cmd: "next" } },
  { match: /上一題|prev/i,                result: { cmd: "prev" } },
  { match: /重新開始|reset/i,             result: { cmd: "reset" } },
];

const NOTEBOOK_COMMANDS_FLASHCARDS: { match: RegExp; result: NotebookCmd }[] = [
  { match: /翻(轉|開|面)|flip/i,           result: { cmd: "flip" } },
  { match: /下一張|next/i,                 result: { cmd: "next" } },
  { match: /上一張|prev/i,                 result: { cmd: "prev" } },
];

const NOTEBOOK_COMMANDS_MINDMAP: { match: RegExp; result: NotebookCmd }[] = [
  { match: /展開|expand/i,                 result: { cmd: "expand" } },
  { match: /收合|collapse/i,               result: { cmd: "collapse" } },
];

const NOTEBOOK_COMMANDS_COMMON: { match: RegExp; result: NotebookCmd }[] = [
  { match: /^關閉$|^close$/i,              result: { cmd: "close" } },
  { match: /往下|向下|scroll\s*down/i,     result: { cmd: "scroll_down" } },
  { match: /往上|向上|scroll\s*up/i,       result: { cmd: "scroll_up" } },
];

/** Detect notebook voice commands based on current content type */
function detectNotebookCommand(text: string, contentType: NotebookContentType | null): NotebookCmd | null {
  const cleaned = text.trim().replace(/[。，！？、.!?,\s]+$/g, "");
  if (cleaned.length > 10) return null;

  // Type-specific commands first
  const typeCommands = contentType === "quiz" ? NOTEBOOK_COMMANDS_QUIZ
    : contentType === "flashcards" ? NOTEBOOK_COMMANDS_FLASHCARDS
    : contentType === "mindmap" ? NOTEBOOK_COMMANDS_MINDMAP
    : [];

  for (const { match, result } of typeCommands) {
    if (match.test(cleaned)) return result;
  }
  // Common commands
  for (const { match, result } of NOTEBOOK_COMMANDS_COMMON) {
    if (match.test(cleaned)) return result;
  }
  return null;
}

function send(ws: ServerWebSocket<WSData>, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
  if (msg.type === "action") {
    if ((msg as any).action === "CAMERA_ON") ws.data.cameraOn = true;
    else if ((msg as any).action === "CAMERA_OFF") ws.data.cameraOn = false;
  }
}

function setState(ws: ServerWebSocket<WSData>, state: AgentState) {
  ws.data.state = state;
  send(ws, { type: "state", state });
}

/** Send current session list to client */
function sendSessionList(ws: ServerWebSocket<WSData>) {
  send(ws, { type: "session_list", sessions: sessionManager.getAllTabs() } as any);
}

/** F17: Send token usage update to client for the active session */
function sendTokenUpdate(ws: ServerWebSocket<WSData>) {
  const active = sessionManager.getActive();
  if (!active?.openCodeSessionId) {
    log("LLM", `[TOKEN_UPDATE] Skip: no openCodeSessionId (active=${active?.id?.slice(0, 8) ?? "null"})`);
    return;
  }
  const usage = getSessionTokens(active.openCodeSessionId);
  if (!usage) {
    log("LLM", `[TOKEN_UPDATE] Skip: no token data for ${active.openCodeSessionId.slice(0, 8)}`);
    return;
  }
  log("LLM", `[TOKEN_UPDATE] Sending: ${usage.total.toLocaleString()} tokens (${usage.usagePercent}%) cost=$${usage.cost.toFixed(4)}`);
  sessionManager.setTokenUsage(active.id, usage);
  send(ws, { type: "token_update", usage } as any);

  // Auto-compaction check
  if (shouldAutoCompact(active.openCodeSessionId)) {
    log("LLM", `[TOKEN] Session ${active.id.slice(0, 8)} at ${usage.usagePercent}% — auto-compaction recommended`);
  }
}

/** Active WebSocket connection (single-client model) */
let activeWs: ServerWebSocket<WSData> | null = null;

/** Start background systems (EventHub, Scheduler, Task notifications) */
export async function startBackgroundSystems(): Promise<void> {
  // F14: Health check — verify OpenCode server is reachable
  const health = await checkHealth();

  // F17: If healthy, fetch context limit for token tracking
  if (health.healthy) {
    await fetchContextLimit();
  }

  // Initialize memory system
  memory.ensureDir();
  log("INIT", "Memory system initialized");

  // Load historical task results
  taskQueue.loadHistory();

  // Start global SSE event hub
  await eventHub.start();
  log("INIT", "EventHub started");

  // Start scheduler
  scheduler.start();
  log("INIT", "Scheduler started");

  // Listen for task completions and notify client
  taskQueue.onDone(async (task) => {
    if (!activeWs) return;
    const ws = activeWs;

    if (task.status === "done" && task.result) {
      log("TASK_NOTIFY", `Task ${task.id.slice(0, 8)} done, notifying client`);
      send(ws, { type: "task_done", taskId: task.id, text: task.result } as any);

      // TTS: speak the result — interrupt if user is just passively listening
      const canSpeak = !ws.data.processing;
      log("TASK_NOTIFY", `State=${ws.data.state} processing=${ws.data.processing} canSpeak=${canSpeak}`);
      if (canSpeak) {
        try {
          setState(ws, "speaking");
          const audioData = await synthesize(task.result);
          ws.send(audioData);
          send(ws, { type: "tts_end" });
          setState(ws, "idle");
        } catch (ttsErr) {
          logWarn("TASK_NOTIFY", `TTS failed for task result: ${ttsErr}`);
          setState(ws, "idle");
        }
      } else {
        log("TASK_NOTIFY", `Skipped TTS — user is busy`);
      }
    } else if (task.status === "error") {
      send(ws, { type: "task_error", taskId: task.id, error: task.error ?? "未知錯誤" } as any);
    }
  });
}

export function handleWebSocket() {
  return {
    open(ws: ServerWebSocket<WSData>) {
      ws.data = {
        id: crypto.randomUUID(),
        state: "idle",
        audioChunks: [],
        processing: false,
        cameraOn: false,
        lastSttText: "",
        notebookActive: false,
        notebookType: null,
      };
      log("WS", `Client connected: ${ws.data.id}`);
      activeWs = ws; // Track active connection for task notifications
      // Ensure at least one session exists
      sessionManager.ensureSession();
      setState(ws, "idle");
      sendSessionList(ws);
    },

    async message(ws: ServerWebSocket<WSData>, message: string | ArrayBuffer) {
      // Binary = raw audio data
      if (typeof message !== "string") {
        if (ws.data.processing) {
          logWarn("WS", "Already processing, ignoring audio");
          return;
        }
        const buf = message instanceof ArrayBuffer ? message : (message as any).buffer ?? message;
        log("AUDIO", `Received audio: ${buf.byteLength} bytes`);
        ws.data.audioChunks.push(buf);
        await processAudio(ws);
        return;
      }

      let msg: ClientMessage;
      try {
        msg = JSON.parse(message);
      } catch {
        logWarn("WS", `Failed to parse message: ${message.slice(0, 100)}`);
        return;
      }

      log("WS", `Message: type=${msg.type}${msg.type === "audio_text" ? ` text="${msg.text}"` : ""}`);

      switch (msg.type) {
        case "audio": {
          ws.data.audioChunks.push(msg.data);
          break;
        }

        case "audio_text": {
          // Text input (typed by user) — send directly to LLM like voice
          log("STT", `Received transcribed text: "${msg.text}"`);
          send(ws, { type: "stt_final", text: msg.text });
          ws.data.lastSttText = msg.text;

          if (!msg.text.trim()) {
            setState(ws, "idle");
            break;
          }

          // Notebook voice command interception (text input path)
          if (ws.data.notebookActive) {
            const nbCmd = detectNotebookCommand(msg.text, ws.data.notebookType);
            if (nbCmd) {
              log("NOTEBOOK_CMD", `Detected (text): ${JSON.stringify(nbCmd)} from "${msg.text}"`);
              send(ws, { type: "action", action: "NOTEBOOK_CMD", payload: JSON.stringify(nbCmd) } as any);
              setState(ws, "idle");
              break;
            }
          }

          if (ws.data.processing) {
            logWarn("WS", "Already processing, ignoring text input");
            break;
          }

          ws.data.processing = true;
          setState(ws, "thinking");

          const activeSessionText = sessionManager.getActive();
          if (activeSessionText) {
            sessionManager.setTitle(activeSessionText.id, msg.text);
            sessionManager.setStatus(activeSessionText.id, "processing");
            sendSessionList(ws);
          }

          const managedId = activeSessionText?.id ?? sessionManager.ensureSession().id;
          const textPipelineStart = performance.now();

          try {
            let fullText = "";
            let suppressDelta = false; // Stop sending deltas once [ACTION: pattern starts
            await chatStream(
              msg.text,
              managedId,
              (delta) => {
                fullText += delta;
                if (sessionManager.getActiveId() === managedId && !suppressDelta) {
                  // Check if we've hit an ACTION tag or ASYNC_TASK tag in the accumulated text
                  if (fullText.includes("[ACTION:") || fullText.includes("[ASYNC_TASK:") || fullText.includes("[SCHEDULE:") || fullText.includes("[SCHEDULE_REPEAT:")) {
                    suppressDelta = true;
                    const tagIdx = Math.min(
                      ...[fullText.indexOf("[ACTION:"), fullText.indexOf("[ASYNC_TASK:"), fullText.indexOf("[SCHEDULE:"), fullText.indexOf("[SCHEDULE_REPEAT:")].filter(i => i >= 0)
                    );
                    const alreadySent = fullText.length - delta.length;
                    if (tagIdx > alreadySent) {
                      send(ws, { type: "llm_delta", text: delta.slice(0, tagIdx - alreadySent) });
                    }
                  } else {
                    send(ws, { type: "llm_delta", text: delta });
                  }
                }
              },
              (text) => {
                fullText = text;
                sessionManager.setLastText(managedId, text);
                sessionManager.setStatus(managedId, "done");

                // Parse all marker types
                let processedText = fullText;
                const { cleanText: t1, actions } = parseActions(processedText);
                processedText = t1;
                const { cleanText: t2, taskDescription } = parseAsyncTask(processedText);
                processedText = t2;
                const { cleanText: t3, schedule } = parseSchedule(processedText);
                processedText = t3;
                const { cleanText: t4, repeat } = parseScheduleRepeat(processedText);
                processedText = t4;
                const { cleanText: finalText, memories } = parseMemory(processedText);

                // Save AI-generated memories
                if (memories) {
                  for (const m of memories) {
                    memory.saveMemory(m.name, m.type as any, "", m.content);
                  }
                }

                if (sessionManager.getActiveId() === managedId) {
                  log("LLM", `Response: "${finalText.slice(0, 80)}..."`);
                  send(ws, { type: "llm_done", text: finalText });
                  for (const a of actions) {
                    log("ACTION", `Sending action: ${a.action} payload="${(a.payload || "").slice(0, 40)}"`);
                    send(ws, { type: "action", action: a.action, payload: a.payload });
                  }
                } else {
                  send(ws, { type: "session_done", sessionId: managedId, text: finalText } as any);
                }

                // ── Async Task dispatch ──
                if (taskDescription) {
                  log("TASK", `AI requested async task: "${taskDescription}"`);
                  const task = taskQueue.createTask({
                    prompt: taskDescription,
                    originalPrompt: msg.text,
                    parentSessionId: managedId,
                    type: "async",
                  });
                  send(ws, { type: "task_created", taskId: task.id, description: taskDescription } as any);
                  // Dispatch to worker (fire-and-forget)
                  taskWorker.execute(task).catch(err => {
                    logError("TASK", `Worker dispatch failed: ${err}`);
                  });
                }

                // ── Schedule dispatch ──
                if (schedule) {
                  const scheduledAt = new Date(schedule.time).getTime();
                  if (!isNaN(scheduledAt)) {
                    log("SCHEDULER", `Scheduling task at ${schedule.time}: "${schedule.prompt}"`);
                    const schedTask = scheduler.scheduleOnce(schedule.prompt, scheduledAt, managedId);
                    send(ws, { type: "task_created", taskId: schedTask.id, description: `排程：${schedule.prompt}` } as any);
                  }
                }

                // ── Repeat schedule dispatch ──
                if (repeat) {
                  log("SCHEDULER", `Scheduling repeat (${repeat.freq} ${repeat.time}): "${repeat.prompt}"`);
                  const repTask = scheduler.scheduleRepeat(repeat.prompt, repeat.time, repeat.freq, managedId);
                  send(ws, { type: "task_created", taskId: repTask.id, description: `重複排程：${repeat.prompt}` } as any);
                }

                sendTokenUpdate(ws);
                sendSessionList(ws);
              },
              (err) => { throw err; },
              (toolName, output) => {
                if (toolName.includes("search_restaurants")) {
                  try {
                    const data = JSON.parse(output);
                    send(ws, { type: "food_results", data } as any);
                    log("FOOD", `MCP tool returned ${data.restaurants?.length ?? 0} restaurants`);
                  } catch {}
                }
                if (toolName.includes("search_opentable")) {
                  try {
                    const data = JSON.parse(output);
                    send(ws, { type: "opentable_results", data } as any);
                    log("OPENTABLE", `MCP tool returned ${data.results?.length ?? 0} restaurants, found=${data.found}`);
                  } catch {}
                }
              },
              (event) => send(ws, { type: "activity", event } as any),
            );

            const llmTime = Math.round(performance.now() - textPipelineStart);

            // Re-parse to get final clean text for TTS (all markers already processed in onDone)
            let ttsText = fullText;
            ttsText = parseActions(ttsText).cleanText;
            ttsText = parseAsyncTask(ttsText).cleanText;
            ttsText = parseSchedule(ttsText).cleanText;
            ttsText = parseScheduleRepeat(ttsText).cleanText;
            ttsText = parseMemory(ttsText).cleanText;
            if (ttsText && sessionManager.getActiveId() === managedId) {
              setState(ws, "speaking");
              const ttsStart = performance.now();
              try {
                const audioData = await synthesize(ttsText);
                const ttsTime = Math.round(performance.now() - ttsStart);
                log("TTS", `Synthesized ${audioData.byteLength} bytes (${ttsTime}ms)`);
                ws.send(audioData);
                send(ws, { type: "tts_end" });
                ws.data.state = "idle";
                log("TIMING", `stt=0ms llm=${llmTime}ms tts=${ttsTime}ms total=${Math.round(performance.now() - textPipelineStart)}ms`);
              } catch (ttsErr) {
                logWarn("TTS", `Failed: ${ttsErr}`);
                setState(ws, "idle");
              }
            } else {
              setState(ws, "idle");
            }

          } catch (err) {
            sessionManager.setStatus(managedId, "error");
            sendSessionList(ws);
            logError("LLM", `Chat failed: ${err}`);
            send(ws, { type: "error", message: `對話失敗: ${err}` });
            setState(ws, "idle");
          } finally {
            ws.data.processing = false;
          }
          break;
        }

        case "confirm": {
          // User confirmed → send to active session's LLM
          const activeSession = sessionManager.getActive();
          if (!activeSession) {
            send(ws, { type: "error", message: "No active session" });
            setState(ws, "idle");
            return;
          }

          setState(ws, "thinking");
          sessionManager.setStatus(activeSession.id, "processing");
          sessionManager.setTitle(activeSession.id, msg.text);

          try {
            let fullText = "";
            await chatStream(
              msg.text,
              activeSession.id,
              (delta) => {
                fullText += delta;
                // Only send delta to frontend if this is still the active session
                if (sessionManager.getActiveId() === activeSession.id) {
                  send(ws, { type: "llm_delta", text: delta });
                }
              },
              (text) => {
                fullText = text;
                sessionManager.setLastText(activeSession.id, text);
                sessionManager.setStatus(activeSession.id, "done");

                const { cleanText, actions } = parseActions(fullText);

                // If still active, send normally
                if (sessionManager.getActiveId() === activeSession.id) {
                  send(ws, { type: "llm_done", text: cleanText });
                  for (const a of actions) {
                    send(ws, { type: "action", action: a.action, payload: a.payload });
                  }
                } else {
                  // Background session finished → notify
                  send(ws, { type: "session_done", sessionId: activeSession.id, text: cleanText } as any);
                }
                sendTokenUpdate(ws);
                sendSessionList(ws);
              },
              (err) => { throw err; },
              (toolName, output) => {
                if (toolName.includes("search_restaurants")) {
                  try {
                    const data = JSON.parse(output);
                    send(ws, { type: "food_results", data } as any);
                    log("FOOD", `MCP tool returned ${data.restaurants?.length ?? 0} restaurants`);
                  } catch {}
                }
                if (toolName.includes("search_opentable")) {
                  try {
                    const data = JSON.parse(output);
                    send(ws, { type: "opentable_results", data } as any);
                    log("OPENTABLE", `MCP tool returned ${data.results?.length ?? 0} restaurants, found=${data.found}`);
                  } catch {}
                }
              },
              (event) => send(ws, { type: "activity", event } as any),
            );

            // TTS only if still active session
            if (sessionManager.getActiveId() === activeSession.id) {
              const { cleanText } = parseActions(fullText);
              if (cleanText) {
                setState(ws, "speaking");
                const audioData = await synthesize(cleanText);
                ws.send(audioData);
                send(ws, { type: "tts_end" });
                ws.data.state = "idle";
              } else {
                setState(ws, "idle");
              }
            }
          } catch (err) {
            sessionManager.setStatus(activeSession.id, "error");
            sendSessionList(ws);
            send(ws, { type: "error", message: String(err) });
            setState(ws, "idle");
          }
          break;
        }

        case "image": {
          if (ws.data.processing) {
            log("WS", "Image received while processing — accepting (capture flow)");
            ws.data.processing = false;
          }
          ws.data.processing = true;
          setState(ws, "thinking");
          try {
            const result = await processVision(
              msg.data,
              msg.query || "請描述你看到的內容",
              (delta) => {
                send(ws, { type: "llm_delta", text: delta });
              },
            );
            const { cleanText, actions } = parseActions(result.text);
            send(ws, { type: "llm_done", text: cleanText });
            for (const a of actions) {
              send(ws, { type: "action", action: a.action, payload: a.payload });
            }

            if (cleanText) {
              setState(ws, "speaking");
              const audioData = await synthesize(cleanText);
              ws.send(audioData);
              send(ws, { type: "tts_end" });
              ws.data.state = "idle";
            } else {
              setState(ws, "idle");
            }
          } catch (err) {
            send(ws, { type: "error", message: `視覺分析失敗: ${err}` });
            setState(ws, "idle");
          } finally {
            ws.data.processing = false;
          }
          break;
        }

        case "interrupt": {
          ws.data.processing = false;
          setState(ws, "idle");
          break;
        }

        case "screenshot_response": {
          // Frontend sends back the user's selected/annotated screenshot
          // Process like a normal conversation: thinking → llm_delta → llm_done → speaking → tts
          ws.data.processing = true;
          setState(ws, "thinking");
          send(ws, { type: "stt_final", text: "📷 螢幕截圖分析中..." });
          try {
            const base64 = (msg as any).data as string;
            log("SCREENSHOT", `Received screenshot from frontend (${Math.round(base64.length * 0.75 / 1024)}KB)`);
            
            // Use user's original speech as context, fallback to generic
            const userQuery = ws.data.lastSttText || "請分析這個螢幕畫面";
            const visionQuery = `使用者說：「${userQuery}」\n\n請根據使用者的意圖分析這個螢幕截圖。如果有標註框線，重點分析標註區域。`;
            log("SCREENSHOT", `Vision query context: "${userQuery}"`);

            const result = await processVision(
              base64,
              visionQuery,
              (delta) => {
                send(ws, { type: "llm_delta", text: delta });
              },
            );
            const { cleanText, actions } = parseActions(result.text);
            log("SCREENSHOT", `Vision done (${cleanText.length} chars), sending to frontend`);
            send(ws, { type: "llm_done", text: cleanText });
            for (const a of actions) {
              send(ws, { type: "action", action: a.action, payload: a.payload });
            }

            if (cleanText) {
              setState(ws, "speaking");
              const audioData = await synthesize(cleanText);
              log("SCREENSHOT", `TTS done (${audioData.byteLength} bytes), sending audio`);
              ws.send(audioData);
              send(ws, { type: "tts_end" });
              ws.data.state = "idle";
            } else {
              setState(ws, "idle");
            }
          } catch (err) {
            logError("SCREENSHOT", `Vision analysis failed: ${err}`);
            send(ws, { type: "error", message: `螢幕截圖分析失敗: ${err}` });
            setState(ws, "idle");
          } finally {
            ws.data.processing = false;
          }
          break;
        }

        case "new_chat": {
          handleSessionCommand(ws, "new");
          break;
        }

        case "switch_session": {
          // Client clicked a session tab or AI triggered SESSION_PREV/NEXT
          const targetId = (msg as any).sessionId;
          if (targetId === "__prev__") {
            handleSessionCommand(ws, "prev");
          } else if (targetId === "__next__") {
            handleSessionCommand(ws, "next");
          } else if (targetId) {
            const current = sessionManager.getActive();
            if (current) sessionManager.saveSnapshot(current.id, ws.data.state);
            const target = sessionManager.setActive(targetId);
            if (target) {
              const snapshot = sessionManager.getSnapshot(target.id);
              send(ws, { type: "session_switch", sessionId: target.id, state: snapshot! } as any);
              sendSessionList(ws);
              log("SESSION", `Tab switch to: ${target.id.slice(0, 8)} "${target.title}"`);
            }
          }
          break;
        }

        case "cancel": {
          ws.data.audioChunks = [];
          setState(ws, "idle");
          break;
        }

        case "task_delete": {
          const { taskId } = msg as any;
          if (taskId && taskQueue.deleteTask(taskId)) {
            scheduler.save(); // Persist schedule changes
            send(ws, { type: "task_deleted", taskId } as any);
            log("TASK", `Client deleted task ${taskId.slice(0, 8)}`);
          }
          break;
        }

        case "notebook_state": {
          const ns = msg as any;
          ws.data.notebookActive = !!ns.active;
          ws.data.notebookType = ns.contentType ?? null;
          log("WS", `Notebook state: active=${ws.data.notebookActive} type=${ws.data.notebookType}`);
          break;
        }

        // F17: Manual session compaction
        case "summarize_session": {
          const active = sessionManager.getActive();
          if (!active?.openCodeSessionId) {
            send(ws, { type: "session_summary", sessionId: active?.id ?? "", success: false } as any);
            break;
          }
          log("LLM", `[SUMMARIZE] Manual compaction requested for session ${active.id.slice(0, 8)}`);
          const success = await summarizeSession(active.openCodeSessionId);
          if (success) {
            sessionManager.setSummaryDone(active.id);
            sendTokenUpdate(ws);
            sendSessionList(ws);
          }
          send(ws, { type: "session_summary", sessionId: active.id, success } as any);
          break;
        }

        default:
          break;
      }
    },

    close(ws: ServerWebSocket<WSData>) {
      log("WS", `Client disconnected: ${ws.data.id}`);
      if (activeWs === ws) activeWs = null;
    },
  };
}

/** Handle session voice commands */
function handleSessionCommand(ws: ServerWebSocket<WSData>, cmd: "new" | "prev" | "next") {
  let confirmText = "";

  switch (cmd) {
    case "new": {
      // Save current session state
      const current = sessionManager.getActive();
      if (current) {
        sessionManager.saveSnapshot(current.id, ws.data.state);
      }
      const newSession = sessionManager.createSession();
      const snapshot = sessionManager.getSnapshot(newSession.id);
      send(ws, { type: "session_switch", sessionId: newSession.id, state: snapshot! } as any);
      confirmText = `已開新對話，第 ${sessionManager.getCount()} 個`;
      log("SESSION", `New session created: ${newSession.id.slice(0, 8)} (total: ${sessionManager.getCount()})`);
      break;
    }
    case "prev": {
      const current = sessionManager.getActive();
      if (current) sessionManager.saveSnapshot(current.id, ws.data.state);
      const prev = sessionManager.switchPrev();
      if (prev) {
        const snapshot = sessionManager.getSnapshot(prev.id);
        send(ws, { type: "session_switch", sessionId: prev.id, state: snapshot! } as any);
        confirmText = `已切到上一個對話：${prev.title}`;
        log("SESSION", `Switched to prev: ${prev.id.slice(0, 8)} "${prev.title}"`);
      } else {
        confirmText = "沒有上一個對話了";
      }
      break;
    }
    case "next": {
      const current = sessionManager.getActive();
      if (current) sessionManager.saveSnapshot(current.id, ws.data.state);
      const next = sessionManager.switchNext();
      if (next) {
        const snapshot = sessionManager.getSnapshot(next.id);
        send(ws, { type: "session_switch", sessionId: next.id, state: snapshot! } as any);
        confirmText = `已切到下一個對話：${next.title}`;
        log("SESSION", `Switched to next: ${next.id.slice(0, 8)} "${next.title}"`);
      } else {
        confirmText = "沒有下一個對話了";
      }
      break;
    }
  }

  // Send updated session list
  sendSessionList(ws);
  setState(ws, "idle");

  // TTS confirmation (short, don't block)
  if (confirmText) {
    synthesize(confirmText).then(audio => {
      setState(ws, "speaking");
      ws.send(audio);
      send(ws, { type: "tts_end" });
      ws.data.state = "idle";
    }).catch(() => {
      setState(ws, "idle");
    });
  }
}

/**
 * Process collected audio chunks with timing (F10):
 * 1. STT → raw text
 * 2. Check session commands
 * 3. Send to OpenCode for chat response
 * 4. TTS → speak response
 */
export async function processAudio(ws: ServerWebSocket<WSData>) {
  if (ws.data.audioChunks.length === 0) return;
  if (ws.data.processing) return;

  ws.data.processing = true;
  setState(ws, "thinking");
  const pipelineStart = performance.now();

  // Merge audio chunks
  const totalLength = ws.data.audioChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const merged = new Float32Array(totalLength / 4);
  let offset = 0;
  for (const chunk of ws.data.audioChunks) {
    merged.set(new Float32Array(chunk), offset);
    offset += chunk.byteLength / 4;
  }
  ws.data.audioChunks = [];

  // 1. STT
  const sttStart = performance.now();
  let rawText: string;
  try {
    rawText = await transcribe(merged);
    const sttTime = Math.round(performance.now() - sttStart);
    log("STT", `Result (${sttTime}ms): "${rawText}"`);
    send(ws, { type: "stt_final", text: rawText });
    ws.data.lastSttText = rawText;
  } catch (err) {
    logError("STT", `Failed: ${err}`);
    send(ws, { type: "error", message: `語音辨識失敗: ${err}` });
    setState(ws, "idle");
    ws.data.processing = false;
    return;
  }

  if (!rawText) {
    logWarn("STT", "Returned empty text");
    setState(ws, "idle");
    ws.data.processing = false;
    return;
  }

  // 1.5. Notebook voice command interception (before LLM)
  if (ws.data.notebookActive) {
    const nbCmd = detectNotebookCommand(rawText, ws.data.notebookType);
    if (nbCmd) {
      log("NOTEBOOK_CMD", `Detected: ${JSON.stringify(nbCmd)} from "${rawText}"`);
      send(ws, { type: "action", action: "NOTEBOOK_CMD", payload: JSON.stringify(nbCmd) } as any);
      setState(ws, "idle");
      ws.data.processing = false;
      return;
    }
  }

  // Auto-title the active session
  const activeSession = sessionManager.getActive();
  if (activeSession) {
    sessionManager.setTitle(activeSession.id, rawText);
    sessionManager.setStatus(activeSession.id, "processing");
    sendSessionList(ws);
  }

  // 2. Send to OpenCode chat
  const managedSessionId = activeSession?.id ?? sessionManager.ensureSession().id;
  const llmStart = performance.now();
  try {
    let fullText = "";
    let suppressDelta = false;
    await chatStream(
      rawText,
      managedSessionId,
      (delta) => {
        fullText += delta;
        if (sessionManager.getActiveId() === managedSessionId && !suppressDelta) {
          if (fullText.includes("[ACTION:") || fullText.includes("[ASYNC_TASK:") || fullText.includes("[SCHEDULE:") || fullText.includes("[SCHEDULE_REPEAT:")) {
            suppressDelta = true;
            const tagIdx = Math.min(
              ...[fullText.indexOf("[ACTION:"), fullText.indexOf("[ASYNC_TASK:"), fullText.indexOf("[SCHEDULE:"), fullText.indexOf("[SCHEDULE_REPEAT:")].filter(i => i >= 0)
            );
            const alreadySent = fullText.length - delta.length;
            if (tagIdx > alreadySent) {
              send(ws, { type: "llm_delta", text: delta.slice(0, tagIdx - alreadySent) });
            }
          } else {
            send(ws, { type: "llm_delta", text: delta });
          }
        }
      },
      (text) => {
        fullText = text;
        sessionManager.setLastText(managedSessionId, text);
        sessionManager.setStatus(managedSessionId, "done");

        // Parse all marker types
        let processedText = fullText;
        const { cleanText, actions } = parseActions(processedText);
        processedText = cleanText;
        const { cleanText: t2, taskDescription } = parseAsyncTask(processedText);
        processedText = t2;
        const { cleanText: t3, schedule } = parseSchedule(processedText);
        processedText = t3;
        const { cleanText: t4, repeat } = parseScheduleRepeat(processedText);
        processedText = t4;
        const { cleanText: finalText, memories } = parseMemory(processedText);

        // Save AI-generated memories
        if (memories) {
          for (const m of memories) {
            memory.saveMemory(m.name, m.type as any, "", m.content);
          }
        }

        if (sessionManager.getActiveId() === managedSessionId) {
          log("LLM", `Response: "${finalText.slice(0, 80)}..."`);
          send(ws, { type: "llm_done", text: finalText });
          for (const a of actions) {
            log("ACTION", `Sending action: ${a.action} payload="${(a.payload || "").slice(0, 40)}"`);
            send(ws, { type: "action", action: a.action, payload: a.payload });
          }
        } else {
          send(ws, { type: "session_done", sessionId: managedSessionId, text: finalText } as any);
        }

        // ── Async Task dispatch ──
        if (taskDescription) {
          log("TASK", `AI requested async task (voice): "${taskDescription}"`);
          const task = taskQueue.createTask({
            prompt: taskDescription,
            originalPrompt: rawText,
            parentSessionId: managedSessionId,
            type: "async",
          });
          send(ws, { type: "task_created", taskId: task.id, description: taskDescription } as any);
          taskWorker.execute(task).catch(err => {
            logError("TASK", `Worker dispatch failed: ${err}`);
          });
        }

        // ── Schedule dispatch ──
        if (schedule) {
          const scheduledAt = new Date(schedule.time).getTime();
          if (!isNaN(scheduledAt)) {
            log("SCHEDULER", `Scheduling task at ${schedule.time}: "${schedule.prompt}"`);
            const schedTask = scheduler.scheduleOnce(schedule.prompt, scheduledAt, managedSessionId);
            send(ws, { type: "task_created", taskId: schedTask.id, description: `排程：${schedule.prompt}` } as any);
          }
        }

        // ── Repeat schedule dispatch ──
        if (repeat) {
          log("SCHEDULER", `Scheduling repeat (${repeat.freq} ${repeat.time}): "${repeat.prompt}"`);
          const repTask = scheduler.scheduleRepeat(repeat.prompt, repeat.time, repeat.freq, managedSessionId);
          send(ws, { type: "task_created", taskId: repTask.id, description: `重複排程：${repeat.prompt}` } as any);
        }

        sendTokenUpdate(ws);
        sendSessionList(ws);
      },
      (err) => {
        throw err;
      },
      (toolName, output) => {
        if (toolName.includes("search_restaurants")) {
          try {
            const data = JSON.parse(output);
            send(ws, { type: "food_results", data } as any);
            log("FOOD", `MCP tool returned ${data.restaurants?.length ?? 0} restaurants`);
          } catch {}
        }
        if (toolName.includes("search_opentable")) {
          try {
            const data = JSON.parse(output);
            send(ws, { type: "opentable_results", data } as any);
            log("OPENTABLE", `MCP tool returned ${data.results?.length ?? 0} restaurants, found=${data.found}`);
          } catch {}
        }
      },
      (event) => send(ws, { type: "activity", event } as any),
    );

    const llmTime = Math.round(performance.now() - llmStart);

    // Re-parse all markers for TTS and CAPTURE check
    let ttsText = fullText;
    const { cleanText: ct1, actions } = parseActions(ttsText);
    ttsText = ct1;
    ttsText = parseAsyncTask(ttsText).cleanText;
    ttsText = parseSchedule(ttsText).cleanText;
    ttsText = parseScheduleRepeat(ttsText).cleanText;
    ttsText = parseMemory(ttsText).cleanText;
    if (actions.some(a => a.action === "CAPTURE")) {
      if (ttsText && sessionManager.getActiveId() === managedSessionId) {
        setState(ws, "speaking");
        try {
          const audioData = await synthesize(ttsText);
          ws.send(audioData);
          send(ws, { type: "tts_end" });
          ws.data.state = "idle";
        } catch {
          setState(ws, "idle");
        }
      }
      log("WS", "CAPTURE action — releasing lock for image");
      ws.data.processing = false;
      const totalTime = Math.round(performance.now() - pipelineStart);
      log("TIMING", `stt=${Math.round(llmStart - sttStart)}ms llm=${llmTime}ms total=${totalTime}ms`);
      return;
    }

    // 3. TTS (only if still active session)
    if (ttsText && sessionManager.getActiveId() === managedSessionId) {
      setState(ws, "speaking");
      const ttsStart = performance.now();
      try {
        const audioData = await synthesize(ttsText);
        const ttsTime = Math.round(performance.now() - ttsStart);
        log("TTS", `Synthesized ${audioData.byteLength} bytes (${ttsTime}ms)`);
        ws.send(audioData);
        send(ws, { type: "tts_end" });
        ws.data.state = "idle";

        // F10: Full pipeline timing
        const totalTime = Math.round(performance.now() - pipelineStart);
        log("TIMING", `stt=${Math.round(llmStart - sttStart)}ms llm=${llmTime}ms tts=${ttsTime}ms total=${totalTime}ms`);
      } catch (ttsErr) {
        logWarn("TTS", `Failed: ${ttsErr}`);
        setState(ws, "idle");
      }
    } else {
      setState(ws, "idle");
    }
  } catch (err) {
    sessionManager.setStatus(managedSessionId, "error");
    sendSessionList(ws);
    logError("LLM", `Chat failed: ${err}`);
    send(ws, { type: "error", message: `對話失敗: ${err}` });
    setState(ws, "idle");
  }

  ws.data.processing = false;
}
