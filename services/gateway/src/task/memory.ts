/**
 * Memory Store — persistent file-based memory system.
 * Each memory is a YAML-frontmatter markdown file stored in files/memory/.
 * Supports 4 types: user, project, task-history, reference.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { resolve, basename } from "path";
import { log, logWarn } from "../logger.js";

const MEMORY_DIR = resolve(import.meta.dir, "../../../../files/memory");
const INDEX_FILE = resolve(MEMORY_DIR, "MEMORY.md");

export type MemoryType = "user" | "project" | "task-history" | "reference";

export interface Memory {
  name: string;
  type: MemoryType;
  description: string;
  content: string;
  created: string;
  updated: string;
}

/** Ensure memory directory exists (call at gateway startup) */
export function ensureDir(): void {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

/** Save or update a memory */
export function saveMemory(
  name: string,
  type: MemoryType,
  description: string,
  content: string,
): void {
  ensureDir();
  const safeName = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, "-").slice(0, 80);
  const filePath = resolve(MEMORY_DIR, `${safeName}.md`);
  const now = new Date().toISOString();

  // Check if file exists to preserve created date
  let created = now;
  if (existsSync(filePath)) {
    try {
      const existing = parseMemoryFile(filePath);
      if (existing?.created) created = existing.created;
    } catch { /* use now */ }
  }

  const fileContent = `---
name: ${safeName}
type: ${type}
description: ${description}
created: ${created}
updated: ${now}
---
${content}
`;

  writeFileSync(filePath, fileContent, "utf-8");
  log("MEMORY", `Saved: ${safeName} [${type}]`);
  rebuildIndex();
}

/** Load all memories */
export function loadAll(): Memory[] {
  ensureDir();
  const memories: Memory[] = [];
  try {
    const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md") && f !== "MEMORY.md");
    for (const file of files) {
      const mem = parseMemoryFile(resolve(MEMORY_DIR, file));
      if (mem) memories.push(mem);
    }
  } catch (err: any) {
    logWarn("MEMORY", `Failed to load memories: ${err.message}`);
  }
  return memories;
}

/** Load memories filtered by type */
export function loadByType(type: MemoryType): Memory[] {
  return loadAll().filter(m => m.type === type);
}

/** Simple keyword search across name, description, content */
export function search(query: string): Memory[] {
  const q = query.toLowerCase();
  return loadAll().filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.description.toLowerCase().includes(q) ||
    m.content.toLowerCase().includes(q)
  );
}

/** Delete a memory by name */
export function deleteMemory(name: string): boolean {
  const safeName = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, "-").slice(0, 80);
  const filePath = resolve(MEMORY_DIR, `${safeName}.md`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  log("MEMORY", `Deleted: ${safeName}`);
  rebuildIndex();
  return true;
}

/** Rebuild the MEMORY.md index file */
export function rebuildIndex(): void {
  const memories = loadAllRaw();
  const lines = [
    "# Memory Index",
    "",
    `> Auto-generated | ${memories.length} memories | ${new Date().toISOString()}`,
    "",
  ];
  for (const m of memories) {
    lines.push(`- **${m.name}** [${m.type}]: ${m.description}`);
  }
  lines.push("");
  writeFileSync(INDEX_FILE, lines.join("\n"), "utf-8");
}

/** Build a summary string for injection into prompts (with char limit) */
export function buildSummary(maxChars: number = 1200): string {
  const memories = loadAll();
  if (memories.length === 0) return "";

  const lines: string[] = [];
  let totalLen = 0;
  for (const m of memories) {
    const line = `[${m.type}] ${m.name}: ${m.description || m.content.slice(0, 100)}`;
    if (totalLen + line.length > maxChars) break;
    lines.push(line);
    totalLen += line.length;
  }
  return lines.join("\n");
}

// --- Internal helpers ---

/** Load all memories without triggering index rebuild (avoid recursion) */
function loadAllRaw(): Memory[] {
  const memories: Memory[] = [];
  try {
    const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md") && f !== "MEMORY.md");
    for (const file of files) {
      const mem = parseMemoryFile(resolve(MEMORY_DIR, file));
      if (mem) memories.push(mem);
    }
  } catch { /* ignore */ }
  return memories;
}

/** Parse a single memory markdown file with YAML frontmatter */
function parseMemoryFile(filePath: string): Memory | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1];
    const content = match[2].trim();

    const get = (key: string): string => {
      const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
      return m ? m[1].trim() : "";
    };

    const type = get("type") as MemoryType;
    if (!["user", "project", "task-history", "reference"].includes(type)) return null;

    return {
      name: get("name") || basename(filePath, ".md"),
      type,
      description: get("description"),
      content,
      created: get("created"),
      updated: get("updated"),
    };
  } catch {
    return null;
  }
}
