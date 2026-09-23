import { addDays, nowInTimeZone } from "../shared/time";
import type { ItemType } from "../shared/types";
import { categorizeItems, generateDailyReport, modelOf } from "./ai";
import { buildOverview } from "./data";
import { timeZoneOf, type Env } from "./env";
import { notifySlack } from "./slack";

const CATEGORIZE_BATCH = 60;

/** 未分類のアプリ / ドメインを AI で分類する（手動設定は上書きしない） */
export async function categorizePending(env: Env, maxBatches = 3): Promise<number> {
  if (!env.ANTHROPIC_API_KEY) return 0;
  let done = 0;
  for (let i = 0; i < maxBatches; i++) {
    const { results } = await env.DB.prepare(
      `SELECT i.item_type, i.item_key, i.name FROM items i
       LEFT JOIN (SELECT item_type, item_key, SUM(seconds) AS s FROM usage_hourly GROUP BY item_type, item_key) u
         ON u.item_type = i.item_type AND u.item_key = i.item_key
       WHERE i.category IS NULL AND i.categorize_attempts < 3
       ORDER BY COALESCE(u.s, 0) DESC LIMIT ?1`,
    )
      .bind(CATEGORIZE_BATCH)
      .all<{ item_type: ItemType; item_key: string; name: string | null }>();
    if (results.length === 0) break;

    const keys = JSON.stringify(results.map((r) => [r.item_type, r.item_key]));
    await env.DB.prepare(
      `UPDATE items SET categorize_attempts = categorize_attempts + 1
       WHERE (item_type, item_key) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?1))`,
    )
      .bind(keys)
      .run();

    const output = await categorizeItems(
      env,
      results.map((r) => ({ type: r.item_type, key: r.item_key, name: r.name })),
    );
    if (output.length > 0) {
      await env.DB.batch(
        output.map((o) =>
          env.DB.prepare(
            `UPDATE items SET category = ?1, category_source = 'ai', name = COALESCE(name, ?2), updated_at = datetime('now')
             WHERE item_type = ?3 AND item_key = ?4 AND (category_source IS NULL OR category_source = 'ai')`,
          ).bind(o.category, o.displayName, o.type, o.key),
        ),
      );
    }
    done += output.length;
  }
  return done;
}

/**
 * 指定日のレポートを生成して保存し、Slack に通知する。
 * 同時実行を防ぐため reports 行を "generating" にしてから処理する。
 */
export async function generateReport(env: Env, date: string, opts: { force?: boolean; notify?: boolean } = {}) {
  const claimed = await env.DB.prepare(
    `INSERT INTO reports (date, status) VALUES (?1, 'generating')
     ON CONFLICT (date) DO UPDATE SET status = 'generating', error = NULL, updated_at = datetime('now')
     WHERE ?2 = 1
        OR reports.status = 'error' AND reports.updated_at < datetime('now', '-50 minutes')
        OR reports.status = 'generating' AND reports.updated_at < datetime('now', '-15 minutes')`,
  )
    .bind(date, opts.force ? 1 : 0)
    .run();
  if (claimed.meta.changes === 0) return { skipped: true as const };

  try {
    await categorizePending(env);
    const overview = await buildOverview(env, date, "all", 8);
    const content = await generateDailyReport(env, overview);
    await env.DB.prepare(
      `UPDATE reports SET status = 'ready', content = ?2, model = ?3, error = NULL, updated_at = datetime('now') WHERE date = ?1`,
    )
      .bind(date, JSON.stringify(content), modelOf(env))
      .run();

    if (opts.notify !== false) {
      try {
        if (await notifySlack(env, overview, content)) {
          await env.DB.prepare(`UPDATE reports SET notified_at = datetime('now') WHERE date = ?1`).bind(date).run();
        }
      } catch (e) {
        console.error("slack notify failed", e);
      }
    }
    return { skipped: false as const, content };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await env.DB.prepare(`UPDATE reports SET status = 'error', error = ?2, updated_at = datetime('now') WHERE date = ?1`)
      .bind(date, message.slice(0, 1000))
      .run();
    throw e;
  }
}

/**
 * 定期実行（15分ごと）。
 * 今日（Mac のローカル日付）の収集が届いていれば前日ぶんのデータは揃っているので、
 * 前日のレポートがまだなければ生成する。
 */
export async function runScheduled(env: Env): Promise<void> {
  const tz = timeZoneOf(env);
  const today = nowInTimeZone(tz).date;
  const yesterday = addDays(today, -1);

  const ready = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM ingest_runs WHERE local_date >= ?1) AS ingested_today,
       (SELECT COUNT(*) FROM usage_hourly WHERE date = ?2) AS rows_yesterday,
       (SELECT status FROM reports WHERE date = ?2) AS report_status`,
  )
    .bind(today, yesterday)
    .first<{ ingested_today: number; rows_yesterday: number; report_status: string | null }>();

  if (ready && ready.ingested_today > 0 && ready.rows_yesterday > 0 && ready.report_status !== "ready" && env.ANTHROPIC_API_KEY) {
    try {
      await generateReport(env, yesterday);
    } catch (e) {
      console.error("report generation failed", e);
    }
  }

  try {
    await categorizePending(env, 2);
  } catch (e) {
    console.error("categorize failed", e);
  }
}
