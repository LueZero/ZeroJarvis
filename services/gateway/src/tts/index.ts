/**
 * TTS Router — switch between providers via TTS_PROVIDER env var
 * Values: "openai" (default) | "edge"
 */

import { readFileSync } from "fs";
import { resolve } from "path";

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

const TTS_PROVIDER = (loadEnvKey("TTS_PROVIDER") || "openai").toLowerCase();

let _synthesize: ((text: string, voice?: string) => Promise<ArrayBuffer>) | null = null;

async function getProvider() {
  if (_synthesize) return _synthesize;

  if (TTS_PROVIDER === "edge") {
    const mod = await import("./edge-tts.js");
    _synthesize = mod.synthesize;
  } else {
    const mod = await import("./openai-tts.js");
    _synthesize = mod.synthesize;
  }

  console.log(`[TTS] Provider: ${TTS_PROVIDER}`);
  return _synthesize;
}

export async function synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
  const fn = await getProvider();
  return fn(text, voice);
}
