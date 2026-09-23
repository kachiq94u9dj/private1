import { describe, expect, it } from "vitest";
import { chromeIntervals, domainOf, guessPlatform, splitByHour, UsageAccumulator } from "../collector/bucket.ts";

const jst = (s: string) => new Date(`${s}+09:00`).getTime();

describe("splitByHour", () => {
  it("区間を時間の境界で分割する", () => {
    expect(splitByHour(jst("2026-09-20T10:50:00"), jst("2026-09-20T12:10:00"))).toEqual([
      { date: "2026-09-20", hour: 10, seconds: 600 },
      { date: "2026-09-20", hour: 11, seconds: 3600 },
      { date: "2026-09-20", hour: 12, seconds: 600 },
    ]);
  });

  it("日付をまたぐ", () => {
    expect(splitByHour(jst("2026-09-20T23:30:00"), jst("2026-09-21T00:15:00"))).toEqual([
      { date: "2026-09-20", hour: 23, seconds: 1800 },
      { date: "2026-09-21", hour: 0, seconds: 900 },
    ]);
  });

  it("空の区間は何も返さない", () => {
    expect(splitByHour(jst("2026-09-20T10:00:00"), jst("2026-09-20T10:00:00"))).toEqual([]);
  });
});

describe("UsageAccumulator", () => {
  it("同じキーを合算し、1時間を上限に丸める", () => {
    const acc = new UsageAccumulator<"chrome">();
    acc.add(["d", "2026-09-20", 10, "web", "github.com", "chrome"], 3000);
    acc.add(["d", "2026-09-20", 10, "web", "github.com", "chrome"], 1000);
    acc.add(["d", "2026-09-20", 10, "web", "x.com", "chrome"], 10.4);
    expect(acc.entries()).toEqual([
      { deviceId: "d", date: "2026-09-20", hour: 10, type: "web", key: "github.com", source: "chrome", seconds: 3600 },
      { deviceId: "d", date: "2026-09-20", hour: 10, type: "web", key: "x.com", source: "chrome", seconds: 10 },
    ]);
  });
});

describe("chromeIntervals", () => {
  it("次の訪問開始で打ち切り、上限でも打ち切る", () => {
    const t0 = jst("2026-09-20T10:00:00");
    const min = 60_000;
    const out = chromeIntervals([
      { startMs: t0 + 5 * min, durationMs: 120 * min, domain: "x.com" }, // 上限 30 分
      { startMs: t0, durationMs: 60 * min, domain: "github.com" }, // 次の訪問(5分後)で打ち切り
    ]);
    expect(out).toEqual([
      { domain: "github.com", startMs: t0, endMs: t0 + 5 * min },
      { domain: "x.com", startMs: t0 + 5 * min, endMs: t0 + 35 * min },
    ]);
  });
});

describe("domainOf", () => {
  it("www を外し、http(s) 以外は無視する", () => {
    expect(domainOf("https://www.YouTube.com/watch?v=1")).toBe("youtube.com");
    expect(domainOf("chrome://settings")).toBeNull();
    expect(domainOf("not a url")).toBeNull();
  });
});

describe("guessPlatform", () => {
  it("名前と bundle id から推定する", () => {
    expect(guessPlatform("Taro's iPhone", [])).toBe("iphone");
    expect(guessPlatform("MacBook Pro", [])).toBe("mac");
    expect(guessPlatform(null, ["com.apple.mobilesafari"])).toBe("iphone");
    expect(guessPlatform(null, ["com.apple.finder"])).toBe("mac");
    expect(guessPlatform(null, [])).toBe("unknown");
  });
});
