/**
 * TTS via OpenAI API (tts-1 / tts-1-hd)
 * High-quality, handles Chinese/English mixed text naturally
 * Returns audio as ArrayBuffer
 */

import { readFileSync } from "fs";
import { resolve } from "path";

/** Read key from process.env or walk up to find .env file */
function loadEnvKey(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    let dir = process.cwd();
    for (let i = 0; i < 5; i++) {
      const envPath = resolve(dir, ".env");
      try {
        const content = readFileSync(envPath, "utf-8");
        const match = content.match(new RegExp(`^${key}=(.+)$`, "m"));
        if (match) return match[1].trim();
      } catch {}
      dir = resolve(dir, "..");
    }
  } catch {}
  return "";
}

const OPENAI_API_KEY = loadEnvKey("OPENAI_API_KEY");
const TTS_MODEL = loadEnvKey("OPENAI_TTS_MODEL") || "tts-1";
const TTS_VOICE = loadEnvKey("OPENAI_TTS_VOICE") || "nova";
const TTS_SPEED = parseFloat(loadEnvKey("OPENAI_TTS_SPEED") || "1.0");

const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";

export async function synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Please add it to .env");
  }

  const response = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: text,
      voice: voice || TTS_VOICE,
      response_format: "mp3",
      speed: TTS_SPEED,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI TTS failed (${response.status}): ${err}`);
  }

  return response.arrayBuffer();
}

/**
 * Split long text into sentences for streaming TTS
 */
export function splitSentences(text: string): string[] {
  const sentences = text.split(/(?<=[。！？.!?\n])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}
