import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const CONFIG_DIR = join(homedir(), ".screen-time-insights");
const CONFIG_FILE = join(CONFIG_DIR, "config.env");
const STATE_FILE = join(CONFIG_DIR, "state.json");

export interface Config {
  url: string;
  ingestToken: string;
  accessClientId?: string;
  accessClientSecret?: string;
  excludeDevices: string[];
  chromeProfiles?: string[];
  /** この時刻（ローカル）より前は自動実行しない */
  minHour: number;
}

export interface State {
  lastSuccessDate?: string;
  appNames?: Record<string, string | null>;
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function loadConfig(): Config {
  const env = { ...parseEnvFile(CONFIG_FILE), ...process.env } as Record<string, string | undefined>;
  const list = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  return {
    url: (env.STI_URL ?? "").replace(/\/$/, ""),
    ingestToken: env.STI_INGEST_TOKEN ?? "",
    accessClientId: env.CF_ACCESS_CLIENT_ID || undefined,
    accessClientSecret: env.CF_ACCESS_CLIENT_SECRET || undefined,
    excludeDevices: list(env.STI_EXCLUDE_DEVICES),
    chromeProfiles: list(env.STI_CHROME_PROFILES),
    minHour: Number(env.STI_MIN_HOUR ?? 4),
  };
}

export function loadState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return {};
  }
}

export function saveState(state: State): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
