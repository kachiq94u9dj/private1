import { isValidDate } from "../shared/time";
import type { IngestPayload, ItemType, Platform, UsageSource } from "../shared/types";
import type { Env } from "./env";

const SOURCES: UsageSource[] = ["screentime", "knowledgec", "chrome"];
const PLATFORMS: Platform[] = ["mac", "iphone", "ipad", "unknown"];
const ITEM_TYPES: ItemType[] = ["app", "web"];
const CHUNK = 1000;

export class ValidationError extends Error {}

function str(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new ValidationError(`${field} が不正です`);
  }
  return value;
}

function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${field} が不正です`);
  }
  return Math.round(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw new ValidationError(`${field} が不正です`);
  return value as T;
}

/** 受信データを検証し、型の保証された payload を返す */
export function parsePayload(body: unknown): IngestPayload {
  if (typeof body !== "object" || body === null) throw new ValidationError("JSON オブジェクトではありません");
  const b = body as Record<string, unknown>;
  if (b.version !== 1) throw new ValidationError("version が未対応です");
  if (!isValidDate(b.date)) throw new ValidationError("date が不正です");
  if (!isValidDate(b.collectedOn)) throw new ValidationError("collectedOn が不正です");
  const date = b.date;
  const arr = (v: unknown, field: string) => {
    if (!Array.isArray(v)) throw new ValidationError(`${field} が配列ではありません`);
    return v as Record<string, unknown>[];
  };

  const devices = arr(b.devices, "devices").map((d) => ({
    id: str(d.id, "devices.id", 128),
    name: str(d.name, "devices.name", 200),
    platform: oneOf(d.platform, PLATFORMS, "devices.platform"),
  }));
  const deviceIds = new Set(devices.map((d) => d.id));

  const rows = arr(b.rows, "rows").map((r) => {
    const deviceId = str(r.deviceId, "rows.deviceId", 128);
    if (!deviceIds.has(deviceId)) throw new ValidationError("rows.deviceId が devices にありません");
    if (r.date !== date) throw new ValidationError("rows.date が payload の date と一致しません");
    return {
      deviceId,
      date,
      hour: int(r.hour, "rows.hour", 0, 23),
      type: oneOf(r.type, ITEM_TYPES, "rows.type"),
      key: str(r.key, "rows.key", 300),
      seconds: int(r.seconds, "rows.seconds", 0, 3600),
      source: oneOf(r.source, SOURCES, "rows.source"),
    };
  });

  const pickups = arr(b.pickups ?? [], "pickups").map((p) => {
    const deviceId = str(p.deviceId, "pickups.deviceId", 128);
    if (!deviceIds.has(deviceId)) throw new ValidationError("pickups.deviceId が devices にありません");
    return {
      deviceId,
      date,
      pickups: int(p.pickups, "pickups.pickups", 0, 100000),
      notifications: int(p.notifications, "pickups.notifications", 0, 100000),
    };
  });

  const names = arr(b.names ?? [], "names").map((n) => ({
    type: oneOf(n.type, ITEM_TYPES, "names.type"),
    key: str(n.key, "names.key", 300),
    name: str(n.name, "names.name", 200),
  }));

  return {
    version: 1,
    timezone: typeof b.timezone === "string" ? b.timezone.slice(0, 64) : "",
    collectedOn: b.collectedOn,
    date,
    sources: arr(b.sources, "sources").map((s) => oneOf(s, SOURCES, "sources")),
    devices,
    rows,
    pickups,
    names,
  };
}

/**
 * 1日ぶんのデータを保存する。payload.sources に含まれるソースの当日データは
 * いったん削除してから入れ直す（再収集で値が減った場合も正しく反映するため）。
 */
export async function savePayload(env: Env, p: IngestPayload): Promise<number> {
  const db = env.DB;
  const stmts: D1PreparedStatement[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO devices (id, name, platform) SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?1)
         WHERE true ON CONFLICT (id) DO UPDATE SET name = excluded.name, platform = excluded.platform, updated_at = datetime('now')`,
      )
      .bind(JSON.stringify(p.devices.map((d) => [d.id, d.name, d.platform]))),
  );

  if (p.sources.length > 0 && p.devices.length > 0) {
    stmts.push(
      db
        .prepare(
          `DELETE FROM usage_hourly WHERE date = ?1
             AND source IN (SELECT value FROM json_each(?2))
             AND device_id IN (SELECT value FROM json_each(?3))`,
        )
        .bind(p.date, JSON.stringify(p.sources), JSON.stringify(p.devices.map((d) => d.id))),
    );
  }

  const collected = new Set(p.sources);
  const rows = p.rows.filter((r) => collected.has(r.source) && r.seconds > 0);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => [r.deviceId, r.date, r.hour, r.type, r.key, r.source, r.seconds]);
    stmts.push(
      db
        .prepare(
          `INSERT INTO usage_hourly (device_id, date, hour, item_type, item_key, source, seconds)
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
                  json_extract(value, '$[3]'), json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]')
           FROM json_each(?1) WHERE true
           ON CONFLICT DO UPDATE SET seconds = usage_hourly.seconds + excluded.seconds`,
        )
        .bind(JSON.stringify(chunk)),
    );
  }

  const itemKeys = [...new Set(rows.map((r) => `${r.type}\u0000${r.key}`))].map((k) => k.split("\u0000"));
  for (let i = 0; i < itemKeys.length; i += CHUNK) {
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO items (item_type, item_key)
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?1)`,
        )
        .bind(JSON.stringify(itemKeys.slice(i, i + CHUNK))),
    );
  }

  if (p.names.length > 0) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO items (item_type, item_key, name)
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]') FROM json_each(?1) WHERE true
           ON CONFLICT (item_type, item_key) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`,
        )
        .bind(JSON.stringify(p.names.map((n) => [n.type, n.key, n.name]))),
    );
  }

  if (p.pickups.length > 0) {
    stmts.push(
      db
        .prepare(
          `INSERT INTO device_daily (device_id, date, pickups, notifications)
           SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]')
           FROM json_each(?1) WHERE true
           ON CONFLICT (device_id, date) DO UPDATE SET pickups = excluded.pickups, notifications = excluded.notifications`,
        )
        .bind(JSON.stringify(p.pickups.map((x) => [x.deviceId, x.date, x.pickups, x.notifications]))),
    );
  }

  stmts.push(
    db
      .prepare(`INSERT INTO ingest_runs (payload_date, local_date, row_count) VALUES (?1, ?2, ?3)`)
      .bind(p.date, p.collectedOn, rows.length),
  );

  await db.batch(stmts);
  return rows.length;
}
