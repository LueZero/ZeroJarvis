/**
 * Global SSE Event Hub
 * Single persistent SSE connection to OpenCode, dispatching events by sessionID.
 * Replaces per-chatStream event.subscribe() with a centralized dispatcher.
 */

import { getClient } from "../llm/client.js";
import { log, logWarn, logError } from "../logger.js";

export type EventHandler = (event: any) => void;

/** Per-session handler map */
const handlers = new Map<string, EventHandler>();

/** Global catch-all handlers (for monitoring) */
const globalHandlers: EventHandler[] = [];

let running = false;
let eventLoop: Promise<void> | null = null;

/** Register a handler for a specific OpenCode session ID */
export function on(sessionId: string, handler: EventHandler): void {
  handlers.set(sessionId, handler);
}

/** Remove handler for a session */
export function off(sessionId: string): void {
  handlers.delete(sessionId);
}

/** Register a global handler that receives ALL events */
export function onGlobal(handler: EventHandler): void {
  globalHandlers.push(handler);
}

/** Check if a session has a registered handler */
export function hasHandler(sessionId: string): boolean {
  return handlers.has(sessionId);
}

/** Start the global SSE event loop (call once at gateway startup) */
export async function start(): Promise<void> {
  if (running) return;
  running = true;
  log("EVENT_HUB", "Starting global SSE event loop");
  eventLoop = runLoop();
}

/** Stop the event loop */
export function stop(): void {
  running = false;
  log("EVENT_HUB", "Stopping global SSE event loop");
}

async function runLoop(): Promise<void> {
  while (running) {
    try {
      const client = await getClient();
      const eventResult = await client.event.subscribe();
      const eventStream = (eventResult as any).stream ?? eventResult;

      log("EVENT_HUB", "SSE connected, dispatching events...");

      for await (const event of eventStream) {
        if (!running) break;

        const evt = event as any;
        const props = evt.properties ?? {};
        const sessionId = props.sessionID ?? props.part?.sessionID;

        // Dispatch to global handlers
        for (const gh of globalHandlers) {
          try { gh(evt); } catch (e) { /* ignore */ }
        }

        // Dispatch to session-specific handler
        if (sessionId && handlers.has(sessionId)) {
          try {
            handlers.get(sessionId)!(evt);
          } catch (e) {
            logError("EVENT_HUB", `Handler error for session ${sessionId}: ${e}`);
          }
        }
      }

      // Stream ended — reconnect
      if (running) {
        logWarn("EVENT_HUB", "SSE stream ended, reconnecting in 1s...");
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (err: any) {
      logError("EVENT_HUB", `SSE error: ${err.message}`);
      if (running) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
}
