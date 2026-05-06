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
 */

import { createOpencodeClient } from "@opencode-ai/sdk";

const OPENCODE_URL = process.env.OPENCODE_URL || "http://localhost:4096";

let clientInstance: ReturnType<typeof createOpencodeClient> | null = null;

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
