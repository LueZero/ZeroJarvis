/**
 * VAD (Voice Activity Detection) using Silero VAD via ONNX
 * Wrapper around @ricky0123/vad-web
 */

import {
  VAD_REDEMPTION_FRAMES,
  VAD_REDEMPTION_FRAMES_LONG,
  VAD_LONG_SPEECH_THRESHOLD_MS,
} from "@zerojarvis/shared";

export interface VADCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
}

let vadInstance: any = null;
let speechStartTime = 0;

export async function initVAD(callbacks: VADCallbacks) {
  // Dynamic import to avoid SSR issues
  const { MicVAD } = await import("@ricky0123/vad-web");

  console.log("VAD | creating MicVAD instance...");

  vadInstance = await MicVAD.new({
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.3,
    minSpeechFrames: 3,
    redemptionFrames: VAD_REDEMPTION_FRAMES,

    // Serve ONNX/WASM assets from /static to avoid Vite bundling issues
    modelURL: "/silero_vad_legacy.onnx",
    workletURL: "/vad.worklet.bundle.min.js",
    ortConfig(ort: any) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = "/";
    },

    onSpeechStart: () => {
      console.log("VAD | 🎙️ speech started");
      speechStartTime = Date.now();
      callbacks.onSpeechStart();

      // Auto-switch to long mode after threshold
      setTimeout(() => {
        if (vadInstance && Date.now() - speechStartTime >= VAD_LONG_SPEECH_THRESHOLD_MS) {
          // Extend silence tolerance for long speech
          vadInstance.options.redemptionFrames = VAD_REDEMPTION_FRAMES_LONG;
        }
      }, VAD_LONG_SPEECH_THRESHOLD_MS);
    },

    onSpeechEnd: (audio: Float32Array) => {
      console.log("VAD | 🔇 speech ended, audio length:", audio.length);
      // Reset to default redemption frames
      if (vadInstance) {
        vadInstance.options.redemptionFrames = VAD_REDEMPTION_FRAMES;
      }
      callbacks.onSpeechEnd(audio);
    },
  });

  console.log("VAD | ✅ MicVAD instance created");
  return vadInstance;
}

export function startVAD() {
  console.log("VAD | ▶️ start() called, instance:", !!vadInstance);
  vadInstance?.start();
}

export function stopVAD() {
  console.log("VAD | ⏸️ pause() called");
  vadInstance?.pause();
}

export function destroyVAD() {
  vadInstance?.destroy();
  vadInstance = null;
}
