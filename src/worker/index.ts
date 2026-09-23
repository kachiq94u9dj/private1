import { Hono } from "hono";
import { isCategoryId } from "../shared/categories";
import { isValidDate, nowInTimeZone } from "../shared/time";
import { verifyAccess, verifyIngestToken } from "./auth";
import { buildOverview } from "./data";
import { timeZoneOf, type Env } from "./env";
import { parsePayload, savePayload, ValidationError } from "./ingest";
import { categorizePending, generateReport, runScheduled } from "./jobs";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "internal error" }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

// 収集スクリプトからの送信（Bearer トークンで認証）
app.post("/api/ingest", async (c) => {
  if (!(await verifyIngestToken(c.req.raw, c.env))) return c.json({ error: "unauthorized" }, 401);
  const payload = parsePayload(await c.req.json());
  const saved = await savePayload(c.env, payload);
  return c.json({ ok: true, date: payload.date, rows: saved });
});

// ここから下はダッシュボード用。Cloudflare Access の JWT を必須にする。
app.use("/api/*", async (c, next) => {
  const result = await verifyAccess(c.req.raw, c.env);
  if (!result.ok) return c.json({ error: result.reason }, 403);
  await next();
});

app.get("/api/overview", async (c) => {
  const tz = timeZoneOf(c.env);
  const dateParam = c.req.query("date");
  const date = isValidDate(dateParam) ? dateParam : nowInTimeZone(tz).date;
  const device = c.req.query("device") || "all";
  const days = Math.min(Math.max(Number(c.req.query("days")) || 28, 7), 60);
  return c.json(await buildOverview(c.env, date, device, days));
});

app.get("/api/items", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.item_type AS type, i.item_key AS key, i.name, i.category, i.category_source AS categorySource,
            COALESCE(u.s, 0) AS seconds
     FROM items i
     LEFT JOIN (SELECT item_type, item_key, SUM(seconds) AS s FROM usage_hourly
                WHERE date >= date('now', '-28 days') GROUP BY item_type, item_key) u
       ON u.item_type = i.item_type AND u.item_key = i.item_key
     ORDER BY seconds DESC LIMIT 500`,
  ).all();
  return c.json({ items: results });
});

app.put("/api/items/:type/:key", async (c) => {
  const type = c.req.param("type");
  const key = c.req.param("key");
  const body = await c.req.json<{ category?: unknown; name?: unknown }>();
  if (type !== "app" && type !== "web") return c.json({ error: "type が不正です" }, 400);
  if (body.category !== null && !isCategoryId(body.category)) return c.json({ error: "category が不正です" }, 400);
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : null;
  await c.env.DB.prepare(
    `UPDATE items SET category = ?3, category_source = CASE WHEN ?3 IS NULL THEN NULL ELSE 'manual' END,
       categorize_attempts = 0, name = COALESCE(?4, name), updated_at = datetime('now')
     WHERE item_type = ?1 AND item_key = ?2`,
  )
    .bind(type, key, body.category, name)
    .run();
  return c.json({ ok: true });
});

app.post("/api/items/categorize", async (c) => {
  const count = await categorizePending(c.env, 5);
  return c.json({ ok: true, categorized: count });
});

app.get("/api/goals", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM goals ORDER BY id`).all();
  return c.json({ goals: results });
});

app.post("/api/goals", async (c) => {
  const body = await c.req.json<{ category?: unknown; comparator?: unknown; minutes?: unknown }>();
  const isTotal = body.category === "total";
  if (!isTotal && !isCategoryId(body.category)) return c.json({ error: "category が不正です" }, 400);
  if (body.comparator !== "max" && body.comparator !== "min") return c.json({ error: "comparator が不正です" }, 400);
  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) return c.json({ error: "minutes が不正です" }, 400);
  await c.env.DB.prepare(`INSERT INTO goals (target_kind, target_category, comparator, minutes) VALUES (?1, ?2, ?3, ?4)`)
    .bind(isTotal ? "total" : "category", isTotal ? null : body.category, body.comparator, minutes)
    .run();
  return c.json({ ok: true });
});

app.delete("/api/goals/:id", async (c) => {
  await c.env.DB.prepare(`DELETE FROM goals WHERE id = ?1`).bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

app.post("/api/reports/:date/regenerate", async (c) => {
  const date = c.req.param("date");
  if (!isValidDate(date)) return c.json({ error: "date が不正です" }, 400);
  const notify = c.req.query("notify") === "1";
  const result = await generateReport(c.env, date, { force: true, notify });
  return c.json({ ok: true, skipped: result.skipped });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env));
  },
} satisfies ExportedHandler<Env>;
