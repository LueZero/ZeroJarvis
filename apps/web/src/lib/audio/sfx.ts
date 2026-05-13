/**
 * Sci-fi HUD sound effects — synthesized via Web Audio API
 * No external audio files needed. All sounds are procedurally generated.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

/** Volume (0–1). Kept low so it doesn't overpower TTS. */
const MASTER_VOL = 0.12;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = MASTER_VOL;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

// ── Helpers ──

function osc(
  type: OscillatorType,
  freq: number,
  startTime: number,
  duration: number,
  gain: number,
  freqEnd?: number,
): void {
  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();

  o.type = type;
  o.frequency.setValueAtTime(freq, startTime);
  if (freqEnd !== undefined) {
    o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), startTime + duration);
  }

  g.gain.setValueAtTime(0.001, startTime);
  g.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  o.connect(g);
  g.connect(getMaster());

  o.start(startTime);
  o.stop(startTime + duration + 0.05);
}

function noise(startTime: number, duration: number, gain: number): void {
  const c = getCtx();
  const bufSize = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }

  const src = c.createBufferSource();
  src.buffer = buf;

  // Bandpass filter for a more "digital" noise
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 3000;
  filter.Q.value = 2;

  const g = c.createGain();
  g.gain.setValueAtTime(0.001, startTime);
  g.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  src.connect(filter);
  filter.connect(g);
  g.connect(getMaster());

  src.start(startTime);
  src.stop(startTime + duration + 0.05);
}

// ── Public SFX ──

/**
 * HUD boot-up — ascending dual-tone sweep + digital noise burst
 * Plays when SideHUD activates (thinking starts)
 */
export function sfxActivate(): void {
  const t = getCtx().currentTime;

  // Low sweep up
  osc("sine", 200, t, 0.35, 0.6, 800);
  // High harmonic
  osc("sine", 600, t + 0.05, 0.3, 0.3, 1600);
  // Digital noise burst
  noise(t + 0.08, 0.15, 0.25);
  // Confirmation ping
  osc("sine", 1200, t + 0.3, 0.12, 0.4);
  osc("sine", 1500, t + 0.35, 0.1, 0.25);
}

/**
 * HUD power-down — descending tone
 * Plays when SideHUD deactivates (back to idle)
 */
export function sfxDeactivate(): void {
  const t = getCtx().currentTime;

  osc("sine", 800, t, 0.25, 0.4, 200);
  osc("triangle", 600, t + 0.05, 0.2, 0.2, 150);
  noise(t + 0.1, 0.08, 0.12);
}

/**
 * Tool start — short blip
 * Plays when a tool call begins
 */
export function sfxToolStart(): void {
  const t = getCtx().currentTime;

  osc("sine", 880, t, 0.06, 0.5);
  osc("square", 1100, t + 0.02, 0.04, 0.15);
}

/**
 * Tool done — double ping (success)
 * Plays when a tool call completes successfully
 */
export function sfxToolDone(): void {
  const t = getCtx().currentTime;

  osc("sine", 1000, t, 0.08, 0.4);
  osc("sine", 1400, t + 0.1, 0.1, 0.35);
}

/**
 * Tool error — low buzz
 * Plays when a tool call fails
 */
export function sfxToolError(): void {
  const t = getCtx().currentTime;

  osc("sawtooth", 180, t, 0.15, 0.3);
  osc("square", 120, t + 0.02, 0.12, 0.2);
  noise(t, 0.1, 0.15);
}

/**
 * Step tick — subtle click
 * Plays on step-start / step-finish events
 */
export function sfxStepTick(): void {
  const t = getCtx().currentTime;

  osc("sine", 2400, t, 0.03, 0.3);
  noise(t, 0.02, 0.08);
}

/**
 * Reasoning pulse — very soft ambient tone
 * Plays periodically during reasoning (throttled by caller)
 */
export function sfxReasoningPulse(): void {
  const t = getCtx().currentTime;

  osc("sine", 440, t, 0.15, 0.15);
  osc("sine", 660, t + 0.05, 0.12, 0.08);
}
