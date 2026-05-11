import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolve, join } from "node:path";
import { GATEWAY_PORT, API_PREFIX, WS_PATH } from "@zerojarvis/shared";
import { handleWebSocket, startBackgroundSystems } from "./ws/handler.js";
import { log } from "./logger.js";

const app = new Hono();

// CORS for web client
app.use("*", cors({ origin: "*" }));

// Static file serving for files/ directory (video, audio, downloads)
// Gateway CWD = services/gateway/, project root = ../../
const filesRoot = resolve(process.cwd(), "..", "..", "files");
app.get("/files/*", async (c) => {
  const reqPath = c.req.path.replace(/^\/files\//, "");
  // Security: prevent path traversal
  if (reqPath.includes("..") || reqPath.startsWith("/")) {
    return c.text("Forbidden", 403);
  }
  const filePath = join(filesRoot, reqPath);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }
  return c.text("Not Found", 404);
});

// Health check (F14: includes OpenCode server status)
app.get(`${API_PREFIX}/health`, async (c) => {
  const { getHealthStatus } = await import("./llm/client.js");
  const opencode = getHealthStatus();
  return c.json({
    status: "ok",
    timestamp: Date.now(),
    opencode: opencode ?? { healthy: false, version: "not-checked", checkedAt: 0 },
  });
});

// F18: Manual AGENTS.md init endpoint
app.post(`${API_PREFIX}/init-agents`, async (c) => {
  const { getClient, initProject } = await import("./llm/client.js");
  const { ensureSession } = await import("./session/manager.js");
  const session = ensureSession();
  // Need an OpenCode session to run init
  const client = await getClient();
  const result = await client.session.create();
  const ocSession = (result as any).data ?? result;
  if (!ocSession?.id) {
    return c.json({ success: false, error: "Failed to create OpenCode session" }, 500);
  }
  const success = await initProject(ocSession.id);
  return c.json({ success });
});

// REST endpoints
app.post(`${API_PREFIX}/transcribe`, async (c) => {
  const body = await c.req.arrayBuffer();
  const { transcribe } = await import("./stt/whisper.js");
  const text = await transcribe(new Float32Array(body));
  return c.json({ text });
});

app.post(`${API_PREFIX}/polish`, async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const { polish } = await import("./polish/polisher.js");
  const result = await polish(text);
  return c.json(result);
});

app.post(`${API_PREFIX}/chat`, async (c) => {
  const { message } = await c.req.json<{ message: string }>();
  const { chatStream } = await import("./llm/opencode.js");
  const { ensureSession } = await import("./session/manager.js");
  const session = ensureSession();
  let result = "";
  await chatStream(
    message,
    session.id,
    (delta) => { result += delta; },
    (text) => { result = text; },
    (err) => { throw err; },
  );
  return c.json({ text: result });
});

app.post(`${API_PREFIX}/vision`, async (c) => {
  const { image, query } = await c.req.json<{ image: string; query: string }>();
  const { processVision } = await import("./vision/processor.js");
  const result = await processVision(image, query);
  return c.json(result);
});

// Start server with WebSocket support
log("GATEWAY", `ZeroJarvis Gateway starting on port ${GATEWAY_PORT}`);

const wsHandler = handleWebSocket();

// Start background systems (EventHub, Scheduler) after server is ready
startBackgroundSystems().catch(err => {
  log("GATEWAY", `[WARN] Background systems startup delayed: ${err.message}`);
});

export default {
  port: GATEWAY_PORT,
  hostname: "0.0.0.0",
  fetch(req: Request, server: any) {
    const url = new URL(req.url);
    // WebSocket upgrade for /ws path
    if (url.pathname === WS_PATH) {
      const upgraded = server.upgrade(req, { data: {} });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    // All other requests go to Hono
    return app.fetch(req);
  },
  websocket: wsHandler,
};
