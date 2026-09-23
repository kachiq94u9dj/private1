// ローカル開発用: ダミーのスクリーンタイムデータを生成して /api/ingest に送る。
//   node scripts/seed-demo.ts [http://localhost:5173] [トークン]
// .dev.vars の DEV_ALLOW_NO_AUTH=true が前提（カテゴリ設定 API も叩くため）。
import { addDays, dateRange } from "../src/shared/time.ts";
import type { IngestPayload, UsageRow } from "../src/shared/types.ts";

const url = process.argv[2] ?? "http://localhost:5173";
const token = process.argv[3] ?? "local-dev-token";

const mac = { id: "mac:DEMO", name: "MacBook Pro", platform: "mac" as const };
const phone = { id: "st:DEMO-PHONE", name: "iPhone", platform: "iphone" as const };

const APPS: [string, string, string, number][] = [
  // bundle id, 名前, カテゴリ, 1時間あたりの平均分数（勤務時間帯）
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
const SITES: [string, string, number][] = [
  ["github.com", "dev", 5],
  ["stackoverflow.com", "learning", 2],
  ["developer.mozilla.org", "learning", 2],
  ["x.com", "sns", 3],
  ["youtube.com", "entertainment", 3],
  ["docs.google.com", "work", 2],
  ["zenn.dev", "learning", 1],
];
const PHONE_APPS: [string, string, number][] = [
  ["com.burbn.instagram", "sns", 8],
  ["com.atebits.Tweetie2", "sns", 6],
  ["jp.naver.line", "communication", 5],
  ["com.google.ios.youtube", "entertainment", 9],
  ["com.apple.mobilesafari", "", 3],
];

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const today = new Date().toLocaleDateString("sv-SE");
const dates = dateRange(addDays(today, -24), today);
const nowHour = new Date().getHours();

for (const date of dates) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const rows: UsageRow[] = [];
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
      if (sec > 30) rows.push({ deviceId: mac.id, date, hour, type: "app", key, seconds: Math.min(sec, 3600), source: "screentime" });
      if (key === "com.google.Chrome") chromeSec = sec;
    }
    if (chromeSec > 0) {
      for (const [key, , weight] of SITES) {
        const boost = !work && (key === "x.com" || key === "youtube.com") ? 3 : 1;
        const sec = Math.round(chromeSec * (weight * boost / 18) * (0.5 + rand()));
        if (sec > 30) rows.push({ deviceId: mac.id, date, hour, type: "web", key, seconds: Math.min(sec, 3600), source: "chrome" });
      }
    }
    const phoneActive = evening || late ? 0.9 : hour === 12 || hour === 8 ? 0.7 : work ? 0.15 : hour >= 7 ? 0.4 : 0;
    for (const [key, , perHour] of PHONE_APPS) {
      const sec = Math.round(perHour * 60 * phoneActive * (0.4 + rand() * 1.2));
      if (sec > 30) rows.push({ deviceId: phone.id, date, hour, type: "app", key, seconds: Math.min(sec, 3600), source: "screentime" });
    }
  }
  const payload: IngestPayload = {
    version: 1,
    timezone: "Asia/Tokyo",
    collectedOn: today,
    date,
    sources: ["screentime", "chrome"],
    devices: [mac, phone],
    rows,
    pickups: [{ deviceId: phone.id, date, pickups: 40 + Math.round(rand() * 60), notifications: 80 + Math.round(rand() * 120) }],
    names: APPS.map(([key, name]) => ({ type: "app" as const, key, name })),
  };
  const res = await fetch(`${url}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${date}: ${res.status} ${await res.text()}`);
}

const categories: [string, string, string][] = [
  ...APPS.filter((a) => a[2]).map(([k, , c]) => ["app", k, c] as [string, string, string]),
  ...SITES.map(([k, c]) => ["web", k, c] as [string, string, string]),
  ...PHONE_APPS.filter((a) => a[1]).map(([k, c]) => ["app", k, c] as [string, string, string]),
];
for (const [type, key, category] of categories) {
  await fetch(`${url}/api/items/${type}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category }),
  });
}
for (const [category, comparator, minutes] of [["sns", "max", 45], ["dev", "min", 240]] as const) {
  await fetch(`${url}/api/goals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, comparator, minutes }),
  });
}
console.log(`seeded ${dates.length} days`);
