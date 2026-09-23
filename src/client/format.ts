import { categoryLabel } from "../shared/categories";

export function hm(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}時間${r}分` : `${h}時間`;
}

export function shortHm(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${(m / 60).toFixed(m >= 600 ? 0 : 1)}h`;
}

export function catColor(id: string | null | undefined): string {
  return `var(--cat-${id ?? "other"})`;
}

export function catName(id: string | null | undefined): string {
  return id ? categoryLabel(id) : "未分類";
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function mdw(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

export function md(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
