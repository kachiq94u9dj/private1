// デモ版（単体 HTML）用: API の代わりにブラウザ内のサンプルデータで同じ応答を返す。
import { analyze, averageSummary, evaluateGoals, type MetaLookup } from "../shared/analysis";
import { BROWSER_BUNDLE_IDS, categoryLabel, isCategoryId } from "../shared/categories";
import { generateDemoData } from "../shared/demoData";
import { addDays, dateRange } from "../shared/time";
import type { DailyReport, Goal, ItemMeta, OverviewResponse } from "../shared/types";
import type { GoalRow, ItemRow } from "./api";
import { hm } from "./format";

const now = new Date();
const today = now.toLocaleDateString("sv-SE");
const data = generateDemoData(today, now.getHours());

const items = new Map<string, ItemMeta>(
  data.items.map((i) => [
    `${i.type}|${i.key}`,
    {
      type: i.type,
      key: i.key,
      name: i.name,
      // 一部を未分類にしておき、「AI で分類」を試せるようにする
      category: i.key === "zenn.dev" || i.key === "com.figma.Desktop" ? null : isCategoryId(i.category) ? i.category : null,
      categorySource: i.category ? "ai" : null,
    },
  ]),
);
const presetCategory = new Map(data.items.map((i) => [`${i.type}|${i.key}`, i.category]));

let goals: Goal[] = [
  { id: 1, target: { kind: "category", category: "sns" }, comparator: "max", minutes: 45 },
  { id: 2, target: { kind: "category", category: "dev" }, comparator: "min", minutes: 240 },
];
let nextGoalId = 3;
const reports = new Map<string, DailyReport>();

const meta: MetaLookup = (type, key) => items.get(`${type}|${key}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sampleReport(o: OverviewResponse): DailyReport {
  const t = o.today;
  const cats = (Object.entries(t.byCategory) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const top = cats[0];
  const peak = t.hourly.indexOf(Math.max(...t.hourly));
  const late = t.hourly.slice(0, 5).reduce((s, v) => s + v, 0) + t.hourly[23];
  const diff = t.total - o.lastWeekAverage.total;
  const sns = t.byCategory.sns ?? 0;
  const missed = o.goals.filter((g) => !g.achieved);
  return {
    date: o.date,
    status: "ready",
    headline: top ? `${categoryLabel(top[0])}が中心の一日` : "記録の少ない一日",
    summary: `合計は${hm(t.total)}で、直近7日平均より${hm(Math.abs(diff))}${diff >= 0 ? "長め" : "短め"}でした。いちばん多かったのは${
      top ? `${categoryLabel(top[0])}（${hm(top[1])}）` : "—"
    }、最も使ったアプリは${t.apps[0]?.name ?? "—"}です。`,
    highlights: [
      `いちばん使っていたのは${peak}時台です。`,
      late > 0 ? `23時〜翌5時の深夜帯に${hm(late)}使っていました。` : "深夜帯の利用はありませんでした。",
      `SNS は${hm(sns)}（7日平均 ${hm(o.lastWeekAverage.byCategory.sns ?? 0)}）。`,
    ],
    suggestions: missed.length
      ? missed.map((g) => `「${g.label} ${g.comparator === "max" ? `${g.minutes}分以内` : `${g.minutes}分以上`}」は未達成（${g.actualMinutes}分）。時間帯を決めて取り組んでみましょう。`)
      : ["目標はすべて達成しています。この調子を保ちましょう。"],
    error: null,
    createdAt: new Date().toISOString(),
  };
}

function overview(date: string | null, device: string): OverviewResponse {
  const d = date ?? today;
  const days = 28;
  const rows = data.rows.filter((r) => device === "all" || r.deviceId === device);
  const a = analyze(rows, meta);
  const detail = a.detail(d);
  const trendDates = dateRange(addDays(d, -(days - 1)), d);
  const pick = data.pickups.filter((p) => p.date === d && (device === "all" || p.deviceId === device));
  const base: OverviewResponse = {
    date: d,
    device,
    devices: data.devices,
    availableRange: { min: data.rows[0]?.date ?? null, max: today },
    lastIngestAt: `${today} 00:00:00`,
    today: {
      ...detail,
      pickups: pick.length ? pick.reduce((s, p) => s + p.pickups, 0) : null,
      notifications: pick.length ? pick.reduce((s, p) => s + p.notifications, 0) : null,
    },
    previousDay: a.summary(addDays(d, -1)),
    lastWeekAverage: averageSummary(dateRange(addDays(d, -7), addDays(d, -1)).map((x) => a.summary(x)), "last7"),
    trend: trendDates.map((x) => a.summary(x)),
    heatmap: trendDates.flatMap((x) => a.hourly(x).map((seconds, hour) => ({ date: x, hour, seconds }))),
    goals: evaluateGoals(goals, detail.total, detail.byCategory),
    report: null,
  };
  // 過去の日には振り返りがある状態にしておく
  if (!reports.has(d) && d < today && detail.total > 0) reports.set(d, sampleReport(overview_all(d)));
  base.report = reports.get(d) ?? null;
  return base;
}

function overview_all(date: string): OverviewResponse {
  const a = analyze(data.rows, meta);
  const detail = a.detail(date);
  return {
    date,
    device: "all",
    devices: data.devices,
    availableRange: { min: null, max: null },
    lastIngestAt: null,
    today: { ...detail, pickups: null, notifications: null },
    previousDay: a.summary(addDays(date, -1)),
    lastWeekAverage: averageSummary(dateRange(addDays(date, -7), addDays(date, -1)).map((x) => a.summary(x)), "last7"),
    trend: [],
    heatmap: [],
    goals: evaluateGoals(goals, detail.total, detail.byCategory),
    report: null,
  };
}

function itemRows(): ItemRow[] {
  const since = addDays(today, -27);
  const totals = new Map<string, number>();
  for (const r of data.rows) if (r.date >= since) totals.set(`${r.type}|${r.key}`, (totals.get(`${r.type}|${r.key}`) ?? 0) + r.seconds);
  return [...items.values()]
    .map((i) => ({ ...i, seconds: totals.get(`${i.type}|${i.key}`) ?? 0 }))
    .sort((a, b) => b.seconds - a.seconds);
}

export const demoApi = {
  overview: async (date: string | null, device: string) => overview(date, device),
  items: async () => ({ items: itemRows() }),
  setCategory: async (type: string, key: string, category: string | null) => {
    const item = items.get(`${type}|${key}`);
    if (item) {
      item.category = isCategoryId(category) ? category : null;
      item.categorySource = item.category ? "manual" : null;
    }
    reports.clear();
    return {};
  },
  categorize: async () => {
    await wait(800);
    let n = 0;
    for (const [k, item] of items) {
      if (item.category || BROWSER_BUNDLE_IDS.has(item.key)) continue;
      const c = presetCategory.get(k);
      if (isCategoryId(c)) {
        item.category = c;
        item.categorySource = "ai";
        n++;
      }
    }
    reports.clear();
    return { categorized: n };
  },
  goals: async () => ({
    goals: goals.map(
      (g): GoalRow => ({
        id: g.id,
        target_kind: g.target.kind,
        target_category: g.target.kind === "category" ? g.target.category : null,
        comparator: g.comparator,
        minutes: g.minutes,
      }),
    ),
  }),
  addGoal: async (category: string, comparator: "max" | "min", minutes: number) => {
    if (!(minutes >= 1 && minutes <= 1440)) throw new Error("分は 1〜1440 で指定してください");
    goals.push({
      id: nextGoalId++,
      target: isCategoryId(category) ? { kind: "category", category } : { kind: "total" },
      comparator,
      minutes,
    });
    reports.clear();
    return {};
  },
  deleteGoal: async (id: number) => {
    goals = goals.filter((g) => g.id !== id);
    reports.clear();
    return {};
  },
  regenerate: async (date: string, notify: boolean) => {
    await wait(900);
    reports.set(date, sampleReport(overview_all(date)));
    if (notify) throw new Error("デモ版のため Slack には送信しません（振り返りは作成しました）");
    return {};
  },
};
