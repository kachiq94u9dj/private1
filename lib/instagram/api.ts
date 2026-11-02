// Supabase への読み書きをまとめたもの。画面側はここの関数だけを呼ぶ。
import {
  getBrowserClient,
  type IgAttendeeRow,
  type IgEventRow,
  type IgFriendRow,
  type IgFriendTagRow,
  type IgTagRow,
  type TagKind,
} from "@/lib/supabase";
import type { ParseResult } from "./parse";

const CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message);
  return res;
}

// Supabaseは1リクエスト最大1000行なので、ページングして全件読む。
async function fetchAll<T>(table: string, order: string): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data } = check(
      await getBrowserClient()
        .from(table)
        .select("*")
        .order(order)
        .range(from, from + pageSize - 1),
    );
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

export interface InstagramData {
  friends: IgFriendRow[];
  tags: IgTagRow[];
  friendTags: IgFriendTagRow[];
  events: IgEventRow[];
  attendees: IgAttendeeRow[];
}

export async function loadAll(): Promise<InstagramData> {
  const [friends, tags, friendTags, events, attendees] = await Promise.all([
    fetchAll<IgFriendRow>("ig_friends", "username"),
    fetchAll<IgTagRow>("ig_tags", "created_at"),
    fetchAll<IgFriendTagRow>("ig_friend_tags", "friend_id"),
    fetchAll<IgEventRow>("ig_events", "created_at"),
    fetchAll<IgAttendeeRow>("ig_event_attendees", "updated_at"),
  ]);
  return { friends, tags, friendTags, events, attendees };
}

export async function sendLoginLink(email: string, redirectTo: string): Promise<void> {
  const { error } = await getBrowserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await getBrowserClient().auth.signOut();
}

/**
 * 解析結果を保存する。メモ・タグ・イベント記録は残し、今回出てこない人は「つながりなし」に更新する。
 * 表示名は、まだ空の人にだけ DM のスレッド名を入れる（手で直した名前は上書きしない）。
 * 戻り値は「つながりが無くなった」人数。
 */
export async function saveImport(ownerId: string, result: ParseResult, existing: IgFriendRow[]): Promise<number> {
  const supabase = getBrowserClient();
  const now = new Date().toISOString();
  const byUsername = new Map(existing.map((f) => [f.username, f]));
  const rows = result.friends.map((f) => ({
    owner_id: ownerId,
    username: f.username,
    display_name: byUsername.get(f.username)?.display_name || f.displayName || "",
    is_follower: f.isFollower,
    is_following: f.isFollowing,
    followed_me_at: f.followedMeAt,
    i_followed_at: f.iFollowedAt,
    dm_count: f.dmCount,
    last_dm_at: f.lastDmAt,
    imported_at: now,
  }));
  for (const batch of chunks(rows, CHUNK)) {
    check(await supabase.from("ig_friends").upsert(batch, { onConflict: "owner_id,username" }));
  }

  const present = new Set(result.friends.map((f) => f.username));
  const gone = existing.filter((f) => !present.has(f.username) && (f.is_follower || f.is_following));
  for (const batch of chunks(gone.map((f) => f.id), CHUNK)) {
    check(
      await supabase
        .from("ig_friends")
        .update({ is_follower: false, is_following: false, imported_at: now })
        .in("id", batch),
    );
  }
  return gone.length;
}

export interface FriendProfile {
  display_name: string;
  met_where: string;
  last_met_on: string | null;
  note: string;
}

/** 友達のプロフィールと付いているタグをまとめて保存する。 */
export async function updateFriend(friendId: string, profile: FriendProfile, tagIds: string[]): Promise<void> {
  const supabase = getBrowserClient();
  check(await supabase.from("ig_friends").update(profile).eq("id", friendId));
  check(await supabase.from("ig_friend_tags").delete().eq("friend_id", friendId));
  if (tagIds.length > 0) {
    check(await supabase.from("ig_friend_tags").insert(tagIds.map((tag_id) => ({ friend_id: friendId, tag_id }))));
  }
}

export async function createTag(name: string, kind: TagKind, color: string): Promise<void> {
  check(await getBrowserClient().from("ig_tags").insert({ name, kind, color }));
}

export async function deleteTag(tagId: string): Promise<void> {
  check(await getBrowserClient().from("ig_tags").delete().eq("id", tagId));
}

export interface EventDraft {
  title: string;
  event_date: string;
  start_time: string;
  location: string;
  fee: string;
  currency: string;
  capacity: string;
  note: string;
}

function eventRow(draft: EventDraft) {
  const toInt = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))));
  return {
    title: draft.title.trim(),
    event_date: draft.event_date || null,
    start_time: draft.start_time || null,
    location: draft.location,
    fee: toInt(draft.fee),
    currency: draft.currency.trim() || "RM",
    capacity: toInt(draft.capacity) || null,
    note: draft.note,
  };
}

export async function createEvent(draft: EventDraft): Promise<string> {
  const { data } = check(await getBrowserClient().from("ig_events").insert(eventRow(draft)).select("id").single());
  return (data as { id: string }).id;
}

export async function updateEvent(eventId: string, draft: EventDraft): Promise<void> {
  check(await getBrowserClient().from("ig_events").update(eventRow(draft)).eq("id", eventId));
}

export async function deleteEvent(eventId: string): Promise<void> {
  check(await getBrowserClient().from("ig_events").delete().eq("id", eventId));
}

/** 友達をイベントの招待リストに追加する（まだ誘っていない状態）。既に追加済みの人はそのまま。 */
export async function addAttendees(eventId: string, friendIds: string[]): Promise<void> {
  const rows = friendIds.map((friend_id) => ({ event_id: eventId, friend_id }));
  for (const batch of chunks(rows, CHUNK)) {
    check(
      await getBrowserClient()
        .from("ig_event_attendees")
        .upsert(batch, { onConflict: "event_id,friend_id", ignoreDuplicates: true }),
    );
  }
}

export type AttendeePatch = Partial<Pick<IgAttendeeRow, "invited" | "reply" | "attended" | "paid" | "note">>;

export async function updateAttendee(eventId: string, friendId: string, patch: AttendeePatch): Promise<void> {
  check(
    await getBrowserClient()
      .from("ig_event_attendees")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .match({ event_id: eventId, friend_id: friendId }),
  );
}

export async function removeAttendee(eventId: string, friendId: string): Promise<void> {
  check(
    await getBrowserClient()
      .from("ig_event_attendees")
      .delete()
      .match({ event_id: eventId, friend_id: friendId }),
  );
}
