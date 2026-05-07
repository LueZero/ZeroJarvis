/**
 * Vision Processor via OpenCode SDK
 * Saves captured image to files/captures/ for reference, then sends to
 * a dedicated OpenCode session with the user's spoken query.
 */

import { getClient } from "../llm/client.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface VisionResult {
  text: string;
}

// Anchor to project root (services/gateway/src/vision/ → 4 levels up)
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(__filename, "..", "..", "..", "..", "..");
const CAPTURES_DIR = join(PROJECT_ROOT, "files", "captures");

/**
 * Save captured image to disk for reference/debugging.
 */
async function saveCapture(imageBase64: string): Promise<string> {
  await mkdir(CAPTURES_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `capture-${timestamp}.jpg`;
  const filePath = join(CAPTURES_DIR, filename);
  const buffer = Buffer.from(imageBase64, "base64");
  await writeFile(filePath, buffer);
  console.log(`👁 Saved capture: ${filePath} (${Math.round(buffer.length / 1024)}KB)`);
  return filePath;
}

/**
 * Process vision: save image, create dedicated session, send user's
 * spoken query + image to OpenCode for analysis.
 */
export async function processVision(
  imageBase64: string,
  query: string,
  onDelta?: (text: string) => void,
): Promise<VisionResult> {
  try {
    // Save image to disk for reference
    const imagePath = await saveCapture(imageBase64);

    const client = await getClient();

    // Dedicated session for vision (isolated from main chat)
    const sessionResult = await client.session.create();
    const session = (sessionResult as any).data ?? sessionResult;
    const visionSessionId = session?.id;
    if (!visionSessionId) {
      return { text: "視覺處理發生錯誤，無法建立工作階段。" };
    }

    // Use the user's actual spoken query
    const userQuery = query || "請描述你看到的內容";
    console.log(`👁 Vision: session ${visionSessionId}, query="${userQuery}", image ${imagePath}`);

    // Subscribe to events
    const eventResult = await client.event.subscribe();
    const eventStream = eventResult.stream ?? eventResult;

    // Send image using FilePartInput with data URI
    client.session.promptAsync({
      path: { id: visionSessionId },
      body: {
        parts: [
          { type: "text", text: userQuery },
          {
            type: "file",
            mime: "image/jpeg",
            filename: imagePath.split("/").pop() || "capture.jpg",
            url: `data:image/jpeg;base64,${imageBase64}`,
          },
        ],
        agent: "vision",
      },
    } as any).catch((err: any) => {
      console.error("👁 Vision promptAsync error:", err.message);
    });

    // Read events
    let fullText = "";
    let done = false;
    const timeout = setTimeout(() => {
      console.log("👁 Vision timeout (45s)");
      done = true;
    }, 45000);

    try {
      for await (const event of eventStream) {
        if (done) break;
        const evt = event as any;

        if (evt.type === "message.part.updated") {
          const part = evt.properties?.part;
          if (part?.type === "text" && part?.sessionID === visionSessionId) {
            const newText = part.text ?? "";
            if (newText.length > fullText.length) {
              const delta = newText.slice(fullText.length);
              fullText = newText;
              onDelta?.(delta);
            }
          }
        }

        if (evt.type === "session.idle" && evt.properties?.sessionID === visionSessionId) {
          done = true;
          break;
        }

        if (evt.type === "session.error" && evt.properties?.sessionID === visionSessionId) {
          const errMsg = evt.properties?.error?.data?.message ?? evt.properties?.error?.name ?? "Vision error";
          console.error("👁 Vision session error:", errMsg);
          done = true;
          break;
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    // Fallback: fetch from messages API
    if (!fullText) {
      console.log("👁 No text from events, fetching messages...");
      const msgs = await client.session.messages({ path: { id: visionSessionId } } as any);
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

    // Clean up session
    client.session.delete({ path: { id: visionSessionId } }).catch(() => {});

    console.log(`👁 Vision result (${fullText.length} chars): "${fullText.slice(0, 120)}"`);
    return { text: fullText || "無法辨識圖片內容" };
  } catch (err) {
    console.error("👁 Vision error:", err);
    return { text: "視覺處理發生錯誤，請稍後再試。" };
  }
}
