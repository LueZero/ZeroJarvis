import { appendFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const LOG_DIR = resolve(process.cwd(), "../../logs");
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function getLogPath(): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return resolve(LOG_DIR, `gateway-${date}.log`);
}

function formatEntry(level: string, category: string, message: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] [${category}] ${message}\n`;
}

export function log(category: string, message: string) {
  const entry = formatEntry("INFO", category, message);
  process.stdout.write(entry);
  try { appendFileSync(getLogPath(), entry); } catch {}
}

export function logWarn(category: string, message: string) {
  const entry = formatEntry("WARN", category, message);
  process.stdout.write(entry);
  try { appendFileSync(getLogPath(), entry); } catch {}
}

export function logError(category: string, message: string) {
  const entry = formatEntry("ERROR", category, message);
  process.stderr.write(entry);
  try { appendFileSync(getLogPath(), entry); } catch {}
}
