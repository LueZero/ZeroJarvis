/**
 * Input sanitization — prompt injection defense
 * Strips common injection patterns from user input before LLM processing.
 */

/** Patterns commonly used in prompt injection attempts */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a|an|in)\s+/i,
  /new\s+instructions?:\s*/i,
  /system\s*prompt:\s*/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|im_start\|>/i,
  /\bDAN\b.*\bmode\b/i,
  /do\s+anything\s+now/i,
  /jailbreak/i,
];

/**
 * Check if text contains likely prompt injection.
 * Returns the matched pattern description or null if clean.
 */
export function detectInjection(text: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return pattern.source;
    }
  }
  return null;
}

/**
 * Sanitize user text input — flag suspicious content.
 * For this personal assistant, we log but don't block (user is owner).
 * External content (screenshots, tool output) gets stricter handling.
 */
export function sanitizeExternalContent(text: string): string {
  // Strip zero-width characters that could hide instructions
  let cleaned = text.replace(/[\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, "");
  // Strip invisible Unicode tags (U+E0000-U+E007F)
  cleaned = cleaned.replace(/[\u{E0000}-\u{E007F}]/gu, "");
  return cleaned;
}
