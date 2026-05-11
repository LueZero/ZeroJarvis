import { SAMPLE_RATE } from "@zerojarvis/shared";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * STT via Groq Whisper API (free, fast, accurate Chinese).
 * Requires GROQ_API_KEY environment variable.
 * Get a free key at https://console.groq.com/keys
 */

// Load .env from project root if GROQ_API_KEY not already set
function loadEnvKey(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    // Walk up to find .env
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

const GROQ_API_KEY = loadEnvKey("GROQ_API_KEY");

/** Convert Float32Array PCM to WAV buffer */
function float32ToWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataLength = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  // Convert float32 [-1,1] to int16
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

export async function transcribe(audio: Float32Array): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not set. Get a free key at https://console.groq.com/keys");
  }

  // Limit to 30 seconds
  const maxSamples = SAMPLE_RATE * 30;
  const clipped = audio.length > maxSamples ? audio.slice(0, maxSamples) : audio;

  console.log(`🎤 STT: sending ${clipped.length} samples (${(clipped.length / SAMPLE_RATE).toFixed(1)}s) to Groq...`);

  const wav = float32ToWav(clipped, SAMPLE_RATE);

  const formData = new FormData();
  formData.append("file", new Blob([wav as BlobPart], { type: "audio/wav" }), "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("language", "zh");
  formData.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const result = await res.json() as { text?: string };
  const text = (result.text ?? "").trim();
  console.log(`🎤 STT result: "${text}"`);
  return text;
}
