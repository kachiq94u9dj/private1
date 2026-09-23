// ローカル開発用: ダミーのスクリーンタイムデータを生成して /api/ingest に送る。
//   node scripts/seed-demo.ts [http://localhost:5173] [トークン]
// .dev.vars の DEV_ALLOW_NO_AUTH=true が前提（カテゴリ設定 API も叩くため）。
import { generateDemoData } from "../src/shared/demoData.ts";
import type { IngestPayload } from "../src/shared/types.ts";

const url = process.argv[2] ?? "http://localhost:5173";
const token = process.argv[3] ?? "local-dev-token";

const today = new Date().toLocaleDateString("sv-SE");
const demo = generateDemoData(today, new Date().getHours());
const dates = [...new Set(demo.rows.map((r) => r.date))].sort();

for (const date of dates) {
  const payload: IngestPayload = {
    version: 1,
    timezone: "Asia/Tokyo",
    collectedOn: today,
    date,
    sources: ["screentime", "chrome"],
    devices: demo.devices,
    rows: demo.rows.filter((r) => r.date === date),
    pickups: demo.pickups.filter((p) => p.date === date),
    names: demo.items.filter((i) => i.type === "app").map((i) => ({ type: "app" as const, key: i.key, name: i.name })),
  };
  const res = await fetch(`${url}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${date}: ${res.status} ${await res.text()}`);
}

for (const item of demo.items.filter((i) => i.category)) {
  await fetch(`${url}/api/items/${item.type}/${encodeURIComponent(item.key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: item.category, name: item.name }),
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
