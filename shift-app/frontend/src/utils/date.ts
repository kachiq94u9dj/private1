export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" -> その月の全日付("YYYY-MM-DD")の配列 */
export function daysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return Array.from({ length: lastDay }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return `${yearMonth}-${d}`;
  });
}

export function monthRange(yearMonth: string): { from: string; to: string } {
  const days = daysInMonth(yearMonth);
  return { from: days[0], to: days[days.length - 1] };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function weekdayLabel(dateStr: string): string {
  return WEEKDAYS[new Date(dateStr).getDay()];
}
