/**
 * Task Scheduler — manages timed and repeating tasks.
 * Checks every 30 seconds for tasks that are due, then dispatches to worker.
 * Persists schedules to config/schedules.json for restart recovery.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { log, logWarn, logError } from "../logger.js";
import * as taskQueue from "./queue.js";
import * as worker from "./worker.js";

const SCHEDULE_FILE = resolve(import.meta.dir, "../../../../config/schedules.json");
const CHECK_INTERVAL_MS = 5_000; // 5 seconds

let intervalHandle: ReturnType<typeof setInterval> | null = null;

interface PersistedSchedule {
  id: string;
  prompt: string;
  scheduledAt?: number;         // Unix ms — one-time
  repeat?: string;              // "daily"|"weekly"|"Ns"|"Nm"|"Nh" (e.g. "30s","5m","2h")
  repeatTime?: string;          // HH:mm for daily/weekly
  parentSessionId: string;
}

/** Load persisted schedules and create pending tasks */
export function load(): void {
  if (!existsSync(SCHEDULE_FILE)) return;
  try {
    const data = JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8")) as PersistedSchedule[];
    for (const s of data) {
      // Skip past one-time schedules
      if (s.scheduledAt && s.scheduledAt < Date.now() && !s.repeat) continue;

      const nextAt = s.repeat
        ? computeNextRepeat(s.repeatTime!, s.repeat)
        : s.scheduledAt!;

      taskQueue.createTask({
        prompt: s.prompt,
        originalPrompt: s.prompt,
        parentSessionId: s.parentSessionId,
        type: "scheduled",
        scheduledAt: nextAt,
        repeat: s.repeat,
        repeatTime: s.repeatTime,
      });
    }
    log("SCHEDULER", `Loaded ${data.length} persisted schedules`);
  } catch (err: any) {
    logWarn("SCHEDULER", `Failed to load schedules: ${err.message}`);
  }
}

/** Save current scheduled tasks to disk */
export function save(): void {
  const scheduled = taskQueue.getScheduled();
  const data: PersistedSchedule[] = scheduled.map(t => ({
    id: t.id,
    prompt: t.prompt,
    scheduledAt: t.scheduledAt,
    repeat: t.repeat,
    repeatTime: t.repeatTime,
    parentSessionId: t.parentSessionId,
  }));
  try {
    mkdirSync(dirname(SCHEDULE_FILE), { recursive: true });
    writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err: any) {
    logError("SCHEDULER", `Failed to save schedules: ${err.message}`);
  }
}

/** Start the scheduler check loop */
export function start(): void {
  if (intervalHandle) return;
  load();
  intervalHandle = setInterval(checkDue, CHECK_INTERVAL_MS);
  log("SCHEDULER", `Started (checking every ${CHECK_INTERVAL_MS / 1000}s)`);
}

/** Stop the scheduler */
export function stop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  save();
  log("SCHEDULER", "Stopped");
}

/** Check for tasks that are due and dispatch them */
function checkDue(): void {
  const now = Date.now();
  const scheduled = taskQueue.getScheduled();

  for (const task of scheduled) {
    if (!task.scheduledAt || task.scheduledAt > now) continue;

    log("SCHEDULER", `Task ${task.id.slice(0, 8)} is due: "${task.prompt.slice(0, 40)}"`);
    // Mark as running BEFORE dispatching so save() won't re-persist it
    taskQueue.setStatus(task.id, "running");
    // Dispatch to worker
    worker.execute(task);

    // If repeating, create next occurrence
    if (task.repeat && task.repeatTime) {
      const nextAt = computeNextRepeat(task.repeatTime, task.repeat);
      taskQueue.createTask({
        prompt: task.prompt,
        originalPrompt: task.originalPrompt,
        parentSessionId: task.parentSessionId,
        type: "scheduled",
        scheduledAt: nextAt,
        repeat: task.repeat,
        repeatTime: task.repeatTime,
      });
      log("SCHEDULER", `Next occurrence scheduled at ${new Date(nextAt).toLocaleString("zh-TW")}`);
    }

    // Persist after changes
    save();
  }
}

/** Parse interval string (e.g. "30s","5m","2h") to milliseconds. Returns 0 if not an interval pattern. */
function parseIntervalMs(freq: string): number {
  const m = freq.match(/^(\d+)([smh])$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "s": return n * 1_000;
    case "m": return n * 60_000;
    case "h": return n * 3_600_000;
    default: return 0;
  }
}

/** Compute next repeat time from repeat pattern and optional HH:mm */
function computeNextRepeat(time: string, freq: string): number {
  const now = Date.now();

  // Interval-based: Ns, Nm, Nh (e.g. "30s", "5m", "2h")
  const intervalMs = parseIntervalMs(freq);
  if (intervalMs > 0) {
    return now + intervalMs;
  }

  // Named frequencies: daily, weekly, monthly, yearly
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);

  if (next.getTime() <= now) {
    switch (freq) {
      case "daily":
        next.setDate(next.getDate() + 1);
        break;
      case "weekly":
        next.setDate(next.getDate() + 7);
        break;
      case "monthly":
        next.setMonth(next.getMonth() + 1);
        break;
      case "yearly":
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
  }

  return next.getTime();
}

/** Schedule a one-time task */
export function scheduleOnce(prompt: string, scheduledAt: number, parentSessionId: string): ReturnType<typeof taskQueue.createTask> {
  const task = taskQueue.createTask({
    prompt,
    originalPrompt: prompt,
    parentSessionId,
    type: "scheduled",
    scheduledAt,
  });
  save();
  return task;
}

/** Schedule a repeating task */
export function scheduleRepeat(
  prompt: string,
  repeatTime: string,
  repeat: string,
  parentSessionId: string,
): ReturnType<typeof taskQueue.createTask> {
  const nextAt = computeNextRepeat(repeatTime, repeat);
  const task = taskQueue.createTask({
    prompt,
    originalPrompt: prompt,
    parentSessionId,
    type: "scheduled",
    scheduledAt: nextAt,
    repeat,
    repeatTime,
  });
  save();
  return task;
}
