/**
 * Notebook overlay voice command detection
 * Patterns for quiz, flashcards, mindmap, and common controls
 */

import type { NotebookContentType } from "@zerojarvis/shared";

export type NotebookCmd =
  | { cmd: "answer"; value: number }
  | { cmd: "next" | "prev" | "flip" | "reset" | "close" | "expand" | "collapse" | "scroll_down" | "scroll_up" };

const NOTEBOOK_COMMANDS_QUIZ: { match: RegExp; result: NotebookCmd }[] = [
  { match: /^[Aa]$|^答[Aa]$|^選[Aa]$/,   result: { cmd: "answer", value: 0 } },
  { match: /^[Bb]$|^答[Bb]$|^選[Bb]$/,   result: { cmd: "answer", value: 1 } },
  { match: /^[Cc]$|^答[Cc]$|^選[Cc]$/,   result: { cmd: "answer", value: 2 } },
  { match: /^[Dd]$|^答[Dd]$|^選[Dd]$/,   result: { cmd: "answer", value: 3 } },
  { match: /下一題|next/i,                result: { cmd: "next" } },
  { match: /上一題|prev/i,                result: { cmd: "prev" } },
  { match: /重新開始|reset/i,             result: { cmd: "reset" } },
];

const NOTEBOOK_COMMANDS_FLASHCARDS: { match: RegExp; result: NotebookCmd }[] = [
  { match: /翻(轉|開|面)|flip/i,           result: { cmd: "flip" } },
  { match: /下一張|next/i,                 result: { cmd: "next" } },
  { match: /上一張|prev/i,                 result: { cmd: "prev" } },
];

const NOTEBOOK_COMMANDS_MINDMAP: { match: RegExp; result: NotebookCmd }[] = [
  { match: /展開|expand/i,                 result: { cmd: "expand" } },
  { match: /收合|collapse/i,               result: { cmd: "collapse" } },
];

const NOTEBOOK_COMMANDS_COMMON: { match: RegExp; result: NotebookCmd }[] = [
  { match: /^關閉$|^close$/i,              result: { cmd: "close" } },
  { match: /往下|向下|scroll\s*down/i,     result: { cmd: "scroll_down" } },
  { match: /往上|向上|scroll\s*up/i,       result: { cmd: "scroll_up" } },
];

/** Detect notebook voice commands based on current content type */
export function detectNotebookCommand(text: string, contentType: NotebookContentType | null): NotebookCmd | null {
  const cleaned = text.trim().replace(/[。，！？、.!?,\s]+$/g, "");
  if (cleaned.length > 10) return null;

  // Type-specific commands first
  const typeCommands = contentType === "quiz" ? NOTEBOOK_COMMANDS_QUIZ
    : contentType === "flashcards" ? NOTEBOOK_COMMANDS_FLASHCARDS
    : contentType === "mindmap" ? NOTEBOOK_COMMANDS_MINDMAP
    : [];

  for (const { match, result } of typeCommands) {
    if (match.test(cleaned)) return result;
  }
  // Common commands
  for (const { match, result } of NOTEBOOK_COMMANDS_COMMON) {
    if (match.test(cleaned)) return result;
  }
  return null;
}
