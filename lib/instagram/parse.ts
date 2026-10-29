// Instagram 公式「情報をダウンロード」(HTML形式) のファイルから、友達情報だけを取り出す。
// DMは件数と最終日時だけを数え、本文は返さない（Supabaseに送らないため）。
// ブラウザでもNodeでも動くよう、DOMに依存せず文字列処理で解析する。

export interface ExportFile {
  path: string;
  html: string;
}

export interface ParsedFriend {
  username: string;
  isFollower: boolean;
  isFollowing: boolean;
  followedMeAt: string | null;
  iFollowedAt: string | null;
  dmCount: number;
  lastDmAt: string | null;
}

export interface ParseResult {
  friends: ParsedFriend[];
  followerFiles: number;
  followingFiles: number;
  dmThreads: number;
  dmThreadsMatched: number;
  dmThreadsGroup: number;
  unmatchedThreads: string[];
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const RESERVED_PATHS = new Set(["accounts", "explore", "p", "reel", "reels", "stories", "direct", "about", "legal"]);

const PROFILE_LINK_RE = /href="https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?"/g;

const EN_DATE_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2})(?::\d{2})? ?([ap]\.?m\.?)?/gi;
const JA_DATE_RE = /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(午前|午後)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(午前|午後)?/g;
const JA_MONTH_FIRST_RE = /(\d{1,2})月 ?(\d{1,2}), ?(\d{4}),? (\d{1,2}):(\d{2})(?::\d{2})? ?(午前|午後|[ap]m)?/gi;

function to24h(hour: number, meridiem: string | undefined): number {
  if (!meridiem) return hour;
  const pm = /^(p|午後)/i.test(meridiem);
  const am = /^(a|午前)/i.test(meridiem);
  if (pm && hour < 12) return hour + 12;
  if (am && hour === 12) return 0;
  return hour;
}

function toIso(y: number, m: number, d: number, h: number, min: number): string | null {
  const date = new Date(y, m, d, h, min);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** テキスト中に現れる日時をすべて（出現順に）ISO文字列で返す。 */
export function extractDates(text: string): string[] {
  const found: { index: number; iso: string }[] = [];
  for (const m of text.matchAll(EN_DATE_RE)) {
    const iso = toIso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], to24h(+m[4], m[6]), +m[5]);
    if (iso) found.push({ index: m.index ?? 0, iso });
  }
  for (const m of text.matchAll(JA_DATE_RE)) {
    const iso = toIso(+m[1], +m[2] - 1, +m[3], to24h(+m[5], m[4] ?? m[7]), +m[6]);
    if (iso) found.push({ index: m.index ?? 0, iso });
  }
  for (const m of text.matchAll(JA_MONTH_FIRST_RE)) {
    const iso = toIso(+m[3], +m[1] - 1, +m[2], to24h(+m[4], m[6]), +m[5]);
    if (iso) found.push({ index: m.index ?? 0, iso });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.iso);
}

function stripTags(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

/** フォロワー/フォロー中のHTMLから (ユーザー名, 日時) の一覧を取り出す。 */
export function parseConnectionList(html: string): { username: string; at: string | null }[] {
  const links = [...html.matchAll(PROFILE_LINK_RE)];
  const result: { username: string; at: string | null }[] = [];
  const seen = new Set<string>();
  links.forEach((m, i) => {
    const username = m[1].toLowerCase();
    if (RESERVED_PATHS.has(username) || seen.has(username)) return;
    seen.add(username);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < links.length ? links[i + 1].index ?? html.length : html.length;
    const [at] = extractDates(stripTags(html.slice(start, end)));
    result.push({ username, at: at ?? null });
  });
  return result;
}

function isFollowersFile(path: string): boolean {
  return /(^|\/)followers(_\d+)?\.html$/i.test(path);
}

function isFollowingFile(path: string): boolean {
  return /(^|\/)following\.html$/i.test(path);
}

function inboxThreadFolder(path: string): string | null {
  const m = path.match(/(?:^|\/)messages\/inbox\/([^/]+)\/message_\d+\.html$/i);
  return m ? m[1] : null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** スレッドHTMLの参加者数。読み取れなければ null。 */
function participantCount(html: string): number | null {
  const m = html.match(/(?:Participants|参加者)\s*[:：]\s*([^<]+)</);
  if (!m) return null;
  return m[1].split(/,|、/).map((s) => s.trim()).filter(Boolean).length;
}

export function parseExport(files: ExportFile[]): ParseResult {
  const friends = new Map<string, ParsedFriend>();
  const get = (username: string): ParsedFriend => {
    let f = friends.get(username);
    if (!f) {
      f = { username, isFollower: false, isFollowing: false, followedMeAt: null, iFollowedAt: null, dmCount: 0, lastDmAt: null };
      friends.set(username, f);
    }
    return f;
  };

  let followerFiles = 0;
  let followingFiles = 0;
  const threads = new Map<string, { count: number; last: string | null; participants: number | null }>();

  for (const file of files) {
    if (isFollowersFile(file.path)) {
      followerFiles++;
      for (const { username, at } of parseConnectionList(file.html)) {
        const f = get(username);
        f.isFollower = true;
        f.followedMeAt = f.followedMeAt ?? at;
      }
    } else if (isFollowingFile(file.path)) {
      followingFiles++;
      for (const { username, at } of parseConnectionList(file.html)) {
        const f = get(username);
        f.isFollowing = true;
        f.iFollowedAt = f.iFollowedAt ?? at;
      }
    } else {
      const folder = inboxThreadFolder(file.path);
      if (!folder) continue;
      const text = stripTags(file.html);
      const dates = extractDates(text);
      const t = threads.get(folder) ?? { count: 0, last: null, participants: null };
      t.count += dates.length;
      for (const d of dates) if (!t.last || d > t.last) t.last = d;
      t.participants = t.participants ?? participantCount(file.html);
      threads.set(folder, t);
    }
  }

  // DMのフォルダ名（例: "taro.yamada_123456789"）を既知のユーザー名に対応付ける。
  const byNormalized = new Map<string, string | null>();
  for (const username of friends.keys()) {
    const key = normalize(username);
    byNormalized.set(key, byNormalized.has(key) ? null : username);
  }

  let dmThreadsMatched = 0;
  let dmThreadsGroup = 0;
  const unmatchedThreads: string[] = [];
  for (const [folder, t] of threads) {
    if (t.participants !== null && t.participants > 2) {
      dmThreadsGroup++;
      continue;
    }
    const prefix = folder.replace(/_\d+$/, "");
    const username = byNormalized.get(normalize(prefix));
    if (!username) {
      unmatchedThreads.push(prefix);
      continue;
    }
    const f = get(username);
    f.dmCount += t.count;
    if (t.last && (!f.lastDmAt || t.last > f.lastDmAt)) f.lastDmAt = t.last;
    dmThreadsMatched++;
  }

  return {
    friends: [...friends.values()].sort((a, b) => a.username.localeCompare(b.username)),
    followerFiles,
    followingFiles,
    dmThreads: threads.size,
    dmThreadsMatched,
    dmThreadsGroup,
    unmatchedThreads,
  };
}

/** ZIP内のパスのうち、解析に必要なHTMLかどうか。 */
export function isRelevantPath(path: string): boolean {
  return isFollowersFile(path) || isFollowingFile(path) || inboxThreadFolder(path) !== null;
}
