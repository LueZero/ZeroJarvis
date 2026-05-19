/**
 * Session voice command detection
 * Patterns for switching/creating sessions via voice
 */

export type SessionCmd = "new" | "prev" | "next";

/** Session command patterns (loose match — tolerates punctuation and filler words) */
const SESSION_COMMANDS: { cmd: SessionCmd; pattern: RegExp }[] = [
  { cmd: "new", pattern: /新(的)?對話|開新的|new\s*chat/i },
  { cmd: "prev", pattern: /(上|前)一個|切(到|換)?上一個|previous/i },
  { cmd: "next", pattern: /(下|後)一個|切(到|換)?下一個|next/i },
];

/** Detect session voice commands from STT text */
export function detectSessionCommand(text: string): SessionCmd | null {
  // Strip common punctuation Whisper may add
  const cleaned = text.trim().replace(/[。，！？、.!?,\s]+$/g, "");
  // Only match if the cleaned text is short (avoid false positives in longer sentences)
  if (cleaned.length > 8) return null;
  for (const { cmd, pattern } of SESSION_COMMANDS) {
    if (pattern.test(cleaned)) return cmd;
  }
  return null;
}
