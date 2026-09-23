// macOS のスクリーンタイム本体のデータベース (RMAdminStore) を読む。
// 「デバイス間で共有」がオンなら iPhone など他の端末のデータもここに同期される。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeviceInfo, PickupRow } from "../../src/shared/types.ts";
import { guessPlatform, localDate, localDateHour, UsageAccumulator } from "../bucket.ts";
import { columns, coreDataToMs, msToCoreData, query, tables, withDbCopy } from "../sqlite.ts";
import type { SourceContext, SourceResult } from "./types.ts";

export function screenTimeStorePaths(): string[] {
  let userDir = "";
  try {
    userDir = execFileSync("getconf", ["DARWIN_USER_DIR"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return [];
  }
  const store = join(userDir, "com.apple.ScreenTimeAgent", "Store");
  return ["RMAdminStore-Local.sqlite", "RMAdminStore-Cloud.sqlite"].map((f) => join(store, f)).filter((p) => existsSync(p));
}

const REQUIRED = ["ZUSAGETIMEDITEM", "ZUSAGECATEGORY", "ZUSAGEBLOCK", "ZUSAGE"];

interface RawRow {
  start: number;
  bundle: string | null;
  domain: string | null;
  secs: number;
  device_ident: string | null;
  device_name: string | null;
}

function readStore(path: string, sinceMs: number): { rows: RawRow[]; pickups: { start: number; device_ident: string | null; pickups: number; notifications: number }[] } {
  return withDbCopy(path, (db) => {
    const t = tables(db);
    const missing = REQUIRED.filter((name) => !t.has(name));
    if (missing.length) throw new Error(`想定したテーブルがありません: ${missing.join(", ")}`);

    const itemCols = columns(db, "ZUSAGETIMEDITEM");
    const hasDevice = t.has("ZCOREDEVICE") && columns(db, "ZUSAGE").has("ZDEVICE");
    const deviceCols = hasDevice ? columns(db, "ZCOREDEVICE") : new Set<string>();
    const since = Math.floor(msToCoreData(sinceMs));

    const rows = query<RawRow>(
      db,
      `SELECT b.ZSTARTDATE AS start,
              t.ZBUNDLEIDENTIFIER AS bundle,
              ${itemCols.has("ZDOMAIN") ? "t.ZDOMAIN" : "NULL"} AS domain,
              t.ZTOTALTIMEINSECONDS AS secs,
              ${hasDevice && deviceCols.has("ZIDENTIFIER") ? "d.ZIDENTIFIER" : "NULL"} AS device_ident,
              ${hasDevice && deviceCols.has("ZNAME") ? "d.ZNAME" : "NULL"} AS device_name
       FROM ZUSAGETIMEDITEM t
       JOIN ZUSAGECATEGORY c ON t.ZCATEGORY = c.Z_PK
       JOIN ZUSAGEBLOCK b ON c.ZBLOCK = b.Z_PK
       JOIN ZUSAGE u ON b.ZUSAGE = u.Z_PK
       ${hasDevice ? "LEFT JOIN ZCOREDEVICE d ON u.ZDEVICE = d.Z_PK" : ""}
       WHERE b.ZSTARTDATE >= ${since} AND t.ZTOTALTIMEINSECONDS > 0`,
    );

    let pickups: { start: number; device_ident: string | null; pickups: number; notifications: number }[] = [];
    if (t.has("ZUSAGECOUNTEDITEM")) {
      const counted = columns(db, "ZUSAGECOUNTEDITEM");
      const blockCols = columns(db, "ZUSAGEBLOCK");
      if (counted.has("ZBLOCK") && counted.has("ZNUMBEROFPICKUPS")) {
        pickups = query(
          db,
          `SELECT b.ZSTARTDATE AS start,
                  ${hasDevice && deviceCols.has("ZIDENTIFIER") ? "d.ZIDENTIFIER" : "NULL"} AS device_ident,
                  COALESCE(SUM(ci.ZNUMBEROFPICKUPS), 0)
                    + ${blockCols.has("ZNUMBEROFPICKUPSWITHOUTAPPLICATIONUSAGE") ? "COALESCE(MAX(b.ZNUMBEROFPICKUPSWITHOUTAPPLICATIONUSAGE), 0)" : "0"} AS pickups,
                  ${counted.has("ZNUMBEROFNOTIFICATIONS") ? "COALESCE(SUM(ci.ZNUMBEROFNOTIFICATIONS), 0)" : "0"} AS notifications
           FROM ZUSAGEBLOCK b
           JOIN ZUSAGE u ON b.ZUSAGE = u.Z_PK
           ${hasDevice ? "LEFT JOIN ZCOREDEVICE d ON u.ZDEVICE = d.Z_PK" : ""}
           LEFT JOIN ZUSAGECOUNTEDITEM ci ON ci.ZBLOCK = b.Z_PK
           WHERE b.ZSTARTDATE >= ${since}
           GROUP BY b.Z_PK`,
        );
      }
    }
    return { rows, pickups };
  });
}

export function collectScreenTime(ctx: SourceContext, computerName: string, paths = screenTimeStorePaths()): SourceResult {
  const notes: string[] = [];
  if (paths.length === 0) {
    return { source: "screentime", rows: [], devices: [], pickups: [], notes: ["RMAdminStore が見つかりませんでした"] };
  }

  const raw: RawRow[] = [];
  const rawPickups: { start: number; device_ident: string | null; pickups: number; notifications: number }[] = [];
  for (const path of paths) {
    const r = readStore(path, ctx.sinceMs);
    notes.push(`${path.split("/").pop()}: ${r.rows.length} 行`);
    raw.push(...r.rows);
    rawPickups.push(...r.pickups);
  }

  // 端末を識別し、どれがこの Mac かを決める
  const deviceBundles = new Map<string, { name: string | null; bundles: Set<string> }>();
  for (const r of raw) {
    const ident = r.device_ident ?? "local";
    const entry = deviceBundles.get(ident) ?? { name: r.device_name, bundles: new Set<string>() };
    if (r.bundle) entry.bundles.add(r.bundle);
    deviceBundles.set(ident, entry);
  }
  const identified = [...deviceBundles.entries()].map(([ident, v]) => ({
    ident,
    name: v.name,
    platform: guessPlatform(v.name, v.bundles),
  }));
  const localIdent =
    identified.find((d) => d.ident === "local")?.ident ??
    identified.find((d) => d.name && d.name === computerName)?.ident ??
    (identified.filter((d) => d.platform === "mac").length === 1 ? identified.find((d) => d.platform === "mac")!.ident : undefined);

  const deviceMap = new Map<string, DeviceInfo>();
  for (const d of identified) {
    if (d.ident === localIdent) {
      deviceMap.set(d.ident, ctx.local);
      continue;
    }
    const name = d.name || (d.platform === "iphone" ? "iPhone" : d.platform === "ipad" ? "iPad" : `端末 ${d.ident.slice(0, 6)}`);
    if (ctx.excludeDevices.includes(name)) continue;
    deviceMap.set(d.ident, { id: `st:${d.ident}`, name, platform: d.platform });
  }

  // RMAdminStore-Local と -Cloud に同じブロックが入っていることがあるため、同一キーは最大値を採用
  const best = new Map<string, number>();
  for (const r of raw) {
    const device = deviceMap.get(r.device_ident ?? "local");
    if (!device) continue;
    const type = r.domain ? "web" : "app";
    const key = r.domain ? r.domain.replace(/^www\./, "").toLowerCase() : r.bundle;
    if (!key) continue;
    const k = [device.id, r.start, type, key].join("\u0000");
    best.set(k, Math.max(best.get(k) ?? 0, r.secs));
  }

  const acc = new UsageAccumulator<"screentime">();
  for (const [k, secs] of best) {
    const [deviceId, start, type, key] = k.split("\u0000");
    const { date, hour } = localDateHour(coreDataToMs(Number(start)));
    acc.add([deviceId, date, hour, type, key, "screentime"], Math.min(secs, 3600));
  }

  const pickupMap = new Map<string, PickupRow>();
  const seenBlocks = new Set<string>();
  for (const p of rawPickups) {
    const device = deviceMap.get(p.device_ident ?? "local");
    if (!device) continue;
    const blockKey = `${device.id}|${p.start}`;
    if (seenBlocks.has(blockKey)) continue;
    seenBlocks.add(blockKey);
    const date = localDate(coreDataToMs(p.start));
    const row = pickupMap.get(`${device.id}|${date}`) ?? { deviceId: device.id, date, pickups: 0, notifications: 0 };
    row.pickups += p.pickups;
    row.notifications += p.notifications;
    pickupMap.set(`${device.id}|${date}`, row);
  }

  return {
    source: "screentime",
    rows: acc.entries().map((e) => ({ ...e, type: e.type as "app" | "web" })),
    devices: [...deviceMap.values()],
    pickups: [...pickupMap.values()].filter((p) => p.pickups > 0 || p.notifications > 0),
    notes,
  };
}
