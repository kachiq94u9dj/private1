import type { GoalResult } from "../../shared/types";

export function GoalsCard({ goals, onEdit }: { goals: GoalResult[]; onEdit: () => void }) {
  return (
    <section className="card span-5" aria-label="目標">
      <h2>目標の達成状況</h2>
      <p className="sub">この日の実績</p>
      {goals.length === 0 ? (
        <div className="empty">
          目標はまだありません。
          <br />
          <button className="btn" style={{ marginTop: 8 }} onClick={onEdit}>
            目標を追加する
          </button>
        </div>
      ) : (
        goals.map((g) => {
          const ratio = Math.min(g.actualMinutes / Math.max(g.minutes, 1), 1);
          const color = g.achieved ? "var(--status-good)" : "var(--status-critical)";
          return (
            <div className="goal" key={g.id}>
              <div className="head">
                <span>
                  {g.label} {g.comparator === "max" ? `${g.minutes}分以内` : `${g.minutes}分以上`}
                </span>
                <span className={`status ${g.achieved ? "ok" : "ng"}`}>
                  {g.achieved ? "✓ 達成" : "✕ 未達成"}（{g.actualMinutes}分）
                </span>
              </div>
              <div
                className="meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={g.minutes}
                aria-valuenow={g.actualMinutes}
                aria-label={`${g.label} ${g.actualMinutes}分 / ${g.minutes}分`}
              >
                <div style={{ width: `${ratio * 100}%`, background: color }} />
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
