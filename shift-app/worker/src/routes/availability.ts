import { Hono } from "hono";
import type { Availability, AvailabilitySymbol, Env } from "../types";
import type { Vars } from "../middleware";
import { requireAuth } from "../middleware";
import { appendRow, readTable, updateRow } from "../lib/sheets";
import { isOneOf, isValidDate, sanitizeFreeText } from "../lib/validate";

export const availabilityRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const TAB = "Availability";
const SYMBOLS = ["batsu", "sankaku", "maru"] as const;

function toAvailability(record: Record<string, string>): Availability {
  return {
    id: record.id,
    memberId: record.member_id,
    date: record.date,
    symbol: record.symbol as AvailabilitySymbol,
    note: record.note ?? "",
    updatedAt: record.updated_at ?? "",
  };
}

availabilityRoutes.get("/", requireAuth, async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const memberId = c.req.query("memberId");

  const rows = await readTable(c.env, TAB);
  let items = rows.map((r) => toAvailability(r.record));

  if (from) items = items.filter((i) => i.date >= from);
  if (to) items = items.filter((i) => i.date <= to);
  if (memberId) items = items.filter((i) => i.memberId === memberId);

  return c.json(items);
});

availabilityRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ date: string; symbol: AvailabilitySymbol; note?: string }>();

  if (!isValidDate(body.date) || !isOneOf(body.symbol, SYMBOLS)) {
    return c.json({ error: "date (YYYY-MM-DD) and a valid symbol are required" }, 400);
  }
  const note = sanitizeFreeText(body.note);

  const rows = await readTable(c.env, TAB);
  const existing = rows.find(
    (r) => r.record.member_id === user.memberId && r.record.date === body.date
  );
  const now = new Date().toISOString();

  if (existing) {
    await updateRow(c.env, TAB, existing.rowNumber, [
      existing.record.id,
      user.memberId,
      body.date,
      body.symbol,
      note,
      now,
    ]);
    return c.json({ id: existing.record.id, updated: true });
  }

  const id = crypto.randomUUID();
  await appendRow(c.env, TAB, [id, user.memberId, body.date, body.symbol, note, now]);
  return c.json({ id, updated: false }, 201);
});
