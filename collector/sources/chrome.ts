// Chrome の閲覧履歴からドメイン別の閲覧時間を概算する（スクリーンタイムは Chrome のサイト別時間を記録しないため）。
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromeIntervals, domainOf, UsageAccumulator } from "../bucket.ts";
import { query, withDbCopy } from "../sqlite.ts";
import type { SourceContext, SourceResult } from "./types.ts";

const CHROME_DIR = join(homedir(), "Library", "Application Support", "Google", "Chrome");
// Chrome の時刻は 1601-01-01 起点のマイクロ秒
const WEBKIT_EPOCH_OFFSET_SEC = 11644473600;

export function chromeHistoryPaths(profiles?: string[]): string[] {
  if (!existsSync(CHROME_DIR)) return [];
  const names = profiles?.length
    ? profiles
    : readdirSync(CHROME_DIR).filter((n) => n === "Default" || /^Profile \d+$/.test(n));
  return names.map((n) => join(CHROME_DIR, n, "History")).filter((p) => existsSync(p));
}

export function collectChrome(ctx: SourceContext, profiles?: string[], paths = chromeHistoryPaths(profiles)): SourceResult {
  if (paths.length === 0) {
    return { source: "chrome", rows: [], devices: [], pickups: [], notes: ["Chrome の履歴が見つかりませんでした"] };
  }
  const sinceWebkit = Math.floor((ctx.sinceMs / 1000 + WEBKIT_EPOCH_OFFSET_SEC) * 1e6);
  const visits: { startMs: number; durationMs: number; domain: string }[] = [];
  const notes: string[] = [];

  for (const path of paths) {
    const rows = withDbCopy(path, (db) =>
      query<{ t: number; d: number; url: string }>(
        db,
        `SELECT v.visit_time AS t, v.visit_duration AS d, u.url AS url
         FROM visits v JOIN urls u ON v.url = u.id
         WHERE v.visit_time >= ${sinceWebkit}`,
      ),
    );
    notes.push(`${path.split("/").slice(-2, -1)[0]}: ${rows.length} 訪問`);
    for (const r of rows) {
      const domain = domainOf(r.url);
      if (!domain) continue;
      visits.push({ startMs: (r.t / 1e6 - WEBKIT_EPOCH_OFFSET_SEC) * 1000, durationMs: r.d / 1000, domain });
    }
  }

  const acc = new UsageAccumulator<"chrome">();
  for (const iv of chromeIntervals(visits)) {
    acc.addInterval(ctx.local.id, "web", iv.domain, "chrome", iv.startMs, iv.endMs);
  }
  return {
    source: "chrome",
    rows: acc.entries().map((e) => ({ ...e, type: "web" as const })),
    devices: [ctx.local],
    pickups: [],
    notes,
  };
}
