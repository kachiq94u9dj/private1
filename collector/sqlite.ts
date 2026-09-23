import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

export class PermissionError extends Error {}

/**
 * 使用中の DB を直接開くとロックや WAL の都合で読めないことがあるため、
 * WAL / SHM ごと一時ディレクトリにコピーしてから読む。
 */
export function withDbCopy<T>(path: string, fn: (copy: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "sti-"));
  try {
    const target = join(dir, basename(path));
    for (const suffix of ["", "-wal", "-shm"]) {
      if (!existsSync(path + suffix)) continue;
      try {
        copyFileSync(path + suffix, target + suffix);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "EACCES") {
          throw new PermissionError(`${path} を読めません。フルディスクアクセスの許可が必要です（README 参照）`);
        }
        throw e;
      }
    }
    return fn(target);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** macOS 標準の /usr/bin/sqlite3 で SQL を実行し、JSON で結果を受け取る */
export function query<T = Record<string, unknown>>(dbPath: string, sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", dbPath, sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  const trimmed = out.trim();
  return trimmed ? (JSON.parse(trimmed) as T[]) : [];
}

export function tables(dbPath: string): Set<string> {
  return new Set(query<{ name: string }>(dbPath, "SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
}

export function columns(dbPath: string, table: string): Set<string> {
  if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error(`invalid table name: ${table}`);
  return new Set(query<{ name: string }>(dbPath, `PRAGMA table_info(${table})`).map((r) => r.name));
}

/** Core Data の日付（2001-01-01 起点の秒）→ Unix ミリ秒 */
export function coreDataToMs(value: number): number {
  return (value + 978307200) * 1000;
}

export function msToCoreData(ms: number): number {
  return ms / 1000 - 978307200;
}
