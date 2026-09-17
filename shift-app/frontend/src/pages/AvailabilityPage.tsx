import { useEffect, useState } from "react";
import { fetchAvailability, upsertAvailability } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Availability, AvailabilitySymbol } from "../types";
import { currentYearMonth, daysInMonth, monthRange, weekdayLabel } from "../utils/date";

const SYMBOL_LABEL: Record<AvailabilitySymbol, string> = {
  batsu: "✕",
  sankaku: "△",
  maru: "●",
};

export function AvailabilityPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentYearMonth());
  const [items, setItems] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { from, to } = monthRange(month);
    const all = await fetchAvailability(from, to);
    setItems(all.filter((a) => a.memberId === user?.memberId));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const symbolFor = (date: string) => items.find((i) => i.date === date)?.symbol;

  const onSelect = async (date: string, symbol: AvailabilitySymbol) => {
    await upsertAvailability(date, symbol);
    await load();
  };

  return (
    <div>
      <h2>出勤可否の入力</h2>
      <p>土日・祝日の出勤可否を入力してください。✕=予定を入れないで / △=調整可能 / ●=Welcome</p>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <table className="grid-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>曜</th>
              <th>選択</th>
            </tr>
          </thead>
          <tbody>
            {daysInMonth(month).map((date) => (
              <tr key={date}>
                <td>{date}</td>
                <td>{weekdayLabel(date)}</td>
                <td>
                  {(["batsu", "sankaku", "maru"] as AvailabilitySymbol[]).map((s) => (
                    <button
                      key={s}
                      className={symbolFor(date) === s ? "symbol-btn selected" : "symbol-btn"}
                      onClick={() => onSelect(date, s)}
                    >
                      {SYMBOL_LABEL[s]}
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
