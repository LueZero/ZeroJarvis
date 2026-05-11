/**
 * VAD (Voice Activity Detection) using Silero VAD via ONNX
 * Wrapper around @ricky0123/vad-web
 */

import {
  VAD_POSITIVE_SPEECH_THRESHOLD,
  VAD_NEGATIVE_SPEECH_THRESHOLD,
  VAD_REDEMPTION_MS,
  VAD_REDEMPTION_MS_LONG,
  VAD_LONG_SPEECH_THRESHOLD_MS,
} from "@zerojarvis/shared";

export interface VADCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
}

let vadInstance: any = null;
let speechStartTime = 0;
let vadActive = false;
/** Tracks whether a real speech session is in progress (set by onSpeechStart, cleared by onSpeechEnd) */
let speechInProgress = false;

export async function initVAD(callbacks: VADCallbacks) {
  // Dynamic import to avoid SSR issues
  const { MicVAD } = await import("@ricky0123/vad-web");

  console.log("VAD | creating MicVAD instance...");

  vadInstance = await MicVAD.new({
    positiveSpeechThreshold: VAD_POSITIVE_SPEECH_THRESHOLD,
    negativeSpeechThreshold: VAD_NEGATIVE_SPEECH_THRESHOLD,
    minSpeechMs: 250,
    redemptionMs: VAD_REDEMPTION_MS,
    submitUserSpeechOnPause: true,

    // Serve ONNX/WASM assets from /static to avoid Vite bundling issues
    modelURL: "/silero_vad_legacy.onnx",
    workletURL: "/vad.worklet.bundle.min.js",
    ortConfig(ort: any) {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = "/";
    },

    onSpeechStart: () => {
      // Guard: block stale events from AudioWorklet after pause()
      if (!vadActive) {
        console.log("VAD | 🎙️ speech started (ignored — vadActive=false)");
        return;
      }
      console.log("VAD | 🎙️ speech started");
      speechInProgress = true;
      speechStartTime = Date.now();
      callbacks.onSpeechStart();

      // Auto-switch to long mode after threshold
      setTimeout(() => {
        if (vadInstance && vadActive && Date.now() - speechStartTime >= VAD_LONG_SPEECH_THRESHOLD_MS) {
          // Extend silence tolerance for long speech
          vadInstance.setOptions({ redemptionMs: VAD_REDEMPTION_MS_LONG });
        }
      }, VAD_LONG_SPEECH_THRESHOLD_MS);
    },

    onSpeechEnd: (audio: Float32Array) => {
      // Guard: only allow if a real speech session was in progress
      // (filters stale AudioWorklet events after pause, but allows submitUserSpeechOnPause)
      if (!speechInProgress) {
        console.log("VAD | 🔇 speech ended (ignored — no active speech), audio length:", audio.length);
        return;
      }
      speechInProgress = false;
      console.log("VAD | 🔇 speech ended, audio length:", audio.length);
      // Reset to default redemption
      if (vadInstance) {
        vadInstance.setOptions({ redemptionMs: VAD_REDEMPTION_MS });
      }
      callbacks.onSpeechEnd(audio);
    },
  });

  console.log("VAD | ✅ MicVAD instance created");
  return vadInstance;
}

export function startVAD() {
  console.log("VAD | ▶️ start() called, instance:", !!vadInstance);
  vadActive = true;
  vadInstance?.start();
}

export function stopVAD() {
  console.log("VAD | ⏸️ pause() called, speechInProgress:", speechInProgress);
  vadActive = false;
  // pause() may synchronously trigger onSpeechEnd via submitUserSpeechOnPause
  // speechInProgress flag ensures only legitimate buffered speech goes through
  vadInstance?.pause();
  // After pause returns, clear speechInProgress to block any further stale events
  speechInProgress = false;
}

export function isVADActive(): boolean {
  return vadActive;
}

export function destroyVAD() {
  vadActive = false;
  vadInstance?.destroy();
  vadInstance = null;
}
