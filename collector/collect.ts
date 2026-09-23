// Mac のスクリーンタイムと Chrome の履歴を集計し、Cloudflare 上のダッシュボードへ送信する。
//
//   node collector/collect.ts              … 1日1回の自動実行用（当日すでに送信済みならスキップ）
//   node collector/collect.ts --force      … 強制的に送信
//   node collector/collect.ts --all        … 残っている全期間を送信（初回向け。自動で初回は全期間）
//   node collector/collect.ts --days 3     … 直近 N 日ぶんを送信
//   node collector/collect.ts --dry-run    … 送信せずに集計結果だけ表示
//   node collector/collect.ts --diagnose   … どのデータが読めるかを確認する
import { BROWSER_BUNDLE_IDS } from "../src/shared/categories.ts";
import { addDays, dateRange } from "../src/shared/time.ts";
import type { DeviceInfo, IngestPayload, PickupRow, UsageRow, UsageSource } from "../src/shared/types.ts";
import { localDate } from "./bucket.ts";
import { loadConfig, loadState, saveState, type Config } from "./config.ts";
import { appNameFor, computerName, localDevice } from "./device.ts";
import { collectChrome } from "./sources/chrome.ts";
import { collectKnowledgeC } from "./sources/knowledgec.ts";
import { collectScreenTime } from "./sources/screentime.ts";
import type { SourceContext, SourceResult } from "./sources/types.ts";
import { PermissionError } from "./sqlite.ts";

const args = new Set(process.argv.slice(2));
const daysArg = (() => {
  const i = process.argv.indexOf("--days");
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
})();

const FULL_HISTORY_DAYS = 60; // スクリーンタイムは最大4週間程度しか保持しないが、余裕をもって読む
const INCREMENTAL_DAYS = 7; // iPhone の同期遅れも拾えるよう、毎回直近7日を送り直す

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runSource(name: string, fn: () => SourceResult): SourceResult | null {
  try {
    const r = fn();
    log(`${name}: ${r.rows.length} 行 (${r.notes.join(", ")})`);
    return r;
  } catch (e) {
    if (e instanceof PermissionError) log(`${name}: ⚠️ ${e.message}`);
    else log(`${name}: 読み取りに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function post(config: Config, payload: IngestPayload): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.ingestToken}`,
  };
  if (config.accessClientId && config.accessClientSecret) {
    headers["CF-Access-Client-Id"] = config.accessClientId;
    headers["CF-Access-Client-Secret"] = config.accessClientSecret;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${config.url}/api/ingest`, { method: "POST", headers, body: JSON.stringify(payload), redirect: "manual" });
      if (res.ok) return;
      const text = await res.text();
      if (res.status >= 300 && res.status < 400) {
        throw new Error("Cloudflare Access のログイン画面にリダイレクトされました。サービストークンか Bypass ポリシーを設定してください（README 参照）");
      }
      if (res.status < 500) throw new Error(`送信エラー ${res.status}: ${text.slice(0, 300)}`);
      lastError = new Error(`サーバーエラー ${res.status}: ${text.slice(0, 300)}`);
    } catch (e) {
      if (e instanceof Error && /送信エラー|リダイレクト/.test(e.message)) throw e;
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw lastError;
}

async function main() {
  const config = loadConfig();
  const state = loadState();
  const now = Date.now();
  const today = localDate(now);
  const dryRun = args.has("--dry-run") || args.has("--diagnose");

  if (!dryRun && (!config.url || !config.ingestToken)) {
    throw new Error("~/.screen-time-insights/config.env に STI_URL と STI_INGEST_TOKEN を設定してください");
  }

  const isAuto = !args.has("--force") && !args.has("--all") && daysArg === undefined && !dryRun;
  if (isAuto) {
    if (state.lastSuccessDate === today) {
      log("本日はすでに送信済みのためスキップします（--force で強制実行）");
      return;
    }
    if (new Date(now).getHours() < config.minHour) {
      log(`${config.minHour}時より前のためスキップします`);
      return;
    }
  }

  const days = args.has("--all") || !state.lastSuccessDate ? FULL_HISTORY_DAYS : daysArg ?? INCREMENTAL_DAYS;
  const fromDate = addDays(today, -(days - 1));
  const sinceMs = new Date(`${fromDate}T00:00:00`).getTime();
  const local = localDevice();
  const ctx: SourceContext = { local, sinceMs, excludeDevices: config.excludeDevices };
  log(`対象期間: ${fromDate} 〜 ${today}（端末: ${local.name}）`);

  const results: SourceResult[] = [];
  const st = runSource("スクリーンタイム(RMAdminStore)", () => collectScreenTime(ctx, computerName()));
  if (st) results.push(st);
  if (!st || st.rows.length === 0) {
    const kc = runSource("スクリーンタイム(knowledgeC)", () => collectKnowledgeC(ctx));
    if (kc) results.push(kc);
  }
  const chrome = runSource("Chrome 履歴", () => collectChrome(ctx, config.chromeProfiles));
  if (chrome) results.push(chrome);

  const usable = results.filter((r) => r.rows.length > 0);
  if (usable.length === 0) {
    log("送信できるデータがありませんでした。--diagnose の結果と README の「フルディスクアクセス」を確認してください");
    process.exitCode = 1;
    return;
  }

  const devices = new Map<string, DeviceInfo>([[local.id, local]]);
  for (const r of usable) for (const d of r.devices) devices.set(d.id, d);
  const sources = usable.map((r) => r.source) as UsageSource[];
  const rows: UsageRow[] = usable.flatMap((r) => r.rows).filter((r) => r.date >= fromDate && r.date <= today);
  const pickups: PickupRow[] = usable.flatMap((r) => r.pickups);

  // Mac のアプリ名を解決（結果はキャッシュ）
  state.appNames ??= {};
  const macApps = new Set(rows.filter((r) => r.type === "app" && r.deviceId === local.id).map((r) => r.key));
  for (const id of macApps) {
    if (!(id in state.appNames)) state.appNames[id] = appNameFor(id);
  }
  const names = [...macApps]
    .filter((id) => state.appNames![id])
    .map((id) => ({ type: "app" as const, key: id, name: state.appNames![id]! }));

  if (args.has("--diagnose") || dryRun) {
    for (const d of devices.values()) {
      const total = rows.filter((r) => r.deviceId === d.id && r.type === "app").reduce((s, r) => s + r.seconds, 0);
      log(`端末 ${d.name} (${d.platform}, ${d.id}): アプリ合計 ${Math.round(total / 3600)} 時間`);
    }
    const todayRows = rows.filter((r) => r.date === today);
    const top = new Map<string, number>();
    for (const r of todayRows) top.set(`${r.type}:${r.key}`, (top.get(`${r.type}:${r.key}`) ?? 0) + r.seconds);
    log("今日の上位:");
    for (const [k, s] of [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${k.padEnd(50)} ${Math.round(s / 60)} 分${BROWSER_BUNDLE_IDS.has(k.slice(4)) ? "（ブラウザ）" : ""}`);
    }
    return;
  }

  let sent = 0;
  for (const date of dateRange(fromDate, today)) {
    const dayRows = rows.filter((r) => r.date === date);
    const payload: IngestPayload = {
      version: 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      collectedOn: today,
      date,
      sources,
      devices: [...devices.values()],
      rows: dayRows,
      pickups: pickups.filter((p) => p.date === date),
      names: date === today ? names : [],
    };
    await post(config, payload);
    sent += dayRows.length;
  }
  state.lastSuccessDate = today;
  saveState(state);
  log(`送信完了: ${days} 日ぶん / ${sent} 行`);
}

main().catch((e) => {
  log(`エラー: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
