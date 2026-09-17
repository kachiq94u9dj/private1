import { useEffect, useState } from "react";
import { addHoliday, deleteHoliday, fetchHolidays } from "../api/client";
import type { Holiday } from "../types";

export function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [form, setForm] = useState({ date: "", name: "" });

  const load = async () => {
    const items = await fetchHolidays();
    setHolidays(items.sort((a, b) => a.date.localeCompare(b.date)));
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.name) return;
    await addHoliday(form.date, form.name);
    setForm({ date: "", name: "" });
    await load();
  };

  const onDelete = async (date: string) => {
    await deleteHoliday(date);
    await load();
  };

  return (
    <div>
      <h2>祝日マスタ管理</h2>
      <form onSubmit={onSubmit} className="inline-form">
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
        />
        <input
          placeholder="祝日名"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <button type="submit">追加</button>
      </form>

      <table className="grid-table">
        <thead>
          <tr>
            <th>日付</th>
            <th>名称</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {holidays.map((h) => (
            <tr key={h.date}>
              <td>{h.date}</td>
              <td>{h.name}</td>
              <td>
                <button onClick={() => onDelete(h.date)}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
