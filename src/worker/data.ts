import { analyze, averageSummary, type AnalysisRow, type MetaLookup } from "../shared/analysis";
import { categoryLabel, isCategoryId } from "../shared/categories";
import { addDays, dateRange } from "../shared/time";
import type {
  DailyReport,
  DeviceInfo,
  Goal,
  GoalResult,
  ItemMeta,
  ItemType,
  OverviewResponse,
  Platform,
  UsageSource,
} from "../shared/types";
import type { Env } from "./env";

export async function loadItemMeta(env: Env): Promise<MetaLookup> {
  const { results } = await env.DB.prepare(
    `SELECT item_type, item_key, name, category, category_source FROM items`,
  ).all<{ item_type: ItemType; item_key: string; name: string | null; category: string | null; category_source: string | null }>();
  const map = new Map<string, ItemMeta>();
  for (const r of results) {
    map.set(`${r.item_type}|${r.item_key}`, {
      type: r.item_type,
      key: r.item_key,
      name: r.name,
      category: isCategoryId(r.category) ? r.category : null,
      categorySource: r.category_source === "manual" || r.category_source === "ai" ? r.category_source : null,
    });
  }
  return (type, key) => map.get(`${type}|${key}`);
}

export async function loadDevices(env: Env): Promise<DeviceInfo[]> {
  const { results } = await env.DB.prepare(`SELECT id, name, platform FROM devices ORDER BY platform, name`).all<{
    id: string;
    name: string;
    platform: Platform;
  }>();
  return results;
}

async function loadRows(env: Env, from: string, to: string, device: string): Promise<AnalysisRow[]> {
  const filter = device === "all" ? "" : "AND device_id = ?3";
  const stmt = env.DB.prepare(
    `SELECT device_id, date, hour, item_type, item_key, source, seconds FROM usage_hourly
     WHERE date BETWEEN ?1 AND ?2 ${filter}`,
  );
  const bound = device === "all" ? stmt.bind(from, to) : stmt.bind(from, to, device);
  const { results } = await bound.all<{
    device_id: string;
    date: string;
    hour: number;
    item_type: ItemType;
    item_key: string;
    source: UsageSource;
    seconds: number;
  }>();
  return results.map((r) => ({
    deviceId: r.device_id,
    date: r.date,
    hour: r.hour,
    type: r.item_type,
    key: r.item_key,
    source: r.source,
    seconds: r.seconds,
  }));
}

export async function loadGoals(env: Env): Promise<Goal[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, target_kind, target_category, comparator, minutes FROM goals ORDER BY id`,
  ).all<{ id: number; target_kind: string; target_category: string | null; comparator: "max" | "min"; minutes: number }>();
  return results.map((g) => ({
    id: g.id,
    target:
      g.target_kind === "category" && isCategoryId(g.target_category)
        ? { kind: "category", category: g.target_category }
        : { kind: "total" },
    comparator: g.comparator,
    minutes: g.minutes,
  }));
}

export async function loadReport(env: Env, date: string): Promise<DailyReport | null> {
  const r = await env.DB.prepare(`SELECT date, status, content, error, created_at FROM reports WHERE date = ?1`)
    .bind(date)
    .first<{ date: string; status: DailyReport["status"]; content: string | null; error: string | null; created_at: string }>();
  if (!r) return null;
  let parsed: { headline?: string; summary?: string; highlights?: string[]; suggestions?: string[] } = {};
  try {
    parsed = r.content ? JSON.parse(r.content) : {};
  } catch {
    parsed = {};
  }
  return {
    date: r.date,
    status: r.status,
    headline: parsed.headline ?? null,
    summary: parsed.summary ?? null,
    highlights: parsed.highlights ?? [],
    suggestions: parsed.suggestions ?? [],
    error: r.error,
    createdAt: r.created_at,
  };
}

export function evaluateGoals(goals: Goal[], total: number, byCategory: Partial<Record<string, number>>): GoalResult[] {
  return goals.map((g) => {
    const seconds = g.target.kind === "total" ? total : byCategory[g.target.category] ?? 0;
    const actualMinutes = Math.round(seconds / 60);
    const label = g.target.kind === "total" ? "合計" : categoryLabel(g.target.category);
    const achieved = g.comparator === "max" ? actualMinutes <= g.minutes : actualMinutes >= g.minutes;
    return { ...g, label, actualMinutes, achieved };
  });
}

/** ダッシュボード / AI レポート共通の集計 */
export async function buildOverview(env: Env, date: string, device: string, days = 28): Promise<OverviewResponse> {
  const trendFrom = addDays(date, -(Math.max(days, 8) - 1));
  const [rows, meta, devices, goals, report, range, lastIngest, pickupRow] = await Promise.all([
    loadRows(env, trendFrom, date, device),
    loadItemMeta(env),
    loadDevices(env),
    loadGoals(env),
    loadReport(env, date),
    env.DB.prepare(`SELECT MIN(date) AS min, MAX(date) AS max FROM usage_hourly`).first<{ min: string | null; max: string | null }>(),
    env.DB.prepare(`SELECT MAX(received_at) AS at FROM ingest_runs`).first<{ at: string | null }>(),
    env.DB.prepare(
      `SELECT SUM(pickups) AS pickups, SUM(notifications) AS notifications, COUNT(*) AS n FROM device_daily
       WHERE date = ?1 ${device === "all" ? "" : "AND device_id = ?2"}`,
    )
      .bind(...(device === "all" ? [date] : [date, device]))
      .first<{ pickups: number | null; notifications: number | null; n: number }>(),
  ]);

  const a = analyze(rows, meta);
  const detail = a.detail(date);
  const trendDates = dateRange(addDays(date, -(days - 1)), date);
  const trend = trendDates.map((d) => a.summary(d));
  const lastWeek = dateRange(addDays(date, -7), addDays(date, -1)).map((d) => a.summary(d));

  const heatmap = trendDates.flatMap((d) => a.hourly(d).map((seconds, hour) => ({ date: d, hour, seconds })));

  return {
    date,
    device,
    devices,
    availableRange: { min: range?.min ?? null, max: range?.max ?? null },
    lastIngestAt: lastIngest?.at ?? null,
    today: {
      ...detail,
      pickups: pickupRow && pickupRow.n > 0 ? pickupRow.pickups : null,
      notifications: pickupRow && pickupRow.n > 0 ? pickupRow.notifications : null,
    },
    previousDay: a.summary(addDays(date, -1)),
    lastWeekAverage: averageSummary(lastWeek, "last7"),
    trend,
    heatmap,
    goals: evaluateGoals(goals, detail.total, detail.byCategory),
    report,
  };
}
