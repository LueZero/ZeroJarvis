export const GATEWAY_PORT = 3100;
export const WS_PATH = "/ws";
export const API_PREFIX = "/api";

// VAD
export const VAD_POSITIVE_SPEECH_THRESHOLD = 0.5;  // speech detection sensitivity
export const VAD_NEGATIVE_SPEECH_THRESHOLD = 0.28; // silence detection threshold
export const VAD_REDEMPTION_MS = 900;              // ~900ms silence → end (tolerates walking pauses)
export const VAD_REDEMPTION_MS_LONG = 1600;        // ~1.6s for long speech
export const VAD_LONG_SPEECH_THRESHOLD_MS = 5000;  // switch to long mode after 5s

// Audio
export const SAMPLE_RATE = 16000;
export const CHANNELS = 1;

// Polish
export const POLISH_AUTO_SEND_DELAY_MS = 2000;    // auto-send toast duration
