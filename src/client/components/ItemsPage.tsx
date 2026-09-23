import { useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "../../shared/categories";
import { api, type ItemRow } from "../api";
import { catColor, hm } from "../format";

type Filter = "all" | "uncategorized" | "app" | "web";

export function ItemsPage() {
  const [items, setItems] = useState<ItemRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    api
      .items()
      .then((r) => setItems(r.items))
      .catch((e) => setMessage(String(e.message ?? e)));
  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (filter === "uncategorized" && i.category) return false;
      if ((filter === "app" || filter === "web") && i.type !== filter) return false;
      return !q || i.key.toLowerCase().includes(q) || (i.name ?? "").toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  async function change(item: ItemRow, category: string) {
    const value = category === "" ? null : category;
    setItems((prev) => prev?.map((i) => (i === item ? { ...i, category: value, categorySource: value ? "manual" : null } : i)) ?? null);
    try {
      await api.setCategory(item.type, item.key, value);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      void load();
    }
  }

  async function categorize() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.categorize();
      setMessage(`${r.categorized} 件を AI で分類しました`);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const uncategorized = (items ?? []).filter((i) => !i.category).length;

  return (
    <section className="card">
      <h2>カテゴリ分類</h2>
      <p className="sub">
        新しいアプリ・サイトは AI が自動で分類します。手動で変更したものは AI に上書きされません。時間は直近28日の合計です。
      </p>
      <div className="form-row" style={{ marginBottom: 12 }}>
        <div className="segmented" role="group" aria-label="絞り込み">
          {(
            [
              ["all", "すべて"],
              ["uncategorized", `未分類 (${uncategorized})`],
              ["app", "アプリ"],
              ["web", "サイト"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <input type="search" placeholder="検索" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="検索" />
        <button className="btn" onClick={categorize} disabled={busy || uncategorized === 0}>
          {busy ? "分類中…" : "未分類を AI で分類"}
        </button>
        {message && <span className="meta">{message}</span>}
      </div>
      {items === null ? (
        <div className="empty">読み込み中…</div>
      ) : shown.length === 0 ? (
        <div className="empty">該当するものはありません</div>
      ) : (
        <div className="table-scroll">
          <table className="items">
            <thead>
              <tr>
                <th>名前</th>
                <th>種類</th>
                <th>カテゴリ</th>
                <th style={{ textAlign: "right" }}>時間</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={`${i.type}|${i.key}`}>
                  <td>
                    <div>{i.name ?? i.key}</div>
                    <div className="key">{i.key}</div>
                  </td>
                  <td>{i.type === "app" ? "アプリ" : "サイト"}</td>
                  <td>
                    <span className="swatch" style={{ background: i.category ? catColor(i.category) : "transparent", marginRight: 6 }} />
                    <select value={i.category ?? ""} onChange={(e) => change(i, e.target.value)} aria-label={`${i.name ?? i.key} のカテゴリ`}>
                      <option value="">未分類</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {i.categorySource && <span className="pill">{i.categorySource === "ai" ? "AI" : "手動"}</span>}
                  </td>
                  <td className="num">{hm(i.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
