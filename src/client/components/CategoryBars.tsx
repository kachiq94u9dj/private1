import { CATEGORIES } from "../../shared/categories";
import type { DaySummary } from "../../shared/types";
import { catColor, hm } from "../format";

export function CategoryBars({ today, average }: { today: DaySummary; average: DaySummary }) {
  const rows = CATEGORIES.map((c) => ({ ...c, sec: today.byCategory[c.id] ?? 0, avg: average.byCategory[c.id] ?? 0 }))
    .filter((r) => r.sec > 0 || r.avg > 0)
    .sort((a, b) => b.sec - a.sec);
  const max = Math.max(...rows.map((r) => Math.max(r.sec, r.avg)), 1);

  return (
    <section className="card span-7" aria-label="カテゴリ別">
      <h2>カテゴリ別</h2>
      <p className="sub">ブラウザの時間は閲覧サイトの内訳に振り分けています。右は直近7日平均との差。</p>
      {rows.length === 0 ? (
        <div className="empty">データがありません</div>
      ) : (
        <div className="bars">
          {rows.map((r) => {
            const diff = r.sec - r.avg;
            return (
              <div className="bar-row" key={r.id} title={`${r.label}: ${hm(r.sec)}（7日平均 ${hm(r.avg)}）`}>
                <div className="name">
                  <span className="swatch" style={{ background: catColor(r.id) }} />
                  <span>{r.label}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(r.sec / max) * 100}%`, background: catColor(r.id) }} />
                </div>
                <div className="val">
                  {hm(r.sec)}
                  <small>{r.avg > 0 && Math.abs(diff) >= 60 ? `${diff > 0 ? "+" : "−"}${hm(Math.abs(diff))}` : "±0"}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
