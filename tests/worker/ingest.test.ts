import { describe, expect, it } from "vitest";
import { parsePayload, ValidationError } from "../../src/worker/ingest";

const valid = {
  version: 1,
  timezone: "Asia/Tokyo",
  collectedOn: "2026-09-21",
  date: "2026-09-20",
  sources: ["screentime", "chrome"],
  devices: [{ id: "mac:1", name: "MacBook", platform: "mac" }],
  rows: [{ deviceId: "mac:1", date: "2026-09-20", hour: 10, type: "app", key: "com.apple.Safari", seconds: 120, source: "screentime" }],
  pickups: [],
  names: [{ type: "app", key: "com.apple.Safari", name: "Safari" }],
};

describe("parsePayload", () => {
  it("正しい payload を受け付ける", () => {
    const p = parsePayload(valid);
    expect(p.rows).toHaveLength(1);
    expect(p.sources).toEqual(["screentime", "chrome"]);
  });

  it.each([
    ["未知の端末", { rows: [{ ...valid.rows[0], deviceId: "other" }] }],
    ["日付の不一致", { rows: [{ ...valid.rows[0], date: "2026-09-19" }] }],
    ["範囲外の時", { rows: [{ ...valid.rows[0], hour: 24 }] }],
    ["1時間を超える秒数", { rows: [{ ...valid.rows[0], seconds: 3601 }] }],
    ["未知のソース", { sources: ["evil"] }],
    ["不正な日付", { date: "2026/09/20" }],
  ])("%s を拒否する", (_label, patch) => {
    expect(() => parsePayload({ ...valid, ...patch })).toThrow(ValidationError);
  });
});
