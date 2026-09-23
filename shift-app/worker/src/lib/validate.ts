const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

const MAX_FREE_TEXT_LENGTH = 500;

/** 自由記述欄(備考・理由など)の簡易サニタイズ: 長さ上限のみ強制する(数式化対策はRAW書き込み側で実施済み) */
export function sanitizeFreeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_FREE_TEXT_LENGTH);
}
