export const GATEWAY_PORT = 3100;
export const WS_PATH = "/ws";
export const API_PREFIX = "/api";

// VAD
export const VAD_REDEMPTION_FRAMES = 8;           // ~480ms silence → end
export const VAD_REDEMPTION_FRAMES_LONG = 24;     // ~1.5s for long speech
export const VAD_LONG_SPEECH_THRESHOLD_MS = 5000;  // switch to long mode after 5s

// Audio
export const SAMPLE_RATE = 16000;
export const CHANNELS = 1;

// Polish
export const POLISH_AUTO_SEND_DELAY_MS = 2000;    // auto-send toast duration
