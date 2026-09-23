import type { CategoryId } from "./categories";

export type ItemType = "app" | "web";
export type Platform = "mac" | "iphone" | "ipad" | "unknown";
export type UsageSource = "screentime" | "knowledgec" | "chrome";

export interface DeviceInfo {
  id: string;
  name: string;
  platform: Platform;
}

/** 1時間単位の使用時間。date/hour は Mac のローカル時刻。 */
export interface UsageRow {
  deviceId: string;
  date: string; // YYYY-MM-DD
  hour: number; // 0-23
  type: ItemType;
  key: string; // bundle id またはドメイン
  seconds: number;
  source: UsageSource;
}

export interface PickupRow {
  deviceId: string;
  date: string;
  pickups: number;
  notifications: number;
}

/** 収集スクリプト → Worker の送信単位（1日ぶん）。 */
export interface IngestPayload {
  version: 1;
  timezone: string;
  /** 収集した時点の Mac のローカル日付（前日分のデータが揃ったかの判定に使う） */
  collectedOn: string;
  date: string;
  /** このリクエストで「完全に取り直した」ソース。ここに含まれるソースの当日データは置き換えられる。 */
  sources: UsageSource[];
  devices: DeviceInfo[];
  rows: UsageRow[];
  pickups: PickupRow[];
  /** bundle id → アプリ表示名（Mac 上で解決できたもの） */
  names: { type: ItemType; key: string; name: string }[];
}

export interface ItemMeta {
  type: ItemType;
  key: string;
  name: string | null;
  category: CategoryId | null;
  categorySource: "ai" | "manual" | null;
}

export type CategoryTotals = Partial<Record<CategoryId, number>>;

export interface RankedItem {
  type: ItemType;
  key: string;
  name: string;
  category: CategoryId | null;
  seconds: number;
}

export interface DaySummary {
  date: string;
  total: number;
  byCategory: CategoryTotals;
}

export interface DayDetail extends DaySummary {
  hourly: number[]; // 24要素
  apps: RankedItem[];
  domains: RankedItem[];
  pickups: number | null;
  notifications: number | null;
}

export type GoalTarget = { kind: "total" } | { kind: "category"; category: CategoryId };

export interface Goal {
  id: number;
  target: GoalTarget;
  comparator: "max" | "min";
  minutes: number;
}

export interface GoalResult extends Goal {
  label: string;
  actualMinutes: number;
  achieved: boolean;
}

export interface DailyReport {
  date: string;
  status: "ready" | "generating" | "error";
  headline: string | null;
  summary: string | null;
  highlights: string[];
  suggestions: string[];
  error: string | null;
  createdAt: string;
}

export interface OverviewResponse {
  date: string;
  device: string;
  devices: DeviceInfo[];
  availableRange: { min: string | null; max: string | null };
  lastIngestAt: string | null;
  today: DayDetail;
  previousDay: DaySummary;
  lastWeekAverage: DaySummary;
  trend: DaySummary[];
  heatmap: { date: string; hour: number; seconds: number }[];
  goals: GoalResult[];
  report: DailyReport | null;
}
