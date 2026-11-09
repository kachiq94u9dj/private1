// 画面に依存しない絞り込み・集計ロジックと表示用の文言。
import type { IgAttendeeRow, IgEventRow, IgFriendRow, IgFriendTagRow, IgTagRow, PayMethod, Reply } from "@/lib/supabase";

// ---- タグの色 ----

export interface TagColor {
  label: string;
  fg: string;
  bg: string;
}

export const TAG_COLORS: Record<string, TagColor> = {
  red: { label: "赤", fg: "#9A3412", bg: "#FDE4D6" },
  green: { label: "緑", fg: "#166534", bg: "#DCF0E2" },
  blue: { label: "青", fg: "#1E4F91", bg: "#DFEAFB" },
  purple: { label: "紫", fg: "#5B2E91", bg: "#ECE3F7" },
  yellow: { label: "黄", fg: "#734D00", bg: "#FAEDC8" },
  teal: { label: "青緑", fg: "#0F5959", bg: "#D9EFEF" },
  pink: { label: "桃", fg: "#9D2463", bg: "#FBE2EE" },
  gray: { label: "灰", fg: "#4A4640", bg: "#EFEDE9" },
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
  /** 招待リストに入っているイベントの数。 */
  invitedCount: number;
  /** 出席した、またはこれからのイベントに「参加」と返事した数。 */
  joinedCount: number;
  /** 手入力の「最後に会った日」と、出席したイベントの日付のうち新しい方。 */
  lastMet: string | null;
  /** 招待リストに入っているイベントの ID。 */
  eventIds: Set<string>;
}

export function historyLabel(v: FriendView): string {
  return v.invitedCount > 0 ? `招待 ${v.invitedCount}回 · 参加 ${v.joinedCount}回` : "まだ誘っていません";
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
    const rows = (attendByFriend.get(friend.id) ?? []).filter((a) => eventById.has(a.event_id));
    let lastMet = friend.last_met_on;
    let joinedCount = 0;
    for (const a of rows) {
      const ev = eventById.get(a.event_id)!;
      if (a.attended && ev.event_date && (!lastMet || ev.event_date > lastMet)) lastMet = ev.event_date;
      if (a.attended || (a.reply === "yes" && !isEnded(ev, today))) joinedCount++;
    }
    return {
      friend,
      communities: own.filter((t) => t.kind === "community"),
      attributes: own.filter((t) => t.kind === "attribute"),
      invitedCount: rows.length,
      joinedCount,
      lastMet,
      eventIds: new Set(rows.map((a) => a.event_id)),
    };
  });
}

export interface FriendFilter {
  query: string;
  communityId: string | null;
  attributeId: string | null;
}

export const EMPTY_FRIEND_FILTER: FriendFilter = { query: "", communityId: null, attributeId: null };

export function filterFriendViews(views: FriendView[], filter: FriendFilter): FriendView[] {
  const q = filter.query.trim().toLowerCase().replace(/^@/, "");
  return views
    .filter((v) => {
      if (filter.communityId && !v.communities.some((t) => t.id === filter.communityId)) return false;
      if (filter.attributeId && !v.attributes.some((t) => t.id === filter.attributeId)) return false;
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

/** 「11/21(土)」 */
export function formatShortDate(ymd: string | null): string {
  if (!ymd) return "日付未定";
  const d = parseDate(ymd);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** 「2026年11月21日(土) 18:00」 */
export function formatLongDate(ymd: string | null, time: string | null): string {
  if (!ymd) return "日付未定";
  const d = parseDate(ymd);
  const t = time ? ` ${time.slice(0, 5)}` : "";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})${t}`;
}

// ---- イベント ----

export function isEnded(e: IgEventRow, today: string): boolean {
  return !!e.event_date && e.event_date < today;
}

/** 日付の古い順（日付未定は一番新しい扱い）。 */
export function compareEvents(a: IgEventRow, b: IgEventRow): number {
  return (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999") || a.created_at.localeCompare(b.created_at);
}

/** 一覧の並び: 日付の新しい順（これからのイベントが上に来る）。 */
export function sortEvents(events: IgEventRow[]): IgEventRow[] {
  return [...events].sort((a, b) => compareEvents(b, a));
}

export function formatFee(e: Pick<IgEventRow, "fee">): string {
  return e.fee === null ? "会費未設定" : e.fee > 0 ? `会費 RM${e.fee.toLocaleString()}` : "無料";
}

export const REPLY_LABELS: Record<Reply, string> = { none: "未返信", yes: "参加", maybe: "未定", no: "不参加" };

/** 返事のセルをクリックしたときの切り替え順。 */
export const REPLY_CYCLE: Record<Reply, Reply> = { none: "yes", yes: "maybe", maybe: "no", no: "none" };

export interface EventSummary {
  listed: number;
  invited: number;
  notInvited: number;
  going: number;
  maybe: number;
  noReply: number;
  came: number;
  paid: number;
  unpaid: number;
}

export function summarize(rows: IgAttendeeRow[]): EventSummary {
  return {
    listed: rows.length,
    invited: rows.filter((a) => a.invited).length,
    notInvited: rows.filter((a) => !a.invited).length,
    going: rows.filter((a) => a.reply === "yes").length,
    maybe: rows.filter((a) => a.reply === "maybe").length,
    noReply: rows.filter((a) => a.invited && a.reply === "none").length,
    came: rows.filter((a) => a.attended).length,
    paid: rows.filter((a) => a.paid).length,
    unpaid: rows.filter((a) => a.reply === "yes" && !a.paid).length,
  };
}

export function percent(n: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0;
}

export type InviteFilter = "all" | "not_invited" | "no_reply" | "unpaid";

export const INVITE_FILTERS: InviteFilter[] = ["all", "not_invited", "no_reply", "unpaid"];

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

// ---- イベント作成 ----

export const PAY_METHODS: PayMethod[] = ["cash", "transfer", "duitnow", "none"];

export const PAY_LABELS: Record<PayMethod, string> = {
  cash: "当日現金",
  transfer: "事前振込",
  duitnow: "DuitNow QR",
  none: "なし",
};

export interface EventTemplate {
  label: string;
  title: string;
  location: string;
  fee: string;
  capacity: string;
  startTime: string;
  payMethod: PayMethod;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  { label: "飲み会", title: "飲み会", location: "Bukit Bintang", fee: "80", capacity: "12", startTime: "20:00", payMethod: "cash" },
  { label: "BBQ", title: "BBQナイト", location: "Mont Kiara", fee: "60", capacity: "15", startTime: "18:00", payMethod: "transfer" },
  { label: "ボードゲーム会", title: "ボードゲーム会", location: "Bangsar South", fee: "25", capacity: "8", startTime: "14:00", payMethod: "duitnow" },
  { label: "朝ラン", title: "KLCC朝ラン", location: "KLCC公園", fee: "0", capacity: "20", startTime: "07:00", payMethod: "none" },
];

/** 入力内容から DM 用の招待メッセージを作る。 */
export function autoInviteMessage(d: {
  title: string;
  event_date: string;
  start_time: string;
  location: string;
  fee: string;
  capacity: string;
  pay_method: PayMethod;
}): string {
  const date = d.event_date ? formatLongDate(d.event_date, d.start_time || null) : "調整中";
  const fee =
    d.fee !== "" && Number(d.fee) > 0
      ? `RM${d.fee}${d.pay_method !== "none" ? `(${PAY_LABELS[d.pay_method]})` : ""}`
      : "無料";
  return [
    `${d.title.trim() || "イベント"}を開催します!`,
    `日時:${date}`,
    `場所:${d.location.trim() || "調整中"}`,
    `会費:${fee}`,
    ...(d.capacity ? [`定員:${d.capacity}人`] : []),
    "",
    "来られそうだったら返信ください!",
  ].join("\n");
}
