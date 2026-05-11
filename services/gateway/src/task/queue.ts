/**
 * Task Queue — manages background async tasks and scheduled tasks.
 * Tasks are dispatched to OpenCode worker sessions and monitored via EventHub.
 */

import { log, logWarn } from "../logger.js";

export type TaskStatus = "pending" | "running" | "done" | "error";
export type TaskType = "async" | "scheduled";

export interface Task {
  id: string;
  type: TaskType;
  prompt: string;                 // Task description from AI
  originalPrompt: string;         // User's original input
  status: TaskStatus;
  workerSessionId?: string;       // OpenCode worker session
  parentSessionId: string;        // Source managed session
  result?: string;                // Worker AI's final report (natural language)
  error?: string;
  createdAt: number;
  scheduledAt?: number;           // For scheduled tasks
  completedAt?: number;
  repeat?: "daily" | "weekly";    // For repeating schedules
  repeatTime?: string;            // HH:mm for repeating
}

/** In-memory task store */
const tasks = new Map<string, Task>();

/** Listeners for task completion */
type TaskDoneListener = (task: Task) => void;
const doneListeners: TaskDoneListener[] = [];

/** Create a new async task */
export function createTask(opts: {
  prompt: string;
  originalPrompt: string;
  parentSessionId: string;
  type?: TaskType;
  scheduledAt?: number;
  repeat?: "daily" | "weekly";
  repeatTime?: string;
}): Task {
  const task: Task = {
    id: crypto.randomUUID(),
    type: opts.type ?? "async",
    prompt: opts.prompt,
    originalPrompt: opts.originalPrompt,
    status: "pending",
    parentSessionId: opts.parentSessionId,
    createdAt: Date.now(),
    scheduledAt: opts.scheduledAt,
    repeat: opts.repeat,
    repeatTime: opts.repeatTime,
  };
  tasks.set(task.id, task);
  log("TASK", `Created task ${task.id.slice(0, 8)}: "${task.prompt.slice(0, 50)}"`);
  return task;
}

/** Update task status */
export function setStatus(taskId: string, status: TaskStatus): void {
  const task = tasks.get(taskId);
  if (task) {
    task.status = status;
    if (status === "running") {
      log("TASK", `Task ${taskId.slice(0, 8)} → running`);
    }
  }
}

/** Set worker session ID */
export function setWorkerSession(taskId: string, workerSessionId: string): void {
  const task = tasks.get(taskId);
  if (task) task.workerSessionId = workerSessionId;
}

/** Complete a task with result */
export function complete(taskId: string, result: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  task.status = "done";
  task.result = result;
  task.completedAt = Date.now();
  const elapsed = Math.round((task.completedAt - task.createdAt) / 1000);
  log("TASK", `Task ${taskId.slice(0, 8)} completed (${elapsed}s): "${result.slice(0, 80)}"`);
  // Notify listeners
  for (const listener of doneListeners) {
    try { listener(task); } catch (e) { /* ignore */ }
  }
}

/** Fail a task */
export function fail(taskId: string, error: string): void {
  const task = tasks.get(taskId);
  if (!task) return;
  task.status = "error";
  task.error = error;
  task.completedAt = Date.now();
  logWarn("TASK", `Task ${taskId.slice(0, 8)} failed: ${error}`);
  for (const listener of doneListeners) {
    try { listener(task); } catch (e) { /* ignore */ }
  }
}

/** Register completion listener */
export function onDone(listener: TaskDoneListener): void {
  doneListeners.push(listener);
}

/** Get a task by ID */
export function getTask(taskId: string): Task | undefined {
  return tasks.get(taskId);
}

/** Find task by worker session ID */
export function getByWorkerSession(workerSessionId: string): Task | undefined {
  for (const task of tasks.values()) {
    if (task.workerSessionId === workerSessionId) return task;
  }
  return undefined;
}

/** Get all running tasks */
export function getRunning(): Task[] {
  return [...tasks.values()].filter(t => t.status === "running");
}

/** Get all pending scheduled tasks */
export function getScheduled(): Task[] {
  return [...tasks.values()].filter(t => t.type === "scheduled" && t.status === "pending");
}

/** Get all tasks (for status report) */
export function getAll(): Task[] {
  return [...tasks.values()];
}

/** Get summary for AI to report */
export function getSummary(): string {
  const running = getRunning();
  const scheduled = getScheduled();
  if (running.length === 0 && scheduled.length === 0) {
    return "目前沒有進行中或排程中的任務。";
  }
  let summary = "";
  if (running.length > 0) {
    summary += `進行中的任務（${running.length} 個）：\n`;
    for (const t of running) {
      const elapsed = Math.round((Date.now() - t.createdAt) / 1000);
      summary += `- ${t.prompt}（已執行 ${elapsed} 秒）\n`;
    }
  }
  if (scheduled.length > 0) {
    summary += `排程任務（${scheduled.length} 個）：\n`;
    for (const t of scheduled) {
      const time = t.scheduledAt ? new Date(t.scheduledAt).toLocaleTimeString("zh-TW") : t.repeatTime;
      summary += `- ${t.prompt}（${t.repeat ? `每${t.repeat === "daily" ? "天" : "週"} ${time}` : time}）\n`;
    }
  }
  return summary;
}

/** Clean up old completed tasks (keep last 20) */
export function cleanup(): void {
  const all = [...tasks.values()]
    .filter(t => t.status === "done" || t.status === "error")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  for (let i = 20; i < all.length; i++) {
    tasks.delete(all[i].id);
  }
}
