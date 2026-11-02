// 画面に依存しない絞り込み・集計ロジックと表示用の文言。
import type { IgAttendeeRow, IgEventRow, IgFriendRow, IgFriendTagRow, IgTagRow, Reply } from "@/lib/supabase";

// ---- タグの色 ----

export interface TagColor {
  label: string;
  fg: string;
  bg: string;
  dot: string;
}

export const TAG_COLORS: Record<string, TagColor> = {
  red: { label: "赤", fg: "#b33a1b", bg: "#fde5dc", dot: "#c0442a" },
  green: { label: "緑", fg: "#2c6e35", bg: "#ddefdc", dot: "#2f7d3c" },
  blue: { label: "青", fg: "#2457a6", bg: "#e1eafa", dot: "#2f62b8" },
  purple: { label: "紫", fg: "#6a3ea1", bg: "#ece2f7", dot: "#6f42a8" },
  yellow: { label: "黄", fg: "#855800", bg: "#fbecc6", dot: "#8f6206" },
  teal: { label: "青緑", fg: "#12706a", bg: "#dbf0ee", dot: "#14716b" },
  pink: { label: "桃", fg: "#a3306a", bg: "#fbe2ee", dot: "#b13a76" },
  gray: { label: "灰", fg: "#55524c", bg: "#ebe9e4", dot: "#7a766e" },
};

export function tagColor(tag: IgTagRow | undefined): TagColor {
  return TAG_COLORS[tag?.color ?? ""] ?? TAG_COLORS.gray;
}

// ---- 友達 ----

export function displayName(f: IgFriendRow): string {
  return f.display_name.trim() || f.username;
}

/** アバターに出す文字。日本語名は名の1文字目（佐藤 美咲 → 美）、英字名は最初と最後の語の頭文字（Wei Jie Lim → WL）。 */
export function avatarLabel(f: IgFriendRow): string {
  const name = f.display_name.trim();
  if (!name) return f.username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  const parts = name.split(/\s+/);
  if (/^[\x00-\x7F]+$/.test(name)) {
    const first = parts[0][0];
    const last = parts.length > 1 ? parts[parts.length - 1][0] : parts[0][1] ?? "";
    return (first + last).toUpperCase();
  }
  return [...parts[parts.length - 1]][0];
}

export function relationLabel(f: IgFriendRow): string {
  if (f.is_follower && f.is_following) return "相互フォロー";
  if (f.is_follower) return "フォロワー";
  if (f.is_following) return "フォロー中";
  return "つながりなし";
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

export interface FriendView {
  friend: IgFriendRow;
  communities: IgTagRow[];
  attributes: IgTagRow[];
  invitedCount: number;
  joinedCount: number;
  /** 手入力の「最後に会った日」と、出席したイベントの日付のうち新しい方。 */
  lastMet: string | null;
  /** 招待リストに入っている、これからのイベント（一覧の並びで先頭のもの）。 */
  upcomingEvent: IgEventRow | null;
}

export function buildFriendViews(
  friends: IgFriendRow[],
  tags: IgTagRow[],
  friendTags: IgFriendTagRow[],
  events: IgEventRow[],
  attendees: IgAttendeeRow[],
  today: string,
): FriendView[] {
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const eventById = new Map(events.map((e) => [e.id, e]));
  const tagsByFriend = new Map<string, IgTagRow[]>();
  for (const ft of friendTags) {
    const tag = tagById.get(ft.tag_id);
    if (!tag) continue;
    const list = tagsByFriend.get(ft.friend_id) ?? [];
    list.push(tag);
    tagsByFriend.set(ft.friend_id, list);
  }
  const attendByFriend = new Map<string, IgAttendeeRow[]>();
  for (const a of attendees) {
    const list = attendByFriend.get(a.friend_id) ?? [];
    list.push(a);
    attendByFriend.set(a.friend_id, list);
  }

  return friends.map((friend) => {
    const own = (tagsByFriend.get(friend.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const rows = attendByFriend.get(friend.id) ?? [];
    let lastMet = friend.last_met_on;
    let upcomingEvent: IgEventRow | null = null;
    for (const a of rows) {
      const ev = eventById.get(a.event_id);
      if (!ev) continue;
      if (a.attended && ev.event_date && (!lastMet || ev.event_date > lastMet)) lastMet = ev.event_date;
      if (!isEnded(ev, today) && (!upcomingEvent || compareEvents(ev, upcomingEvent) > 0)) upcomingEvent = ev;
    }
    return {
      friend,
      communities: own.filter((t) => t.kind === "community"),
      attributes: own.filter((t) => t.kind === "attribute"),
      invitedCount: rows.filter((a) => a.invited).length,
      joinedCount: rows.filter((a) => a.attended || a.reply === "yes").length,
      lastMet,
      upcomingEvent,
    };
  });
}

export interface FriendFilter {
  query: string;
  communityId: string | null;
  attributeIds: string[];
}

export function filterFriendViews(views: FriendView[], filter: FriendFilter): FriendView[] {
  const q = filter.query.trim().toLowerCase().replace(/^@/, "");
  return views
    .filter((v) => {
      if (filter.communityId && !v.communities.some((t) => t.id === filter.communityId)) return false;
      if (!filter.attributeIds.every((id) => v.attributes.some((t) => t.id === id))) return false;
      if (!q) return true;
      const f = v.friend;
      return (
        f.username.includes(q) ||
        f.display_name.toLowerCase().includes(q) ||
        f.note.toLowerCase().includes(q) ||
        f.met_where.toLowerCase().includes(q) ||
        [...v.communities, ...v.attributes].some((t) => t.name.toLowerCase().includes(q))
      );
    })
    .sort(
      (a, b) =>
        (b.lastMet ?? "").localeCompare(a.lastMet ?? "") ||
        Number(!!b.friend.display_name) - Number(!!a.friend.display_name) ||
        (b.friend.last_dm_at ?? "").localeCompare(a.friend.last_dm_at ?? "") ||
        a.friend.username.localeCompare(b.friend.username),
    );
}

export function tagCounts(friendTags: IgFriendTagRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const ft of friendTags) map.set(ft.tag_id, (map.get(ft.tag_id) ?? 0) + 1);
  return map;
}

// ---- 日付 ----

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 「10月12日」。今年でなければ「2025年10月12日」。 */
export function formatMonthDay(ymd: string | null): string {
  if (!ymd) return "—";
  const d = parseDate(ymd);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- イベント ----

export function isEnded(e: IgEventRow, today: string): boolean {
  return !!e.event_date && e.event_date < today;
}

/** 日付の古い順（日付未定は一番新しい扱い）。 */
export function compareEvents(a: IgEventRow, b: IgEventRow): number {
  return (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999") || a.created_at.localeCompare(b.created_at);
}

/** 一覧の並び: 日付の新しい順（デザインどおり、これからのイベントが上に来る）。 */
export function sortEvents(events: IgEventRow[]): IgEventRow[] {
  return [...events].sort((a, b) => compareEvents(b, a));
}

/** 「11/21(土)」 */
export function formatEventShort(e: IgEventRow): string {
  if (!e.event_date) return "日付未定";
  const d = parseDate(e.event_date);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** 「2026年11月21日(土) 18:00」 */
export function formatEventLong(e: IgEventRow): string {
  if (!e.event_date) return "日付未定";
  const d = parseDate(e.event_date);
  const time = e.start_time ? ` ${e.start_time.slice(0, 5)}` : "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})${time}`;
}

export const REPLY_LABELS: Record<Reply, string> = { none: "未返信", yes: "参加", maybe: "未定", no: "不参加" };

/** 返事のセルをクリックしたときの切り替え順。 */
export const REPLY_CYCLE: Record<Reply, Reply> = { none: "yes", yes: "maybe", maybe: "no", no: "none" };

export interface EventSummary {
  listed: number;
  invited: number;
  notInvited: number;
  yes: number;
  maybe: number;
  noReply: number;
  attended: number;
  paid: number;
  unpaid: number;
}

export function summarize(rows: IgAttendeeRow[]): EventSummary {
  const yes = rows.filter((a) => a.reply === "yes");
  return {
    listed: rows.length,
    invited: rows.filter((a) => a.invited).length,
    notInvited: rows.filter((a) => !a.invited).length,
    yes: yes.length,
    maybe: rows.filter((a) => a.invited && a.reply === "maybe").length,
    noReply: rows.filter((a) => a.invited && a.reply === "none").length,
    attended: rows.filter((a) => a.attended).length,
    paid: yes.filter((a) => a.paid).length,
    unpaid: yes.filter((a) => !a.paid).length,
  };
}

export type InviteFilter = "all" | "not_invited" | "no_reply" | "unpaid";

export const INVITE_FILTER_LABELS: Record<InviteFilter, string> = {
  all: "すべて",
  not_invited: "まだ誘ってない",
  no_reply: "未返信",
  unpaid: "未払い",
};

export function matchesInviteFilter(a: IgAttendeeRow, filter: InviteFilter): boolean {
  if (filter === "not_invited") return !a.invited;
  if (filter === "no_reply") return a.invited && a.reply === "none";
  if (filter === "unpaid") return a.reply === "yes" && !a.paid;
  return true;
}

export function inviteFilterCount(s: EventSummary, filter: InviteFilter): number {
  return { all: s.listed, not_invited: s.notInvited, no_reply: s.noReply, unpaid: s.unpaid }[filter];
}

export function formatMoney(amount: number, currency: string): string {
  return `${currency}${amount.toLocaleString()}`;
}
