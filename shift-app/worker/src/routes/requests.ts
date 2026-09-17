import { Hono } from "hono";
import type { Env, RequestStatus, RequestType, ShiftChangeRequest } from "../types";
import type { Vars } from "../middleware";
import { requireAdmin, requireAuth } from "../middleware";
import { appendRow, readTable, updateRow } from "../lib/sheets";
import { getMembers } from "../lib/members";
import { sendSlackMessage } from "../lib/slack";

export const requestRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

const TAB = "Requests";
const SHIFTS_TAB = "Shifts";

function toRequest(record: Record<string, string>): ShiftChangeRequest {
  return {
    id: record.id,
    type: record.type as RequestType,
    requesterId: record.requester_id,
    targetShiftId: record.target_shift_id,
    proposedDate: record.proposed_date,
    reason: record.reason ?? "",
    status: record.status as RequestStatus,
    approverId: record.approver_id ?? "",
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

requestRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await readTable(c.env, TAB);
  let items = rows.map((r) => toRequest(r.record));
  if (!user.isAdmin) {
    items = items.filter((i) => i.requesterId === user.memberId);
  }
  const status = c.req.query("status");
  if (status) items = items.filter((i) => i.status === status);
  return c.json(items);
});

requestRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    type: RequestType;
    targetShiftId: string;
    proposedDate: string;
    reason: string;
  }>();

  if (!body.type || !body.targetShiftId || !body.proposedDate) {
    return c.json({ error: "type, targetShiftId and proposedDate are required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await appendRow(c.env, TAB, [
    id,
    body.type,
    user.memberId,
    body.targetShiftId,
    body.proposedDate,
    body.reason ?? "",
    "pending",
    "",
    now,
    now,
  ]);

  await sendSlackMessage(
    c.env,
    `:bell: ${user.name} さんから${
      body.type === "swap" ? "交換" : "変更"
    }申請が届きました。希望日: ${body.proposedDate}\n理由: ${body.reason ?? "(未記入)"}`
  );

  return c.json({ id }, 201);
});

async function setRequestStatus(
  env: Env,
  requestId: string,
  status: RequestStatus,
  approverId: string
): Promise<{ request: ShiftChangeRequest; rowNumber: number } | null> {
  const rows = await readTable(env, TAB);
  const target = rows.find((r) => r.record.id === requestId);
  if (!target) return null;

  const now = new Date().toISOString();
  const r = target.record;
  await updateRow(env, TAB, target.rowNumber, [
    r.id,
    r.type,
    r.requester_id,
    r.target_shift_id,
    r.proposed_date,
    r.reason,
    status,
    approverId,
    r.created_at,
    now,
  ]);

  return { request: toRequest({ ...r, status, approver_id: approverId, updated_at: now }), rowNumber: target.rowNumber };
}

requestRoutes.post("/:id/approve", requireAuth, requireAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing id" }, 400);
  const result = await setRequestStatus(c.env, id, "approved", user.memberId);
  if (!result) return c.json({ error: "not found" }, 404);

  // change申請の場合、対象シフトの日付を提案日に更新する
  if (result.request.type === "change") {
    const shiftRows = await readTable(c.env, SHIFTS_TAB);
    const shift = shiftRows.find((r) => r.record.id === result.request.targetShiftId);
    if (shift) {
      await updateRow(c.env, SHIFTS_TAB, shift.rowNumber, [
        shift.record.id,
        result.request.proposedDate,
        shift.record.member_id,
        shift.record.type,
        "confirmed",
        user.memberId,
        new Date().toISOString(),
      ]);
    }
  }

  const members = await getMembers(c.env);
  const requester = members.find((m) => m.id === result.request.requesterId);
  await sendSlackMessage(
    c.env,
    `:white_check_mark: ${requester?.name ?? result.request.requesterId} さんの申請が承認されました(${result.request.proposedDate})`
  );

  return c.json(result.request);
});

requestRoutes.post("/:id/reject", requireAuth, requireAdmin, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing id" }, 400);
  const result = await setRequestStatus(c.env, id, "rejected", user.memberId);
  if (!result) return c.json({ error: "not found" }, 404);

  const members = await getMembers(c.env);
  const requester = members.find((m) => m.id === result.request.requesterId);
  await sendSlackMessage(
    c.env,
    `:x: ${requester?.name ?? result.request.requesterId} さんの申請が却下されました(${result.request.proposedDate})`
  );

  return c.json(result.request);
});
