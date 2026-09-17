import { Hono } from "hono";
import type { Env, Shift, ShiftStatus, ShiftType } from "../types";
import type { Vars } from "../middleware";
import { requireAdmin, requireAuth } from "../middleware";
import { appendRow, readTable, updateRow } from "../lib/sheets";
import { getMembers } from "../lib/members";
import { upsertCalendarEvent } from "../lib/calendar";
import { sendSlackMessage } from "../lib/slack";

export const shiftRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const TAB = "Shifts";

function toShift(record: Record<string, string>): Shift {
  return {
    id: record.id,
    date: record.date,
    memberId: record.member_id,
    type: record.type as ShiftType,
    status: record.status as ShiftStatus,
    updatedBy: record.updated_by ?? "",
    updatedAt: record.updated_at ?? "",
  };
}

shiftRoutes.get("/", requireAuth, async (c) => {
  const from = c.req.query("from");
  const to = c.req.query("to");

  const rows = await readTable(c.env, TAB);
  let items = rows.map((r) => toShift(r.record));
  if (from) items = items.filter((i) => i.date >= from);
  if (to) items = items.filter((i) => i.date <= to);

  return c.json(items);
});

shiftRoutes.post("/confirm", requireAuth, requireAdmin, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    date: string;
    memberId: string;
    type: ShiftType;
  }>();

  if (!body.date || !body.memberId || !body.type) {
    return c.json({ error: "date, memberId and type are required" }, 400);
  }

  const rows = await readTable(c.env, TAB);
  const existing = rows.find(
    (r) => r.record.member_id === body.memberId && r.record.date === body.date
  );
  const now = new Date().toISOString();
  const id = existing?.record.id ?? crypto.randomUUID();

  const rowValues = [id, body.date, body.memberId, body.type, "confirmed", user.memberId, now];
  if (existing) {
    await updateRow(c.env, TAB, existing.rowNumber, rowValues);
  } else {
    await appendRow(c.env, TAB, rowValues);
  }

  const members = await getMembers(c.env);
  const member = members.find((m) => m.id === body.memberId);

  await sendSlackMessage(
    c.env,
    `:calendar: シフトが確定しました: ${member?.name ?? body.memberId} / ${body.date} / ${
      body.type === "work" ? "出勤" : "代休"
    }`
  );

  // Googleカレンダー反映はベストエフォート(失敗してもシフト確定は成功扱いにする)
  if (member?.email) {
    try {
      await upsertCalendarEvent(c.env, {
        calendarId: member.email,
        shiftId: id,
        date: body.date,
        summary: body.type === "work" ? "CS出勤" : "代休",
      });
    } catch (err) {
      console.error("calendar sync failed", err);
    }
  }

  return c.json({ id });
});
