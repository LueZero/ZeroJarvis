/**
 * WebSocket client for Voice Gateway communication
 */

import type { ClientMessage, ServerMessage } from "@zerojarvis/shared";
import { WS_PATH } from "@zerojarvis/shared";

export type MessageHandler = (msg: ServerMessage) => void;

let ws: WebSocket | null = null;
let messageHandler: MessageHandler | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const RECONNECT_DELAY = 3000;

function getWsUrl(): string {
  if (typeof window === "undefined") return `ws://localhost:3100${WS_PATH}`;
  // Connect to same origin — Vite proxy forwards /ws to Gateway
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${WS_PATH}`;
}

export function connect(onMessage: MessageHandler): void {
  messageHandler = onMessage;
  doConnect();
}

function doConnect(): void {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(getWsUrl());
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    console.log("🔌 WebSocket connected");
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      // Binary = TTS audio
      console.log(`🔊 WS | binary received: ${event.data.byteLength} bytes`);
      messageHandler?.({ type: "tts_audio", data: event.data });
      return;
    }
    try {
      const msg: ServerMessage = JSON.parse(event.data);
      messageHandler?.(msg);
    } catch {
      console.warn("Failed to parse WS message:", event.data);
    }
  };

  ws.onclose = () => {
    console.log("🔌 WebSocket disconnected, reconnecting...");
    reconnectTimer = setTimeout(doConnect, RECONNECT_DELAY);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}

export function send(msg: ClientMessage): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn("WebSocket not connected");
    return;
  }
  ws.send(JSON.stringify(msg));
}

export function sendBinary(data: ArrayBuffer): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(data);
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.close();
  ws = null;
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}
