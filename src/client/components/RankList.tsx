import { BROWSER_BUNDLE_IDS } from "../../shared/categories";
import type { RankedItem } from "../../shared/types";
import { catColor, catName, hm } from "../format";

export function RankList({ title, items, empty }: { title: string; items: RankedItem[]; empty: string }) {
  const max = Math.max(...items.map((i) => i.seconds), 1);
  return (
    <section className="card span-6" aria-label={title}>
      <h2>{title}</h2>
      <p className="sub">色はカテゴリ</p>
      {items.length === 0 ? (
        <div className="empty">{empty}</div>
      ) : (
        <div className="bars">
          {items.map((i) => {
            // ブラウザ自体はカテゴリを持たず、時間は Web サイトの内訳としてカテゴリに振り分けている
            const browser = i.type === "app" && BROWSER_BUNDLE_IDS.has(i.key);
            const color = browser ? "var(--muted)" : catColor(i.category);
            const label = browser ? "ブラウザ" : catName(i.category);
            return (
            <div className="bar-row" key={i.key} title={`${i.name}（${i.key}）: ${hm(i.seconds)} / ${label}`}>
              <div className="name">
                <span className="swatch" style={{ background: color }} />
                <span>{i.name}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(i.seconds / max) * 100}%`, background: color }} />
              </div>
              <div className="val">
                {hm(i.seconds)}
                <small>{label}</small>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
