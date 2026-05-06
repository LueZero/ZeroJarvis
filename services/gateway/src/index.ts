import { Hono } from "hono";
import { cors } from "hono/cors";
import { GATEWAY_PORT, API_PREFIX, WS_PATH } from "@zerojarvis/shared";
import { handleWebSocket } from "./ws/handler.js";
import { log } from "./logger.js";

const app = new Hono();

// CORS for web client
app.use("*", cors({ origin: "*" }));

// Health check
app.get(`${API_PREFIX}/health`, (c) => {
  return c.json({ status: "ok", timestamp: Date.now() });
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
  let result = "";
  await chatStream(
    message,
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
