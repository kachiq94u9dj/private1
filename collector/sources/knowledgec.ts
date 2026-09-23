// 旧来のスクリーンタイム記録 (knowledgeC.db)。RMAdminStore が読めない環境向けの予備。
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeviceInfo } from "../../src/shared/types.ts";
import { guessPlatform, UsageAccumulator } from "../bucket.ts";
import { columns, coreDataToMs, msToCoreData, query, tables, withDbCopy } from "../sqlite.ts";
import type { SourceContext, SourceResult } from "./types.ts";

export const KNOWLEDGE_DB = join(homedir(), "Library", "Application Support", "Knowledge", "knowledgeC.db");

export function collectKnowledgeC(ctx: SourceContext, dbPath = KNOWLEDGE_DB): SourceResult {
  if (!existsSync(dbPath)) {
    return { source: "knowledgec", rows: [], devices: [], pickups: [], notes: ["knowledgeC.db が見つかりませんでした"] };
  }
  return withDbCopy(dbPath, (db) => {
    const t = tables(db);
    const since = Math.floor(msToCoreData(ctx.sinceMs));
    const hasPeer = t.has("ZSYNCPEER");
    const peerCols = hasPeer ? columns(db, "ZSYNCPEER") : new Set<string>();
    const peerName = peerCols.has("ZNAME") ? "p.ZNAME" : peerCols.has("ZMODEL") ? "p.ZMODEL" : "NULL";

    const apps = query<{ bundle: string; s: number; e: number; dev: string | null; peer: string | null }>(
      db,
      `SELECT o.ZVALUESTRING AS bundle, o.ZSTARTDATE AS s, o.ZENDDATE AS e, src.ZDEVICEID AS dev,
              ${hasPeer ? peerName : "NULL"} AS peer
       FROM ZOBJECT o
       LEFT JOIN ZSOURCE src ON o.ZSOURCE = src.Z_PK
       ${hasPeer ? "LEFT JOIN ZSYNCPEER p ON src.ZDEVICEID = p.ZDEVICEID" : ""}
       WHERE o.ZSTREAMNAME = '/app/usage' AND o.ZSTARTDATE >= ${since} AND o.ZVALUESTRING IS NOT NULL`,
    );

    let web: { bundle: string; domain: string; s: number; e: number; dev: string | null }[] = [];
    if (t.has("ZSTRUCTUREDMETADATA")) {
      const domainCol = [...columns(db, "ZSTRUCTUREDMETADATA")].find((c) => c.includes("WEBDOMAIN"));
      if (domainCol) {
        web = query(
          db,
          `SELECT o.ZVALUESTRING AS bundle, m.${domainCol} AS domain, o.ZSTARTDATE AS s, o.ZENDDATE AS e, src.ZDEVICEID AS dev
           FROM ZOBJECT o
           JOIN ZSTRUCTUREDMETADATA m ON o.ZSTRUCTUREDMETADATA = m.Z_PK
           LEFT JOIN ZSOURCE src ON o.ZSOURCE = src.Z_PK
           WHERE o.ZSTREAMNAME = '/app/webUsage' AND o.ZSTARTDATE >= ${since} AND m.${domainCol} IS NOT NULL`,
        );
      }
    }

    const devices = new Map<string, DeviceInfo>();
    const bundlesByDev = new Map<string, Set<string>>();
    const peerNames = new Map<string, string | null>();
    for (const a of apps) {
      if (!a.dev) continue;
      peerNames.set(a.dev, a.peer);
      const set = bundlesByDev.get(a.dev) ?? new Set<string>();
      set.add(a.bundle);
      bundlesByDev.set(a.dev, set);
    }
    const resolve = (dev: string | null): DeviceInfo | undefined => {
      if (!dev) return ctx.local;
      let d = devices.get(dev);
      if (!d) {
        const platform = guessPlatform(peerNames.get(dev) ?? null, bundlesByDev.get(dev) ?? []);
        const name = peerNames.get(dev) || (platform === "iphone" ? "iPhone" : `端末 ${dev.slice(0, 6)}`);
        if (ctx.excludeDevices.includes(name)) return undefined;
        d = { id: `kc:${dev}`, name, platform };
        devices.set(dev, d);
      }
      return d;
    };

    const acc = new UsageAccumulator<"knowledgec">();
    for (const a of apps) {
      const d = resolve(a.dev);
      if (d) acc.addInterval(d.id, "app", a.bundle, "knowledgec", coreDataToMs(a.s), coreDataToMs(a.e));
    }
    for (const w of web) {
      const d = resolve(w.dev);
      const domain = w.domain.replace(/^www\./, "").toLowerCase();
      if (d) acc.addInterval(d.id, "web", domain, "knowledgec", coreDataToMs(w.s), coreDataToMs(w.e));
    }
    const rows = acc.entries().map((e) => ({ ...e, type: e.type as "app" | "web" }));
    return {
      source: "knowledgec",
      rows,
      devices: [ctx.local, ...devices.values()],
      pickups: [],
      notes: [`knowledgeC: アプリ ${apps.length} 件 / Web ${web.length} 件`],
    };
  });
}
