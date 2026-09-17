import { useEffect, useState } from "react";
import { confirmShift, fetchMembers, fetchShifts } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Member, Shift, ShiftType } from "../types";
import { currentYearMonth, monthRange } from "../utils/date";

export function ShiftCalendarPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentYearMonth());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ date: "", memberId: "", type: "work" as ShiftType });

  const load = async () => {
    const { from, to } = monthRange(month);
    const [s, m] = await Promise.all([fetchShifts(from, to), fetchMembers()]);
    setShifts(s.sort((a, b) => a.date.localeCompare(b.date)));
    setMembers(m);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? id;

  const onConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.memberId) return;
    await confirmShift(form.date, form.memberId, form.type);
    setForm({ date: "", memberId: "", type: "work" });
    await load();
  };

  return (
    <div>
      <h2>シフト確定カレンダー</h2>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />

      <table className="grid-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>メンバー</th>
            <th>種別</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td>{memberName(s.memberId)}</td>
              <td>{s.type === "work" ? "出勤" : "代休"}</td>
              <td>{s.status === "confirmed" ? "確定" : "下書き"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {user?.isAdmin && (
        <>
          <h3>シフト確定(管理者)</h3>
          <form onSubmit={onConfirm} className="inline-form">
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
            <select
              value={form.memberId}
              onChange={(e) => setForm({ ...form, memberId: e.target.value })}
              required
            >
              <option value="">メンバーを選択</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ShiftType })}
            >
              <option value="work">出勤</option>
              <option value="daikyu">代休</option>
            </select>
            <button type="submit">確定する</button>
          </form>
        </>
      )}
    </div>
  );
}
