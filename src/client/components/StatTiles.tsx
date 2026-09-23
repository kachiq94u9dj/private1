import { CATEGORIES } from "../../shared/categories";
import type { OverviewResponse } from "../../shared/types";
import { catName, hm } from "../format";

function Delta({ current, base, label }: { current: number; base: number; label: string }) {
  if (base <= 0) return <span>{label}: データなし</span>;
  const diff = current - base;
  if (Math.abs(diff) < 60) return <span>{label}とほぼ同じ</span>;
  const up = diff > 0;
  return (
    <span>
      {label}{" "}
      <span className={up ? "up-bad" : "down-good"}>
        {up ? "▲" : "▼"} {hm(Math.abs(diff))}
      </span>
    </span>
  );
}

export function StatTiles({ data }: { data: OverviewResponse }) {
  const t = data.today;
  const topCat = (Object.entries(t.byCategory) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  const topApp = t.apps[0];
  const productive = (t.byCategory.dev ?? 0) + (t.byCategory.work ?? 0) + (t.byCategory.learning ?? 0);
  const share = t.total > 0 ? Math.round((productive / t.total) * 100) : 0;
  const lateNight = [0, 1, 2, 3, 4].reduce((s, h) => s + t.hourly[h], 0) + t.hourly[23];

  return (
    <>
      <section className="card span-4 stat hero" aria-label="合計使用時間">
        <div className="label">合計使用時間{data.date === new Date().toLocaleDateString("sv-SE") ? "（今日・集計途中）" : ""}</div>
        <div className="value">{hm(t.total)}</div>
        <div className="delta">
          <Delta current={t.total} base={data.previousDay.total} label="前日比" />
          <br />
          <Delta current={t.total} base={data.lastWeekAverage.total} label="直近7日平均比" />
        </div>
      </section>
      <section className="card span-4 stat">
        <div className="label">いちばん多かったカテゴリ</div>
        <div className="value">{topCat ? catName(topCat[0]) : "—"}</div>
        <div className="delta">
          {topCat ? `${hm(topCat[1])}（${Math.round((topCat[1] / Math.max(t.total, 1)) * 100)}%）` : "データなし"}
          {topApp && (
            <>
              <br />
              最多アプリ: {topApp.name}（{hm(topApp.seconds)}）
            </>
          )}
        </div>
      </section>
      <section className="card span-4 stat">
        <div className="label">開発・仕事・学習の割合</div>
        <div className="value">{t.total > 0 ? `${share}%` : "—"}</div>
        <div className="delta">
          {hm(productive)} / 深夜(23〜5時) {hm(lateNight)}
          {t.pickups != null && (
            <>
              <br />
              iPhone 持ち上げ {t.pickups}回・通知 {t.notifications ?? 0}件
            </>
          )}
        </div>
      </section>
    </>
  );
}

export const CATEGORY_ORDER = CATEGORIES.map((c) => c.id);
