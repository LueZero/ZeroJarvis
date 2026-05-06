/**
 * Audio player for TTS output
 * Supports streaming playback and interruption
 */

let audioContext: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/** Call this during a user gesture to unlock AudioContext */
export async function ensureAudioContext(): Promise<void> {
  const ctx = getContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
    console.log(`🔊 Player | AudioContext pre-unlocked: ${ctx.state}`);
  }
}

export async function playAudio(data: ArrayBuffer): Promise<void> {
  console.log(`🔊 Player | playAudio called, data size: ${data.byteLength}`);
  const ctx = getContext();
  console.log(`🔊 Player | AudioContext state: ${ctx.state}`);

  // Resume context if suspended (browser autoplay policy)
  if (ctx.state === "suspended") {
    await ctx.resume();
    console.log(`🔊 Player | AudioContext resumed: ${ctx.state}`);
  }

  const buffer = await ctx.decodeAudioData(data.slice(0)); // slice to avoid detached buffer
  console.log(`🔊 Player | decoded: ${buffer.duration.toFixed(2)}s, ${buffer.numberOfChannels}ch, ${buffer.sampleRate}Hz`);

  return new Promise((resolve) => {
    stopAudio(); // stop any current playback

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      currentSource = null;
      resolve();
    };
    currentSource = source;
    source.start(0);
  });
}

export function stopAudio(): void {
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      // already stopped
    }
    currentSource = null;
  }
}

export function isPlaying(): boolean {
  return currentSource !== null;
}
