/**
 * Microphone capture with echo cancellation and noise suppression
 */

export async function getMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 16000,
    },
  });
}

/**
 * Convert AudioBuffer to Float32Array at 16kHz mono
 */
export function downsampleTo16k(buffer: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return buffer;
  const ratio = fromRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}
