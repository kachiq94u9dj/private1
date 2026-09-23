import { BROWSER_BUNDLE_IDS, categoryLabel, type CategoryId } from "./categories";
import type {
  CategoryTotals,
  DayDetail,
  DaySummary,
  Goal,
  GoalResult,
  ItemMeta,
  ItemType,
  RankedItem,
  UsageRow,
} from "./types";

export type AnalysisRow = Omit<UsageRow, "deviceId"> & { deviceId: string };

export type MetaLookup = (type: ItemType, key: string) => ItemMeta | undefined;

/**
 * スクリーンタイム(RMAdminStore)と knowledgeC の両方に同じ端末・日のデータがある場合、
 * 二重計上を避けるため screentime を優先する。chrome は別系統なので常に残す。
 */
export function dedupeSources(rows: AnalysisRow[]): AnalysisRow[] {
  const hasScreenTime = new Set<string>();
  for (const r of rows) {
    if (r.source === "screentime") hasScreenTime.add(`${r.deviceId}|${r.date}|${r.type}`);
  }
  return rows.filter(
    (r) => r.source !== "knowledgec" || !hasScreenTime.has(`${r.deviceId}|${r.date}|${r.type}`),
  );
}

interface HourAttribution {
  total: number;
  byCategory: Map<CategoryId, number>;
  apps: Map<string, number>;
  domains: Map<string, number>;
}

/**
 * 1端末・1時間ぶんの行から、合計時間とカテゴリ内訳を計算する。
 * ブラウザのアプリ時間はドメイン別の時間で内訳に置き換える（ドメインの合計がブラウザ時間を
 * 超える場合はブラウザ時間に収まるよう按分し、足りない分は「その他」に入れる）。
 */
export function attributeHour(rows: AnalysisRow[], meta: MetaLookup): HourAttribution {
  const apps = new Map<string, number>();
  const domains = new Map<string, number>();
  for (const r of rows) {
    const target = r.type === "app" ? apps : domains;
    target.set(r.key, (target.get(r.key) ?? 0) + r.seconds);
  }

  let browserSeconds = 0;
  let appTotal = 0;
  for (const [key, sec] of apps) {
    appTotal += sec;
    if (BROWSER_BUNDLE_IDS.has(key)) browserSeconds += sec;
  }
  let webTotal = 0;
  for (const sec of domains.values()) webTotal += sec;

  // アプリの記録がない時間帯（スクリーンタイム未取得など）は Web の時間をそのまま使う
  const scale = apps.size === 0 ? 1 : webTotal > browserSeconds ? browserSeconds / Math.max(webTotal, 1) : 1;

  const byCategory = new Map<CategoryId, number>();
  const add = (cat: CategoryId, sec: number) => {
    if (sec > 0) byCategory.set(cat, (byCategory.get(cat) ?? 0) + sec);
  };

  for (const [key, sec] of apps) {
    if (BROWSER_BUNDLE_IDS.has(key)) continue;
    add(meta("app", key)?.category ?? "other", sec);
  }
  const scaledDomains = new Map<string, number>();
  let attributedWeb = 0;
  for (const [key, sec] of domains) {
    const scaled = sec * scale;
    scaledDomains.set(key, scaled);
    attributedWeb += scaled;
    add(meta("web", key)?.category ?? "other", scaled);
  }
  if (apps.size > 0) add("other", browserSeconds - attributedWeb);

  const total = apps.size === 0 ? webTotal : appTotal;
  return { total, byCategory, apps, domains: scaledDomains };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function toTotals(map: Map<CategoryId, number>): CategoryTotals {
  const out: CategoryTotals = {};
  for (const [k, v] of map) out[k] = Math.round(v);
  return out;
}

function rank(map: Map<string, number>, type: ItemType, meta: MetaLookup, limit: number): RankedItem[] {
  return [...map.entries()]
    .filter(([, sec]) => sec >= 30)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, sec]) => {
      const m = meta(type, key);
      return { type, key, name: m?.name || key, category: m?.category ?? null, seconds: Math.round(sec) };
    });
}

/** 行データ（複数日・複数端末可）を日ごとに集計する */
export function analyze(rawRows: AnalysisRow[], meta: MetaLookup) {
  const rows = dedupeSources(rawRows);
  const days = new Map<
    string,
    { total: number; byCategory: Map<CategoryId, number>; hourly: number[]; apps: Map<string, number>; domains: Map<string, number> }
  >();

  for (const [, hourRows] of groupBy(rows, (r) => `${r.deviceId}|${r.date}|${r.hour}`)) {
    const { date, hour } = hourRows[0];
    const a = attributeHour(hourRows, meta);
    let day = days.get(date);
    if (!day) {
      day = { total: 0, byCategory: new Map(), hourly: Array(24).fill(0), apps: new Map(), domains: new Map() };
      days.set(date, day);
    }
    day.total += a.total;
    day.hourly[hour] += a.total;
    for (const [k, v] of a.byCategory) day.byCategory.set(k, (day.byCategory.get(k) ?? 0) + v);
    for (const [k, v] of a.apps) day.apps.set(k, (day.apps.get(k) ?? 0) + v);
    for (const [k, v] of a.domains) day.domains.set(k, (day.domains.get(k) ?? 0) + v);
  }

  return {
    summary(date: string): DaySummary {
      const d = days.get(date);
      return { date, total: Math.round(d?.total ?? 0), byCategory: d ? toTotals(d.byCategory) : {} };
    },
    detail(date: string, limit = 15): Omit<DayDetail, "pickups" | "notifications"> {
      const d = days.get(date);
      return {
        ...this.summary(date),
        hourly: (d?.hourly ?? Array(24).fill(0)).map((v) => Math.round(v)),
        apps: d ? rank(d.apps, "app", meta, limit) : [],
        domains: d ? rank(d.domains, "web", meta, limit) : [],
      };
    },
    hourly(date: string): number[] {
      return (days.get(date)?.hourly ?? Array(24).fill(0)).map((v) => Math.round(v));
    },
  };
}

export function averageSummary(summaries: DaySummary[], label: string): DaySummary {
  const withData = summaries.filter((s) => s.total > 0);
  const n = Math.max(withData.length, 1);
  const byCategory: CategoryTotals = {};
  let total = 0;
  for (const s of withData) {
    total += s.total;
    for (const [k, v] of Object.entries(s.byCategory) as [CategoryId, number][]) {
      byCategory[k] = (byCategory[k] ?? 0) + v;
    }
  }
  for (const k of Object.keys(byCategory) as CategoryId[]) byCategory[k] = Math.round(byCategory[k]! / n);
  return { date: label, total: Math.round(total / n), byCategory };
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
