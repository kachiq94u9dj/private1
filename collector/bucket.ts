// 時間区間を Mac のローカル時刻で「日付 × 時」に分割する純粋関数群（テスト対象）。

export interface HourBucket {
  date: string;
  hour: number;
  seconds: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateHour(ms: number): { date: string; hour: number } {
  return { date: localDate(ms), hour: new Date(ms).getHours() };
}

/** [startMs, endMs) をローカル時刻の1時間ごとに分割する */
export function splitByHour(startMs: number, endMs: number): HourBucket[] {
  const out: HourBucket[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const boundary = new Date(cursor);
    boundary.setMinutes(0, 0, 0);
    boundary.setHours(boundary.getHours() + 1);
    const next = Math.min(boundary.getTime(), endMs);
    const { date, hour } = localDateHour(cursor);
    out.push({ date, hour, seconds: (next - cursor) / 1000 });
    cursor = next;
  }
  return out;
}

/** (deviceId, date, hour, type, key, source) ごとに秒数を足し合わせる */
export class UsageAccumulator<K extends string> {
  private map = new Map<string, number>();

  add(parts: [string, string, number, string, string, K], seconds: number): void {
    if (!(seconds > 0)) return;
    const key = parts.join("\u0000");
    this.map.set(key, (this.map.get(key) ?? 0) + seconds);
  }

  addInterval(deviceId: string, type: string, key: string, source: K, startMs: number, endMs: number): void {
    for (const b of splitByHour(startMs, endMs)) this.add([deviceId, b.date, b.hour, type, key, source], b.seconds);
  }

  entries(): { deviceId: string; date: string; hour: number; type: string; key: string; source: K; seconds: number }[] {
    return [...this.map.entries()].map(([k, seconds]) => {
      const [deviceId, date, hour, type, key, source] = k.split("\u0000");
      return { deviceId, date, hour: Number(hour), type, key, source: source as K, seconds: Math.min(Math.round(seconds), 3600) };
    });
  }
}

/**
 * Chrome の訪問履歴から「実際に見ていた時間」を概算する。
 * visit_duration はタブを閉じる/遷移するまでの時間でバックグラウンドのタブも含むため、
 * 各訪問は「次の訪問が始まるまで」かつ上限 maxMs までとして扱う（重複タブの二重計上を防ぐ）。
 */
export function chromeIntervals(
  visits: { startMs: number; durationMs: number; domain: string }[],
  maxMs = 30 * 60 * 1000,
): { domain: string; startMs: number; endMs: number }[] {
  const sorted = [...visits].sort((a, b) => a.startMs - b.startMs);
  const out: { domain: string; startMs: number; endMs: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].startMs : Infinity;
    const end = Math.min(v.startMs + Math.min(v.durationMs, maxMs), nextStart);
    if (end > v.startMs) out.push({ domain: v.domain, startMs: v.startMs, endMs: end });
  }
  return out;
}

export function domainOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** 端末名や bundle id から端末の種類を推定する */
export function guessPlatform(name: string | null, bundleIds: Iterable<string>): "mac" | "iphone" | "ipad" | "unknown" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("iphone")) return "iphone";
  if (n.includes("ipad")) return "ipad";
  if (/mac|imac|macbook/.test(n)) return "mac";
  const ids = new Set(bundleIds);
  if (ids.has("com.apple.finder") || ids.has("com.apple.Terminal") || ids.has("com.apple.systempreferences")) return "mac";
  if (ids.has("com.apple.mobilesafari") || ids.has("com.apple.springboard") || ids.has("com.apple.MobileSMS")) return "iphone";
  return "unknown";
}
