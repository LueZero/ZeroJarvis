/**
 * TTS via msedge-tts (free Microsoft Edge TTS — JS native, no subprocess)
 * Returns audio as ArrayBuffer
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const DEFAULT_VOICE = process.env.TTS_VOICE || "zh-TW-HsiaoChenNeural";

let ttsInstance: MsEdgeTTS | null = null;

async function getTTS(): Promise<MsEdgeTTS> {
  if (!ttsInstance) {
    ttsInstance = new MsEdgeTTS();
    await ttsInstance.setMetadata(DEFAULT_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  }
  return ttsInstance;
}

export async function synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
  // If custom voice requested, create fresh instance
  let tts: MsEdgeTTS;
  if (voice && voice !== DEFAULT_VOICE) {
    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  } else {
    tts = await getTTS();
  }

  const { audioStream } = tts.toStream(text);

  const chunks: Uint8Array[] = [];
  for await (const chunk of audioStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  // Merge chunks
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer as ArrayBuffer;
}

/**
 * Split long text into sentences for streaming TTS
 */
export function splitSentences(text: string): string[] {
  const sentences = text.split(/(?<=[。！？.!?\n])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}
