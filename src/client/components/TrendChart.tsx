import { useLayoutEffect, useRef, useState } from "react";
import { CATEGORIES } from "../../shared/categories";
import type { DaySummary } from "../../shared/types";
import { catColor, hm, md, mdw, weekday } from "../format";
import { pointIn, Tooltip, type TipState } from "./Tooltip";

const H = 240;
const PAD = { top: 12, right: 8, bottom: 26, left: 40 };
const GAP = 2; // 積み上げの区切り（面の色の隙間）

function niceStep(maxHours: number): number {
  if (maxHours <= 2) return 0.5;
  if (maxHours <= 6) return 1;
  if (maxHours <= 12) return 2;
  return 4;
}

/** 上端だけ角丸（4px）の矩形 */
function topRounded(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

export function TrendChart({ trend, selected, onSelect }: { trend: DaySummary[]; selected: string; onSelect: (d: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // SVG を拡大縮小すると文字も伸びるため、実際の幅で描画する
  const [W, setW] = useState(720);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(320, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxSec = Math.max(...trend.map((d) => d.total), 3600);
  const step = niceStep(maxSec / 3600);
  const top = Math.ceil(maxSec / 3600 / step) * step;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / trend.length;
  const barW = Math.min(24, band * 0.7);
  const y = (sec: number) => PAD.top + plotH - (sec / 3600 / top) * plotH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = band < 28 ? 7 : 1;

  return (
    <section className="card span-12" aria-label="日ごとの推移">
      <h2>日ごとの推移</h2>
      <p className="sub">直近{trend.length}日・カテゴリ別の積み上げ。棒をクリックするとその日を表示します。</p>
      <div className="legend">
        {CATEGORIES.map((c) => (
          <span key={c.id}>
            <i className="swatch" style={{ background: catColor(c.id) }} />
            {c.label}
          </span>
        ))}
      </div>
      <div className="chart-wrap" ref={wrap} onMouseLeave={() => (setTip(null), setHover(null))}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日ごとの使用時間の推移">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "baseline" : "gridline"} x1={PAD.left} x2={W - PAD.right} y1={y(t * 3600)} y2={y(t * 3600)} />
              <text className="axis-text" x={PAD.left - 6} y={y(t * 3600) + 4} textAnchor="end">
                {t}h
              </text>
            </g>
          ))}
          {trend.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x = cx - barW / 2;
            const segs = CATEGORIES.map((c) => ({ id: c.id, sec: d.byCategory[c.id] ?? 0 })).filter((s) => s.sec > 0);
            let acc = 0;
            const dim = hover && hover !== d.date ? 0.45 : 1;
            return (
              <g key={d.date}>
                {d.date === selected && (
                  <rect x={cx - band / 2 + 1} y={PAD.top} width={band - 2} height={plotH} rx={4} fill="var(--surface-2)" />
                )}
                <g opacity={dim}>
                  {segs.map((s, si) => {
                    const y0 = y(acc);
                    acc += s.sec;
                    const y1 = y(acc);
                    const isTop = si === segs.length - 1;
                    const h = Math.max(y0 - y1 - (si > 0 ? GAP : 0), 0.5);
                    const yTop = y1;
                    return isTop ? (
                      <path key={s.id} d={topRounded(x, yTop, barW, h)} fill={catColor(s.id)} />
                    ) : (
                      <rect key={s.id} x={x} y={yTop} width={barW} height={h} fill={catColor(s.id)} />
                    );
                  })}
                </g>
                {(i % labelEvery === (trend.length - 1) % labelEvery || d.date === selected) && (
                  <text
                    className="axis-text"
                    x={cx}
                    y={H - 8}
                    textAnchor="middle"
                    fontWeight={d.date === selected ? 600 : undefined}
                    fill={d.date === selected ? "var(--text)" : undefined}
                  >
                    {md(d.date)}
                  </text>
                )}
                <rect
                  x={cx - band / 2}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelect(d.date)}
                  onMouseMove={(e) => {
                    const p = pointIn(e, wrap.current);
                    setHover(d.date);
                    setTip({
                      x: p.x,
                      y: p.y,
                      content: (
                        <>
                          <div className="t-title">
                            {mdw(d.date)} 合計 {hm(d.total)}
                          </div>
                          {segs
                            .slice()
                            .reverse()
                            .map((s) => (
                              <div className="t-row" key={s.id}>
                                <i className="swatch" style={{ background: catColor(s.id) }} />
                                {CATEGORIES.find((c) => c.id === s.id)?.label}
                                <b>{hm(s.sec)}</b>
                              </div>
                            ))}
                        </>
                      ),
                    });
                  }}
                />
                {weekday(d.date) === 1 && i > 0 && (
                  <line x1={cx - band / 2} x2={cx - band / 2} y1={H - PAD.bottom + 2} y2={H - PAD.bottom + 6} className="baseline" />
                )}
              </g>
            );
          })}
        </svg>
        <Tooltip tip={tip} />
      </div>
    </section>
  );
}
