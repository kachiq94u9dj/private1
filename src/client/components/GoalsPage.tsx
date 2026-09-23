import { useEffect, useState } from "react";
import { CATEGORIES, categoryLabel } from "../../shared/categories";
import { api, type GoalRow } from "../api";

export function GoalsPage() {
  const [goals, setGoals] = useState<GoalRow[] | null>(null);
  const [target, setTarget] = useState("sns");
  const [comparator, setComparator] = useState<"max" | "min">("max");
  const [minutes, setMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .goals()
      .then((r) => setGoals(r.goals))
      .catch((e) => setError(String(e.message ?? e)));
  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setError(null);
    try {
      await api.addGoal(target, comparator, minutes);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: number) {
    await api.deleteGoal(id);
    await load();
  }

  return (
    <section className="card">
      <h2>目標</h2>
      <p className="sub">毎日のダッシュボードと AI の振り返り・Slack 通知で達成状況を確認できます。</p>
      <div className="form-row" style={{ marginBottom: 16 }}>
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="対象">
          <option value="total">合計使用時間</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        を1日
        <input type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="分" />
        分
        <select value={comparator} onChange={(e) => setComparator(e.target.value as "max" | "min")} aria-label="条件">
          <option value="max">以内にする</option>
          <option value="min">以上にする</option>
        </select>
        <button className="btn primary" onClick={add}>
          追加
        </button>
        {error && <span className="error">{error}</span>}
      </div>
      {goals === null ? (
        <div className="empty">読み込み中…</div>
      ) : goals.length === 0 ? (
        <div className="empty">目標はまだありません</div>
      ) : (
        <table className="items">
          <tbody>
            {goals.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.target_kind === "total" ? "合計使用時間" : categoryLabel(g.target_category ?? "")} を1日 {g.minutes}分
                  {g.comparator === "max" ? "以内" : "以上"}
                </td>
                <td className="num">
                  <button className="btn" onClick={() => remove(g.id)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
