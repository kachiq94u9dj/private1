import { useState } from "react";
import type { DailyReport } from "../../shared/types";
import { api } from "../api";

export function ReportCard({ date, report, onReload }: { date: string; report: DailyReport | null; onReload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(notify: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api.regenerate(date, notify);
      onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = report?.status === "ready";
  return (
    <section className="card span-12 report" aria-label="AI の振り返り">
      <h2>AI の振り返り</h2>
      {ready ? (
        <>
          <h3>{report.headline}</h3>
          <p>{report.summary}</p>
          <div className="cols">
            <div>
              <h4>傾向</h4>
              <ul>{report.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
            <div>
              <h4>明日への提案</h4>
              <ul>{report.suggestions.map((h, i) => <li key={i}>{h}</li>)}</ul>
            </div>
          </div>
        </>
      ) : (
        <p className="sub">
          {report?.status === "generating"
            ? "生成中です…"
            : report?.status === "error"
              ? `生成に失敗しました: ${report.error ?? ""}`
              : "この日の振り返りはまだありません。翌朝に Mac から収集が届くと自動で作成され、Slack に届きます。"}
        </p>
      )}
      <div className="row-actions">
        <button className="btn" disabled={busy} onClick={() => regenerate(false)}>
          {busy ? "生成中…（30秒ほど）" : ready ? "作り直す" : "今すぐ作成"}
        </button>
        <button className="btn" disabled={busy} onClick={() => regenerate(true)}>
          作成して Slack に送る
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </section>
  );
}
