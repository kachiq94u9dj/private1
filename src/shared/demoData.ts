// デモ / ローカル開発用のダミーデータ。実在の利用履歴ではない。
// scripts/seed-demo.ts（Node から直接実行）でも使うため、値の import は持たない。
import type { DeviceInfo, PickupRow, UsageRow } from "./types";

export const DEMO_MAC: DeviceInfo = { id: "mac:DEMO", name: "MacBook Pro", platform: "mac" };
export const DEMO_PHONE: DeviceInfo = { id: "st:DEMO-PHONE", name: "iPhone", platform: "iphone" };

// bundle id, 表示名, カテゴリ（空はブラウザ）, 勤務時間帯の1時間あたり平均分数
const APPS: [string, string, string, number][] = [
  ["com.microsoft.VSCode", "Visual Studio Code", "dev", 22],
  ["com.googlecode.iterm2", "iTerm2", "dev", 8],
  ["com.google.Chrome", "Google Chrome", "", 18],
  ["com.tinyspeck.slackmacgap", "Slack", "communication", 7],
  ["us.zoom.xos", "zoom.us", "communication", 4],
  ["notion.id", "Notion", "work", 5],
  ["com.figma.Desktop", "Figma", "work", 3],
  ["com.apple.finder", "Finder", "utility", 2],
  ["com.spotify.client", "Spotify", "entertainment", 1],
];
const SITES: [string, string, string, number][] = [
  ["github.com", "GitHub", "dev", 5],
  ["stackoverflow.com", "Stack Overflow", "learning", 2],
  ["developer.mozilla.org", "MDN", "learning", 2],
  ["x.com", "X", "sns", 3],
  ["youtube.com", "YouTube", "entertainment", 3],
  ["docs.google.com", "Google ドキュメント", "work", 2],
  ["zenn.dev", "Zenn", "learning", 1],
];
const PHONE_APPS: [string, string, string, number][] = [
  ["com.burbn.instagram", "Instagram", "sns", 8],
  ["com.atebits.Tweetie2", "X", "sns", 6],
  ["jp.naver.line", "LINE", "communication", 5],
  ["com.google.ios.youtube", "YouTube", "entertainment", 9],
  ["com.apple.mobilesafari", "Safari", "", 3],
];

function addDaysLocal(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DemoData {
  devices: DeviceInfo[];
  rows: UsageRow[];
  pickups: PickupRow[];
  items: { type: "app" | "web"; key: string; name: string; category: string | null }[];
}

/** today（YYYY-MM-DD）までの days 日ぶん。nowHour 以降の「今日」の時間は生成しない。 */
export function generateDemoData(today: string, nowHour: number, days = 25): DemoData {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const rows: UsageRow[] = [];
  const pickups: PickupRow[] = [];
  const mac = DEMO_MAC.id;
  const phone = DEMO_PHONE.id;

  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysLocal(today, -i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    for (let hour = 0; hour < 24; hour++) {
      if (date === today && hour > nowHour) break;
      const work = !weekend && hour >= 9 && hour <= 18 && hour !== 12;
      const evening = hour >= 20 && hour <= 23;
      const late = hour <= 1;
      const macActive = work ? 0.95 : evening ? 0.5 : weekend && hour >= 13 && hour <= 17 ? 0.4 : 0;
      let chromeSec = 0;
      for (const [key, , , perHour] of APPS) {
        const factor = work ? 1 : key.includes("spotify") || key.includes("Chrome") ? 1.2 : 0.3;
        const sec = Math.round(perHour * 60 * factor * macActive * (0.6 + rand() * 0.8));
        if (sec > 30) rows.push({ deviceId: mac, date, hour, type: "app", key, seconds: Math.min(sec, 3600), source: "screentime" });
        if (key === "com.google.Chrome") chromeSec = sec;
      }
      if (chromeSec > 0) {
        for (const [key, , , weight] of SITES) {
          const boost = !work && (key === "x.com" || key === "youtube.com") ? 3 : 1;
          const sec = Math.round(chromeSec * ((weight * boost) / 18) * (0.5 + rand()));
          if (sec > 30) rows.push({ deviceId: mac, date, hour, type: "web", key, seconds: Math.min(sec, 3600), source: "chrome" });
        }
      }
      const phoneActive = evening || late ? 0.9 : hour === 12 || hour === 8 ? 0.7 : work ? 0.15 : hour >= 7 ? 0.4 : 0;
      for (const [key, , , perHour] of PHONE_APPS) {
        const sec = Math.round(perHour * 60 * phoneActive * (0.4 + rand() * 1.2));
        if (sec > 30) rows.push({ deviceId: phone, date, hour, type: "app", key, seconds: Math.min(sec, 3600), source: "screentime" });
      }
    }
    pickups.push({ deviceId: phone, date, pickups: 40 + Math.round(rand() * 60), notifications: 80 + Math.round(rand() * 120) });
  }

  const items = [
    ...APPS.map(([key, name, cat]) => ({ type: "app" as const, key, name, category: cat || null })),
    ...SITES.map(([key, name, cat]) => ({ type: "web" as const, key, name, category: cat })),
    ...PHONE_APPS.map(([key, name, cat]) => ({ type: "app" as const, key, name, category: cat || null })),
  ];
  return { devices: [DEMO_PHONE, DEMO_MAC], rows, pickups, items };
}
