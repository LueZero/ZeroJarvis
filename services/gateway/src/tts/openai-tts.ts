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

/**
 * Preprocess text for OpenAI TTS — convert symbols to spoken Chinese
 * OpenAI TTS tends to read symbols in English; this converts them to natural Chinese speech
 */
function preprocessForTTS(text: string): string {
  return text
    // Formulas: "X = Y/Z" → "X 等於 Y 分之 Z" (single letter or Greek vars)
    .replace(/([A-Za-zα-ωΑ-Ω]+)\s*=\s*([A-Za-zα-ωΑ-Ω0-9]+)\s*\/\s*([A-Za-zα-ωΑ-Ω0-9]+)/g, "$1等於$2分之$3")
    // Remaining "X = Y" patterns (equations)
    .replace(/([A-Za-zα-ωΑ-Ω]+)\s*=\s*([A-Za-zα-ωΑ-Ω0-9×·\s]+)/g, "$1等於$2")
    // Percentage: "50%" → "百分之50"
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "百分之$1")
    // Common math/comparison Unicode symbols
    .replace(/≥/g, "大於等於")
    .replace(/≤/g, "小於等於")
    .replace(/≈/g, "約等於")
    .replace(/≠/g, "不等於")
    .replace(/±/g, "正負")
    .replace(/×/g, "乘")
    .replace(/÷/g, "除以")
    .replace(/√/g, "根號")
    .replace(/∞/g, "無限大")
    .replace(/π/g, "派")
    .replace(/ρ/g, "rou")
    .replace(/ℓ/g, "L")
    // Fraction patterns: number/number
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$2分之$1")
    // Arrows → natural pause
    .replace(/[→⇒►▶]/g, "，")
    .replace(/[←⇐◄◀]/g, "，")
    .replace(/[↑↓↕↔]/g, "")
    // Comparison operators
    .replace(/(\d)\s*>=\s*(\d)/g, "$1大於等於$2")
    .replace(/(\d)\s*<=\s*(\d)/g, "$1小於等於$2")
    .replace(/(\d)\s*!=\s*(\d)/g, "$1不等於$2")
    // Standalone symbols that TTS reads oddly
    .replace(/\s*[#*]+\s*/g, " ")
    .replace(/&/g, "和")
    .replace(/\|/g, " ")
    .replace(/\\/g, " ")
    // "/" between words → "或"; "/" in remaining math context → "分之"
    .replace(/([一-龥])\s*\/\s*([一-龥])/g, "$1或$2")
    .replace(/([A-Za-z])\s*\/\s*([A-Za-z])/g, "$1分之$2")
    // Brackets/braces → space
    .replace(/[{}[\]()（）【】《》「」『』]/g, " ")
    // Currency
    .replace(/\$(\d)/g, "美金$1")
    .replace(/€(\d)/g, "歐元$1")
    .replace(/¥(\d)/g, "日圓$1")
    // Degree
    .replace(/(\d+)\s*°C/g, "$1度C")
    .replace(/(\d+)\s*°F/g, "$1華氏度")
    .replace(/(\d+)\s*°/g, "$1度")
    // Collapse whitespace
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Please add it to .env");
  }

  const processed = preprocessForTTS(text);

  const response = await fetch(OPENAI_TTS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      input: processed,
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
