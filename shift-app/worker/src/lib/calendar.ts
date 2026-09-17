import type { Env } from "../types";
import { getServiceAccountAccessToken } from "./googleAuth";

/**
 * 確定シフトをメンバーのGoogleカレンダーに反映する(Phase 4)。
 * 前提: 対象メンバーがサービスアカウントのメールアドレスに
 * カレンダーの「予定の変更」権限を共有していること。
 * 失敗してもシフト確定自体は失敗させない(呼び出し側でcatchする想定)。
 */
export async function upsertCalendarEvent(
  env: Env,
  params: { calendarId: string; shiftId: string; date: string; summary: string }
): Promise<void> {
  const token = await getServiceAccountAccessToken(env);
  // Calendar APIのカスタムイベントIDは [a-v0-9]{5,1024} のみ許可されるため、
  // UUIDのハイフンを除去して流用する(a-fはa-vの範囲に含まれる)。
  const eventId = params.shiftId.replace(/-/g, "");
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    params.calendarId
  )}/events`;
  const body = {
    summary: params.summary,
    start: { date: params.date },
    end: { date: params.date },
  };

  const updateRes = await fetch(`${base}/${eventId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (updateRes.ok) return;
  if (updateRes.status !== 404) {
    throw new Error(`Calendar update failed: ${updateRes.status} ${await updateRes.text()}`);
  }

  const insertRes = await fetch(base, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, id: eventId }),
  });
  if (!insertRes.ok) {
    throw new Error(`Calendar insert failed: ${insertRes.status} ${await insertRes.text()}`);
  }
}
