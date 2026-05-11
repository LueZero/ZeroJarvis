/**
 * OpenCode SDK client singleton
 * Connects to an external `opencode serve` instance.
 *
 * SDK: @opencode-ai/sdk v1.14.33 (hey-api generated)
 * Key resources:
 *   client.session.create() → Session
 *   client.session.promptAsync({ path: { id }, body: { parts, agent } }) → fire-and-forget
 *   client.event.subscribe() → SSE Stream<Event>
 *
 * Event types: message.part.updated (Part: text | reasoning | tool | step-start | step-finish | snapshot)
 *              session.idle, session.error, message.updated, session.updated, ...
 *
 * F14: config.get() — startup health check (SDK has no dedicated health endpoint)
 * F17: config.providers() — context limit for token tracking
 * F18: session.init() — auto-generate AGENTS.md
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import { log, logWarn, logError } from "../logger.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";

let clientInstance: ReturnType<typeof createOpencodeClient> | null = null;

/** Cached health status for /api/health */
let lastHealthStatus: { healthy: boolean; version: string; checkedAt: number } | null = null;

/** Cached context limit (tokens) from model config */
let cachedContextLimit: number = 200_000; // safe default

/**
 * Get or create OpenCode client (connects to external server).
 */
export async function getClient() {
  if (clientInstance) return clientInstance;

  console.log(`🧠 Connecting to OpenCode at ${OPENCODE_URL}`);
  clientInstance = createOpencodeClient({ baseUrl: OPENCODE_URL });

  return clientInstance;
}

/**
 * Shutdown (reset client reference)
 */
export async function shutdown() {
  clientInstance = null;
}

// ── F14: Health Check ──

/**
 * Check OpenCode server health by calling config.get().
 * SDK has no dedicated health endpoint; config.get() acts as a connectivity ping.
 * Returns { healthy, version } or { healthy: false } on error.
 */
export async function checkHealth(): Promise<{ healthy: boolean; version: string }> {
  try {
    const client = await getClient();
    const result = await client.config.get() as any;
    const data = result?.data ?? result;
    // config.get() returns config info; if we get a response, server is healthy
    const version = data?.version ?? data?.app?.version ?? "unknown";
    lastHealthStatus = { healthy: true, version, checkedAt: Date.now() };
    log("INIT", `OpenCode server healthy (v${version})`);
    return { healthy: true, version };
  } catch (err: any) {
    lastHealthStatus = { healthy: false, version: "unreachable", checkedAt: Date.now() };
    logWarn("INIT", `OpenCode server unreachable: ${err.message}`);
    return { healthy: false, version: "unreachable" };
  }
}

/** Get cached health status (for /api/health endpoint) */
export function getHealthStatus() {
  return lastHealthStatus;
}

// ── F17: Context Limit ──

/**
 * Fetch the model's context window limit via config.providers().
 * Caches the result for use by token tracking.
 */
export async function fetchContextLimit(): Promise<number> {
  try {
    const client = await getClient();
    const result = await client.config.providers() as any;
    const data = result?.data ?? result;
    const providers = data?.providers ?? data;

    // Walk providers → models → find the active model's context limit
    if (Array.isArray(providers)) {
      for (const provider of providers) {
        const models = provider.models ?? {};
        for (const modelId in models) {
          const model = models[modelId];
          if (model?.limit?.context && model.limit.context > 0) {
            // Use the largest context limit found (the active model should be among them)
            if (model.limit.context > cachedContextLimit || cachedContextLimit === 200_000) {
              cachedContextLimit = model.limit.context;
            }
          }
        }
      }
    }

    log("INIT", `Model context limit: ${cachedContextLimit.toLocaleString()} tokens`);
    return cachedContextLimit;
  } catch (err: any) {
    logWarn("INIT", `Failed to fetch context limit: ${err.message} (using default ${cachedContextLimit})`);
    return cachedContextLimit;
  }
}

/** Get the cached context limit */
export function getContextLimit(): number {
  return cachedContextLimit;
}

// ── F18: Project Init (AGENTS.md) ──

/**
 * Auto-analyze the project and create AGENTS.md if it doesn't exist.
 * Requires an active session ID.
 */
export async function initProject(sessionId: string): Promise<boolean> {
  const agentsPath = resolve(process.cwd(), "..", "..", ".opencode", "AGENTS.md");
  if (existsSync(agentsPath)) {
    log("INIT", `AGENTS.md already exists, skipping init`);
    return false;
  }

  try {
    const client = await getClient();
    await client.session.init({
      path: { id: sessionId },
      body: {},
    } as any);
    log("INIT", `session.init() completed — AGENTS.md should be created`);
    return true;
  } catch (err: any) {
    logWarn("INIT", `session.init() failed: ${err.message}`);
    return false;
  }
}
