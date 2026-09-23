import { useCallback, useEffect, useState } from "react";
import { addDays } from "../shared/time";
import type { OverviewResponse } from "../shared/types";
import { api, IS_DEMO } from "./api";
import { Dashboard } from "./components/Dashboard";
import { GoalsPage } from "./components/GoalsPage";
import { ItemsPage } from "./components/ItemsPage";

type Tab = "dashboard" | "items" | "goals";

function readUrl() {
  const p = new URLSearchParams(location.search);
  const tab = p.get("tab");
  return {
    date: p.get("date"),
    device: p.get("device") ?? "all",
    tab: (tab === "items" || tab === "goals" ? tab : "dashboard") as Tab,
  };
}

export function App() {
  const initial = readUrl();
  // デモ版は振り返りが揃っている「昨日」から開く
  const [date, setDate] = useState<string | null>(
    initial.date ?? (IS_DEMO ? addDays(new Date().toLocaleDateString("sv-SE"), -1) : null),
  );
  const [device, setDevice] = useState(initial.device);
  const [tab, setTab] = useState<Tab>(initial.tab);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams();
    if (date) p.set("date", date);
    if (device !== "all") p.set("device", device);
    if (tab !== "dashboard") p.set("tab", tab);
    const qs = p.toString();
    history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }, [date, device, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.overview(date, device));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date, device]);

  useEffect(() => {
    if (tab === "dashboard") void load();
  }, [load, tab]);

  const current = data?.date ?? date;
  const maxDate = data?.availableRange.max ?? null;
  const today = new Date().toLocaleDateString("sv-SE");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Screen Time Insights
          <small>Mac / iPhone の使い方をふりかえる</small>
        </div>
        <nav className="tabs" role="tablist" aria-label="画面の切り替え">
          {(
            [
              ["dashboard", "ダッシュボード"],
              ["items", "カテゴリ分類"],
              ["goals", "目標"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {IS_DEMO && (
        <div className="notice demo">
          <b>デモ版</b>：表示しているのは自動生成したサンプルデータです（実際の利用履歴ではありません）。AI の振り返りも定型文の見本で、Slack には送信しません。
          日付の移動・端末の切り替え・カテゴリ変更・目標の追加は操作できます（再読み込みで元に戻ります）。
        </div>
      )}
      {tab === "dashboard" && (
        <>
          <div className="controls">
            <div className="datenav">
              <button className="icon-btn" aria-label="前の日" disabled={!current} onClick={() => current && setDate(addDays(current, -1))}>
                ←
              </button>
              <input
                type="date"
                aria-label="日付"
                value={current ?? ""}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
              <button
                className="icon-btn"
                aria-label="次の日"
                disabled={!current || current >= today}
                onClick={() => current && setDate(addDays(current, 1))}
              >
                →
              </button>
              {maxDate && current !== maxDate && (
                <button className="btn" onClick={() => setDate(maxDate)}>
                  最新
                </button>
              )}
            </div>
            {data && data.devices.length > 1 && (
              <div className="segmented" role="group" aria-label="端末">
                <button aria-pressed={device === "all"} onClick={() => setDevice("all")}>
                  すべて
                </button>
                {data.devices.map((d) => (
                  <button key={d.id} aria-pressed={device === d.id} onClick={() => setDevice(d.id)}>
                    {d.platform === "iphone" ? "📱 " : d.platform === "mac" ? "💻 " : ""}
                    {d.name}
                  </button>
                ))}
              </div>
            )}
            <span className="meta">
              {loading ? "読み込み中…" : data?.lastIngestAt ? `最終受信 ${new Date(`${data.lastIngestAt}Z`).toLocaleString("ja-JP")}` : ""}
            </span>
          </div>
          {error && <div className="notice error">読み込みに失敗しました: {error}</div>}
          {data && <Dashboard data={data} onSelectDate={setDate} onReload={load} />}
        </>
      )}
      {tab === "items" && <ItemsPage />}
      {tab === "goals" && <GoalsPage />}
    </div>
  );
}
