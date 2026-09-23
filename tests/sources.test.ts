// スクリーンタイム / Chrome の DB を模した SQLite を作り、読み取り処理を検証する。
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectChrome } from "../collector/sources/chrome.ts";
import { collectKnowledgeC } from "../collector/sources/knowledgec.ts";
import { collectScreenTime } from "../collector/sources/screentime.ts";
import type { SourceContext } from "../collector/sources/types.ts";

const dir = mkdtempSync(join(tmpdir(), "sti-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function sqlite(path: string, sql: string) {
  execFileSync("sqlite3", [path, sql]);
}

const jstMs = (s: string) => new Date(`${s}+09:00`).getTime();
const coreData = (s: string) => jstMs(s) / 1000 - 978307200;
const local = { id: "mac:LOCAL", name: "My MacBook", platform: "mac" as const };
const ctx: SourceContext = { local, sinceMs: jstMs("2026-09-01T00:00:00"), excludeDevices: [] };

describe("collectScreenTime (RMAdminStore)", () => {
  const db = join(dir, "RMAdminStore-Local.sqlite");
  sqlite(
    db,
    `CREATE TABLE ZCOREDEVICE (Z_PK INTEGER PRIMARY KEY, ZIDENTIFIER TEXT, ZNAME TEXT);
     CREATE TABLE ZUSAGE (Z_PK INTEGER PRIMARY KEY, ZDEVICE INTEGER);
     CREATE TABLE ZUSAGEBLOCK (Z_PK INTEGER PRIMARY KEY, ZUSAGE INTEGER, ZSTARTDATE REAL, ZNUMBEROFPICKUPSWITHOUTAPPLICATIONUSAGE INTEGER);
     CREATE TABLE ZUSAGECATEGORY (Z_PK INTEGER PRIMARY KEY, ZBLOCK INTEGER, ZIDENTIFIER TEXT);
     CREATE TABLE ZUSAGETIMEDITEM (Z_PK INTEGER PRIMARY KEY, ZCATEGORY INTEGER, ZBUNDLEIDENTIFIER TEXT, ZDOMAIN TEXT, ZTOTALTIMEINSECONDS REAL);
     CREATE TABLE ZUSAGECOUNTEDITEM (Z_PK INTEGER PRIMARY KEY, ZBLOCK INTEGER, ZBUNDLEIDENTIFIER TEXT, ZNUMBEROFPICKUPS INTEGER, ZNUMBEROFNOTIFICATIONS INTEGER);
     INSERT INTO ZCOREDEVICE VALUES (1, 'MACID', 'My MacBook'), (2, 'PHONEID', 'Taro''s iPhone');
     INSERT INTO ZUSAGE VALUES (1, 1), (2, 2);
     INSERT INTO ZUSAGEBLOCK VALUES (1, 1, ${coreData("2026-09-20T10:00:00")}, 0),
                                    (2, 2, ${coreData("2026-09-20T22:00:00")}, 3),
                                    (3, 1, ${coreData("2026-08-01T10:00:00")}, 0);
     INSERT INTO ZUSAGECATEGORY VALUES (1, 1, 'DH0001'), (2, 2, 'DH0002'), (3, 3, 'DH0001');
     INSERT INTO ZUSAGETIMEDITEM VALUES
       (1, 1, 'com.microsoft.VSCode', NULL, 1500),
       (2, 1, 'com.apple.Safari', NULL, 600),
       (3, 1, NULL, 'www.github.com', 400),
       (4, 2, 'com.burbn.instagram', NULL, 900),
       (5, 3, 'com.old.App', NULL, 100);
     INSERT INTO ZUSAGECOUNTEDITEM VALUES (1, 2, 'com.burbn.instagram', 5, 12);`,
  );

  const r = collectScreenTime(ctx, "My MacBook", [db]);

  it("この Mac と iPhone を識別する", () => {
    expect(r.devices).toContainEqual(local);
    expect(r.devices).toContainEqual({ id: "st:PHONEID", name: "Taro's iPhone", platform: "iphone" });
  });

  it("1時間ブロックをローカル時刻で行にする（期間外は除外）", () => {
    const simple = r.rows.map((x) => `${x.deviceId} ${x.date} ${x.hour} ${x.type} ${x.key} ${x.seconds}`).sort();
    expect(simple).toEqual([
      "mac:LOCAL 2026-09-20 10 app com.apple.Safari 600",
      "mac:LOCAL 2026-09-20 10 app com.microsoft.VSCode 1500",
      "mac:LOCAL 2026-09-20 10 web github.com 400",
      "st:PHONEID 2026-09-20 22 app com.burbn.instagram 900",
    ]);
  });

  it("持ち上げ回数と通知数を日別に集計する", () => {
    expect(r.pickups).toEqual([{ deviceId: "st:PHONEID", date: "2026-09-20", pickups: 8, notifications: 12 }]);
  });
});

describe("collectKnowledgeC", () => {
  const db = join(dir, "knowledgeC.db");
  sqlite(
    db,
    `CREATE TABLE ZSOURCE (Z_PK INTEGER PRIMARY KEY, ZDEVICEID TEXT);
     CREATE TABLE ZSYNCPEER (Z_PK INTEGER PRIMARY KEY, ZDEVICEID TEXT, ZMODEL TEXT);
     CREATE TABLE ZSTRUCTUREDMETADATA (Z_PK INTEGER PRIMARY KEY, Z_DKDIGITALHEALTHMETADATAKEY__WEBDOMAIN TEXT);
     CREATE TABLE ZOBJECT (Z_PK INTEGER PRIMARY KEY, ZSTREAMNAME TEXT, ZVALUESTRING TEXT, ZSTARTDATE REAL, ZENDDATE REAL, ZSOURCE INTEGER, ZSTRUCTUREDMETADATA INTEGER);
     INSERT INTO ZSOURCE VALUES (1, NULL), (2, 'PEER1');
     INSERT INTO ZSYNCPEER VALUES (1, 'PEER1', 'iPhone15,2');
     INSERT INTO ZSTRUCTUREDMETADATA VALUES (1, 'www.youtube.com');
     INSERT INTO ZOBJECT VALUES
       (1, '/app/usage', 'com.apple.Safari', ${coreData("2026-09-20T09:50:00")}, ${coreData("2026-09-20T10:20:00")}, 1, NULL),
       (2, '/app/webUsage', 'com.apple.Safari', ${coreData("2026-09-20T09:55:00")}, ${coreData("2026-09-20T10:05:00")}, 1, 1),
       (3, '/app/usage', 'com.apple.mobilesafari', ${coreData("2026-09-20T21:00:00")}, ${coreData("2026-09-20T21:10:00")}, 2, NULL);`,
  );

  const r = collectKnowledgeC(ctx, db);

  it("区間を時間ごとに分け、同期された端末を識別する", () => {
    const simple = r.rows.map((x) => `${x.deviceId} ${x.hour} ${x.type} ${x.key} ${x.seconds}`).sort();
    expect(simple).toEqual([
      "kc:PEER1 21 app com.apple.mobilesafari 600",
      "mac:LOCAL 10 app com.apple.Safari 1200",
      "mac:LOCAL 10 web youtube.com 300",
      "mac:LOCAL 9 app com.apple.Safari 600",
      "mac:LOCAL 9 web youtube.com 300",
    ]);
    expect(r.devices).toContainEqual({ id: "kc:PEER1", name: "iPhone15,2", platform: "iphone" });
  });
});

describe("collectChrome", () => {
  const db = join(dir, "History");
  const webkit = (s: string) => (jstMs(s) / 1000 + 11644473600) * 1e6;
  const min = 60 * 1e6;
  sqlite(
    db,
    `CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT);
     CREATE TABLE visits (id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER, visit_duration INTEGER);
     INSERT INTO urls VALUES (1, 'https://github.com/a'), (2, 'https://www.x.com/home'), (3, 'chrome://newtab');
     INSERT INTO visits VALUES
       (1, 1, ${webkit("2026-09-20T10:00:00")}, ${90 * min}),
       (2, 2, ${webkit("2026-09-20T10:40:00")}, ${10 * min}),
       (3, 3, ${webkit("2026-09-20T11:00:00")}, ${5 * min});`,
  );

  const r = collectChrome(ctx, undefined, [db]);

  it("重複タブを除いてドメイン別に集計する", () => {
    const simple = r.rows.map((x) => `${x.hour} ${x.key} ${x.seconds}`).sort();
    // github は上限30分、x.com は10分、chrome:// は対象外
    expect(simple).toEqual(["10 github.com 1800", "10 x.com 600"]);
    expect(r.rows.every((x) => x.deviceId === local.id && x.source === "chrome")).toBe(true);
  });
});
