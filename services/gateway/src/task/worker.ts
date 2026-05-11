/**
 * Task Worker — creates OpenCode worker sessions and monitors completion.
 * Each background task gets its own OpenCode session with the task-worker agent.
 * Results are collected via EventHub and reported back through TaskQueue.
 */

import { getClient } from "../llm/client.js";
import { log, logWarn, logError } from "../logger.js";
import * as eventHub from "./event-hub.js";
import * as taskQueue from "./queue.js";
import * as memory from "./memory.js";
import * as sessionManager from "../session/manager.js";

const MAX_CONCURRENT_WORKERS = 3;
const WORKER_TIMEOUT_MS = 180_000; // 3 minutes max per task

/** Active worker session tracking */
const activeWorkers = new Map<string, {
  taskId: string;
  timeout: ReturnType<typeof setTimeout>;
  fullText: string;
  assistantPhase: boolean; // true after step-start, meaning LLM is responding
}>();

/**
 * Execute a task in a new OpenCode worker session.
 * Creates a session, sends the prompt to task-worker agent, and monitors via EventHub.
 */
export async function execute(task: ReturnType<typeof taskQueue.getTask>): Promise<void> {
  if (!task) return;

  // Check concurrency limit
  if (activeWorkers.size >= MAX_CONCURRENT_WORKERS) {
    logWarn("WORKER", `Max concurrent workers (${MAX_CONCURRENT_WORKERS}) reached, task ${task.id.slice(0, 8)} stays pending`);
    return;
  }

  try {
    const client = await getClient();

    // Create a new OpenCode session for this worker
    const result = await client.session.create();
    const session = (result as any).data ?? result;
    const workerSessionId = session?.id;
    if (!workerSessionId) {
      throw new Error(`Failed to create worker session: ${JSON.stringify(result)}`);
    }

    taskQueue.setWorkerSession(task.id, workerSessionId);
    taskQueue.setStatus(task.id, "running");
    log("WORKER", `Worker session created: ${workerSessionId.slice(0, 8)} for task ${task.id.slice(0, 8)}`);

    // Set up timeout
    const timeout = setTimeout(() => {
      handleWorkerTimeout(workerSessionId, task.id);
    }, WORKER_TIMEOUT_MS);

    // Track worker
    activeWorkers.set(workerSessionId, {
      taskId: task.id,
      timeout,
      fullText: "",
      assistantPhase: false,
    });

    // Register event handler for this worker session
    eventHub.on(workerSessionId, (evt: any) => {
      handleWorkerEvent(workerSessionId, evt);
    });

    // Build the worker prompt (async — loads memories + parent context)
    const workerPrompt = await buildWorkerPrompt(task.prompt, task.originalPrompt, task.parentSessionId);

    // Fire-and-forget prompt to worker session
    client.session.promptAsync({
      path: { id: workerSessionId },
      body: {
        parts: [{ type: "text", text: workerPrompt }],
        agent: "task-worker",
      },
    } as any).catch((err: any) => {
      logError("WORKER", `promptAsync failed for task ${task.id.slice(0, 8)}: ${err.message}`);
      cleanupWorker(workerSessionId);
      taskQueue.fail(task.id, err.message);
    });

  } catch (err: any) {
    logError("WORKER", `Failed to execute task ${task.id.slice(0, 8)}: ${err.message}`);
    taskQueue.fail(task.id, err.message);
  }
}

/** Build the prompt sent to the task-worker agent (with memory + parent context) */
async function buildWorkerPrompt(
  taskDescription: string,
  originalPrompt: string,
  parentSessionId: string,
): Promise<string> {
  const sections: string[] = ["## 背景任務\n"];

  // 1. Load persistent memories
  const memorySummary = memory.buildSummary(800);
  if (memorySummary) {
    sections.push(`### 記憶（跨 session 持久事實）\n${memorySummary}\n`);
  }

  // 2. Fetch recent parent session context
  const parentContext = await fetchParentContext(parentSessionId, 3);
  if (parentContext) {
    sections.push(`### 近期對話上下文\n${parentContext}\n`);
  }

  // 3. Task details
  sections.push(`### 任務\n使用者原始指令：「${originalPrompt}」\n\n任務描述：${taskDescription}`);

  // 4. Instructions
  sections.push("\n請執行以上任務，完成後以簡潔口語化的繁體中文彙報結果。報告不超過 200 字。");

  // Enforce total prompt length limit
  let prompt = sections.join("\n");
  if (prompt.length > 2000) {
    prompt = prompt.slice(0, 2000) + "\n\n（上下文已截斷）";
  }
  return prompt;
}

/** Fetch last N turns from parent session for worker context */
async function fetchParentContext(parentSessionId: string, maxTurns: number): Promise<string> {
  try {
    const session = sessionManager.getSession(parentSessionId);
    const openCodeId = session?.openCodeSessionId;
    if (!openCodeId) return "";

    const client = await getClient();
    const msgs = await client.session.messages({ path: { id: openCodeId } } as any);
    const messagesData = (msgs as any).data ?? msgs;
    if (!Array.isArray(messagesData) || messagesData.length === 0) return "";

    // Extract last N user+assistant text turns
    const turns: string[] = [];
    for (let i = messagesData.length - 1; i >= 0 && turns.length < maxTurns * 2; i--) {
      const msg = messagesData[i];
      const role = msg.info?.role;
      if (role !== "user" && role !== "assistant") continue;

      const textParts = (msg.parts ?? [])
        .filter((p: any) => p?.type === "text" && p?.text)
        .map((p: any) => p.text.slice(0, 200))
        .join(" ");

      if (!textParts) continue;
      const label = role === "user" ? "使用者" : "AI";
      turns.unshift(`[${label}]: ${textParts}`);
    }
    return turns.join("\n");
  } catch (err: any) {
    logWarn("WORKER", `Failed to fetch parent context: ${err.message}`);
    return "";
  }
}

/** Handle SSE events from a worker session */
function handleWorkerEvent(workerSessionId: string, evt: any): void {
  const worker = activeWorkers.get(workerSessionId);
  if (!worker) return;

  const props = evt.properties ?? {};

  // Collect text deltas (only during assistant response phase)
  if (evt.type === "message.part.delta") {
    if (!worker.assistantPhase) return;
    const partType = props.part?.type ?? props.type;
    if (partType !== "reasoning") {
      const delta = props.delta ?? "";
      worker.fullText += delta;
    }
    return;
  }

  // Text sync from part.updated
  if (evt.type === "message.part.updated") {
    const part = props.part;
    // step-start marks beginning of LLM response — reset and start collecting
    if (part?.type === "step-start") {
      worker.assistantPhase = true;
      worker.fullText = "";
      return;
    }
    if (part?.type === "text" && worker.assistantPhase) {
      const newText = part.text ?? "";
      if (newText.length > worker.fullText.length) {
        worker.fullText = newText;
      }
    }
    // Log tool calls for visibility
    if (part?.type === "tool" && part?.state?.status === "running") {
      log("WORKER", `[${workerSessionId.slice(0, 8)}] Tool: ${part.tool}()`);
    }
    return;
  }

  // Session completed
  if (evt.type === "session.idle") {
    log("WORKER", `Worker ${workerSessionId.slice(0, 8)} completed`);
    finishWorker(workerSessionId);
    return;
  }

  // Session error
  if (evt.type === "session.error") {
    const errMsg = props.error?.name ?? props.error?.message ?? "Unknown worker error";
    logError("WORKER", `Worker ${workerSessionId.slice(0, 8)} error: ${errMsg}`);
    cleanupWorker(workerSessionId);
    taskQueue.fail(worker.taskId, errMsg);
    return;
  }
}

/** Worker completed successfully — collect result and notify */
async function finishWorker(workerSessionId: string): Promise<void> {
  const worker = activeWorkers.get(workerSessionId);
  if (!worker) return;

  let resultText = worker.fullText;

  // Fallback: if no text collected from events, fetch from messages API
  if (!resultText) {
    try {
      const client = await getClient();
      const msgs = await client.session.messages({ path: { id: workerSessionId } } as any);
      const messagesData = (msgs as any).data ?? msgs;
      if (Array.isArray(messagesData)) {
        for (let i = messagesData.length - 1; i >= 0; i--) {
          const msg = messagesData[i];
          if (msg.info?.role === "assistant") {
            for (const part of msg.parts ?? []) {
              if (part?.type === "text" && part?.text) {
                resultText += part.text;
              }
            }
            break;
          }
        }
      }
    } catch (err: any) {
      logWarn("WORKER", `Failed to fetch messages for ${workerSessionId.slice(0, 8)}: ${err.message}`);
    }
  }

  cleanupWorker(workerSessionId);

  if (resultText) {
    // Parse and save any [MEMORY:...] markers from worker response
    const { parseMemory } = await import("../llm/opencode.js");
    const { cleanText, memories } = parseMemory(resultText);
    if (memories) {
      for (const m of memories) {
        memory.saveMemory(m.name, m.type as any, "", m.content);
      }
      log("WORKER", `Worker saved ${memories.length} memories`);
    }
    taskQueue.complete(worker.taskId, cleanText);
  } else {
    taskQueue.fail(worker.taskId, "Worker returned empty response");
  }
}

/** Handle worker timeout */
function handleWorkerTimeout(workerSessionId: string, taskId: string): void {
  logWarn("WORKER", `Worker ${workerSessionId.slice(0, 8)} timed out (${WORKER_TIMEOUT_MS / 1000}s)`);

  // Try to abort the session
  getClient().then(client => {
    client.session.abort({ path: { id: workerSessionId } } as any).catch(() => {});
  }).catch(() => {});

  const worker = activeWorkers.get(workerSessionId);
  cleanupWorker(workerSessionId);

  // If we have partial text, use it
  if (worker?.fullText) {
    taskQueue.complete(taskId, worker.fullText + "\n\n（任務執行超時，以上為部分結果）");
  } else {
    taskQueue.fail(taskId, "任務執行超時");
  }
}

/** Clean up worker tracking */
function cleanupWorker(workerSessionId: string): void {
  const worker = activeWorkers.get(workerSessionId);
  if (worker) {
    clearTimeout(worker.timeout);
    activeWorkers.delete(workerSessionId);
  }
  eventHub.off(workerSessionId);
}

/** Get count of active workers */
export function getActiveCount(): number {
  return activeWorkers.size;
}
