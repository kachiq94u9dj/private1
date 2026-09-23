import { Hono } from "hono";
import type { Env, Holiday } from "../types";
import type { Vars } from "../middleware";
import { requireAdmin, requireAuth } from "../middleware";
import { appendRow, readTable, updateRow } from "../lib/sheets";
import { isValidDate, sanitizeFreeText } from "../lib/validate";

export const holidayRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const TAB = "Holidays";

holidayRoutes.get("/", requireAuth, async (c) => {
  const rows = await readTable(c.env, TAB);
  const items: Holiday[] = rows
    .map((r) => ({ date: r.record.date, name: r.record.name }))
    .filter((h) => h.date);
  return c.json(items);
});

holidayRoutes.post("/", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json<{ date: string; name: string }>();
  if (!isValidDate(body.date) || !body.name) {
    return c.json({ error: "date (YYYY-MM-DD) and name are required" }, 400);
  }
  const name = sanitizeFreeText(body.name);

  const rows = await readTable(c.env, TAB);
  const existing = rows.find((r) => r.record.date === body.date);
  if (existing) {
    await updateRow(c.env, TAB, existing.rowNumber, [body.date, name]);
  } else {
    await appendRow(c.env, TAB, [body.date, name]);
  }
  return c.json({ ok: true });
});

// シート行の物理削除にはbatchUpdate(deleteDimension)が必要なため、
// 現状は日付・名称を空にする論理削除としている(一覧APIは空行を除外する)。
holidayRoutes.delete("/:date", requireAuth, requireAdmin, async (c) => {
  const date = c.req.param("date");
  const rows = await readTable(c.env, TAB);
  const existing = rows.find((r) => r.record.date === date);
  if (!existing) return c.json({ error: "not found" }, 404);

  await updateRow(c.env, TAB, existing.rowNumber, ["", ""]);
  return c.json({ ok: true });
});
