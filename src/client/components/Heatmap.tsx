import { useRef, useState } from "react";
import { hm, mdw } from "../format";
import { pointIn, Tooltip, type TipState } from "./Tooltip";

const STEPS = 7;

function level(seconds: number, max: number): number {
  if (seconds < 60) return 0;
  return Math.min(STEPS, Math.max(1, Math.ceil((seconds / max) * STEPS)));
}

export function Heatmap({
  cells,
  selected,
  onSelect,
}: {
  cells: { date: string; hour: number; seconds: number }[];
  selected: string;
  onSelect: (d: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const dates = [...new Set(cells.map((c) => c.date))].sort().reverse();
  const byKey = new Map(cells.map((c) => [`${c.date}|${c.hour}`, c.seconds]));
  const max = Math.max(3600, ...cells.map((c) => c.seconds));

  return (
    <section className="card span-12" aria-label="時間帯ヒートマップ">
      <h2>時間帯ヒートマップ</h2>
      <p className="sub">1時間あたりの使用時間。濃いほど長く使っています（行をクリックでその日を表示）。</p>
      <div className="chart-wrap" ref={wrap} onMouseLeave={() => setTip(null)} style={{ overflowX: "auto" }}>
        <div className="heatmap" style={{ gridTemplateColumns: `auto repeat(24, minmax(12px, 1fr))`, minWidth: 420 }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="collabel">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
          {dates.map((d) => (
            <div key={d} style={{ display: "contents" }}>
              <div
                className="rowlabel"
                style={{ color: d === selected ? "var(--text)" : undefined, fontWeight: d === selected ? 600 : undefined, cursor: "pointer" }}
                onClick={() => onSelect(d)}
              >
                {mdw(d)}
              </div>
              {Array.from({ length: 24 }, (_, h) => {
                const s = byKey.get(`${d}|${h}`) ?? 0;
                return (
                  <div
                    key={h}
                    className="cell"
                    style={{ background: `var(--seq-${level(s, max)})`, cursor: "pointer" }}
                    onClick={() => onSelect(d)}
                    onMouseMove={(e) => {
                      const p = pointIn(e, wrap.current);
                      setTip({ x: p.x, y: p.y, content: <div className="t-title">{mdw(d)} {h}時台 · {hm(s)}</div> });
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <Tooltip tip={tip} />
      </div>
      <div className="heat-scale" aria-hidden="true">
        少ない
        {Array.from({ length: STEPS + 1 }, (_, i) => (
          <span key={i} className="cell" style={{ background: `var(--seq-${i})` }} />
        ))}
        多い（最大 {hm(max)}/時）
      </div>
    </section>
  );
}
