import { describe, expect, it } from "vitest";
import { analyze, attributeHour, averageSummary, dedupeSources, type AnalysisRow, type MetaLookup } from "../src/shared/analysis";
import type { ItemMeta } from "../src/shared/types";

const metas: Record<string, ItemMeta> = {
  "app|com.microsoft.VSCode": { type: "app", key: "com.microsoft.VSCode", name: "VS Code", category: "dev", categorySource: "ai" },
  "app|com.tinyspeck.slackmacgap": { type: "app", key: "com.tinyspeck.slackmacgap", name: "Slack", category: "communication", categorySource: "ai" },
  "web|github.com": { type: "web", key: "github.com", name: "GitHub", category: "dev", categorySource: "ai" },
  "web|x.com": { type: "web", key: "x.com", name: "X", category: "sns", categorySource: "manual" },
};
const meta: MetaLookup = (type, key) => metas[`${type}|${key}`];

function row(p: Partial<AnalysisRow>): AnalysisRow {
  return { deviceId: "mac", date: "2026-09-20", hour: 10, type: "app", key: "x", seconds: 0, source: "screentime", ...p };
}

describe("attributeHour", () => {
  it("ブラウザ時間をドメイン別に置き換え、足りない分は『その他』", () => {
    const a = attributeHour(
      [
        row({ key: "com.microsoft.VSCode", seconds: 1200 }),
        row({ key: "com.google.Chrome", seconds: 1800 }),
        row({ type: "web", key: "github.com", seconds: 600, source: "chrome" }),
        row({ type: "web", key: "x.com", seconds: 300, source: "chrome" }),
      ],
      meta,
    );
    expect(a.total).toBe(3000);
    expect(Object.fromEntries(a.byCategory)).toEqual({ dev: 1800, sns: 300, other: 900 });
  });

  it("ドメインの合計がブラウザ時間を超えたら按分する", () => {
    const a = attributeHour(
      [
        row({ key: "com.google.Chrome", seconds: 600 }),
        row({ type: "web", key: "github.com", seconds: 900, source: "chrome" }),
        row({ type: "web", key: "x.com", seconds: 300, source: "chrome" }),
      ],
      meta,
    );
    expect(a.total).toBe(600);
    expect(Object.fromEntries(a.byCategory)).toEqual({ dev: 450, sns: 150 });
  });

  it("アプリの記録がない時間帯は Web の時間を合計にする", () => {
    const a = attributeHour([row({ type: "web", key: "x.com", seconds: 300, source: "chrome" })], meta);
    expect(a.total).toBe(300);
    expect(Object.fromEntries(a.byCategory)).toEqual({ sns: 300 });
  });

  it("未分類アプリは『その他』", () => {
    const a = attributeHour([row({ key: "com.unknown.App", seconds: 100 })], meta);
    expect(Object.fromEntries(a.byCategory)).toEqual({ other: 100 });
  });
});

describe("dedupeSources", () => {
  it("同じ端末・日に screentime があれば knowledgec を捨てる", () => {
    const rows = [
      row({ key: "a", seconds: 10, source: "screentime" }),
      row({ key: "a", seconds: 10, source: "knowledgec" }),
      row({ key: "a", seconds: 10, source: "knowledgec", date: "2026-09-21" }),
      row({ type: "web", key: "x.com", seconds: 10, source: "chrome" }),
    ];
    expect(dedupeSources(rows).map((r) => `${r.source}:${r.date}`)).toEqual([
      "screentime:2026-09-20",
      "knowledgec:2026-09-21",
      "chrome:2026-09-20",
    ]);
  });
});

describe("analyze", () => {
  it("端末をまたいで日次・時間帯・ランキングを集計する", () => {
    const a = analyze(
      [
        row({ key: "com.microsoft.VSCode", seconds: 3000, hour: 9 }),
        row({ key: "com.microsoft.VSCode", seconds: 600, hour: 10 }),
        row({ deviceId: "iphone", key: "com.burbn.instagram", seconds: 900, hour: 22 }),
      ],
      meta,
    );
    const d = a.detail("2026-09-20");
    expect(d.total).toBe(4500);
    expect(d.hourly[9]).toBe(3000);
    expect(d.hourly[22]).toBe(900);
    expect(d.apps.map((x) => [x.name, x.seconds])).toEqual([
      ["VS Code", 3600],
      ["com.burbn.instagram", 900],
    ]);
    expect(a.summary("2026-09-19")).toEqual({ date: "2026-09-19", total: 0, byCategory: {} });
  });
});

describe("averageSummary", () => {
  it("データのある日だけで平均する", () => {
    const avg = averageSummary(
      [
        { date: "a", total: 3600, byCategory: { dev: 3600 } },
        { date: "b", total: 0, byCategory: {} },
        { date: "c", total: 1800, byCategory: { sns: 1800 } },
      ],
      "avg",
    );
    expect(avg).toEqual({ date: "avg", total: 2700, byCategory: { dev: 1800, sns: 900 } });
  });
});
