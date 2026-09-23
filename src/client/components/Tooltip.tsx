import type { ReactNode } from "react";

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export function Tooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" role="status" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  );
}

/** マウス位置をラッパー要素内の座標に変換する */
export function pointIn(e: { clientX: number; clientY: number; currentTarget: Element }, wrap: HTMLElement | null) {
  const r = (wrap ?? e.currentTarget).getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
