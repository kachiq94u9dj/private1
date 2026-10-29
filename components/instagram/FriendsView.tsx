"use client";

import { useMemo, useState } from "react";
import { getBrowserClient, type IgAttendeeRow, type IgEventRow, type IgFriendRow } from "@/lib/supabase";
import { Card, ExportBox, StatTile, buttonStyle, formatDate, inputStyle, profileUrl, tdStyle, thStyle } from "./ui";

type Relation = "all" | "mutual" | "follower_only" | "following_only" | "none";
type SortKey = "username" | "dm_count" | "last_dm_at" | "followed_me_at";

const RELATION_LABELS: Record<Relation, string> = {
  all: "すべて",
  mutual: "相互フォロー",
  follower_only: "フォロワーのみ",
  following_only: "フォロー中のみ",
  none: "つながりなし",
};

const PAGE = 200;

function relationOf(f: IgFriendRow): Exclude<Relation, "all"> {
  if (f.is_follower && f.is_following) return "mutual";
  if (f.is_follower) return "follower_only";
  if (f.is_following) return "following_only";
  return "none";
}

export default function FriendsView({
  friends,
  events,
  attendees,
  onChanged,
}: {
  friends: IgFriendRow[];
  events: IgEventRow[];
  attendees: IgAttendeeRow[];
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState<Relation>("all");
  const [dmOnly, setDmOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("last_dm_at");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetEvent, setTargetEvent] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const eventCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of attendees) map.set(a.friend_id, (map.get(a.friend_id) ?? 0) + 1);
    return map;
  }, [attendees]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    const list = friends.filter((f) => {
      if (relation !== "all" && relationOf(f) !== relation) return false;
      if (dmOnly && f.dm_count === 0) return false;
      if (q && !f.username.includes(q) && !f.note.toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sortKey === "username") return a.username.localeCompare(b.username);
      if (sortKey === "dm_count") return b.dm_count - a.dm_count;
      return (b[sortKey] ?? "").localeCompare(a[sortKey] ?? "");
    });
  }, [friends, query, relation, dmOnly, sortKey]);

  const stats = useMemo(
    () => ({
      connected: friends.filter((f) => f.is_follower || f.is_following).length,
      followers: friends.filter((f) => f.is_follower).length,
      following: friends.filter((f) => f.is_following).length,
      mutual: friends.filter((f) => f.is_follower && f.is_following).length,
      dm: friends.filter((f) => f.dm_count > 0).length,
    }),
    [friends],
  );

  const selectedInView = filtered.filter((f) => selected.has(f.id));
  const exportTargets = selectedInView.length > 0 ? selectedInView : filtered;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveNote(friend: IgFriendRow, note: string) {
    if (note === friend.note) return;
    const { error } = await getBrowserClient().from("ig_friends").update({ note }).eq("id", friend.id);
    if (error) setStatus(`メモを保存できませんでした: ${error.message}`);
    else await onChanged();
  }

  async function addToEvent() {
    if (!targetEvent || selectedInView.length === 0) return;
    const rows = selectedInView.map((f) => ({ event_id: targetEvent, friend_id: f.id, status: "candidate" }));
    const { error } = await getBrowserClient()
      .from("ig_event_attendees")
      .upsert(rows, { onConflict: "event_id,friend_id", ignoreDuplicates: true });
    if (error) {
      setStatus(`イベントに追加できませんでした: ${error.message}`);
      return;
    }
    const title = events.find((e) => e.id === targetEvent)?.title ?? "";
    setStatus(`${rows.length}人を「${title}」の候補に追加しました（既に追加済みの人はそのままです）。`);
    setSelected(new Set());
    await onChanged();
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <StatTile label="友達（合計）" value={stats.connected.toLocaleString()} sub="フォロワーとフォロー中（重複なし）" />
        <StatTile label="フォロワー" value={stats.followers.toLocaleString()} />
        <StatTile label="フォロー中" value={stats.following.toLocaleString()} />
        <StatTile label="相互フォロー" value={stats.mutual.toLocaleString()} />
        <StatTile label="DM したことがある" value={stats.dm.toLocaleString()} />
      </div>

      <Card title="友達一覧">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            style={{ ...inputStyle, flex: "1 1 200px" }}
            placeholder="ユーザー名・メモで検索"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
          />
          <select style={inputStyle} value={relation} onChange={(e) => setRelation(e.target.value as Relation)}>
            {(Object.keys(RELATION_LABELS) as Relation[]).map((r) => (
              <option key={r} value={r}>
                {RELATION_LABELS[r]}
              </option>
            ))}
          </select>
          <select style={inputStyle} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="last_dm_at">最終 DM が新しい順</option>
            <option value="dm_count">DM 件数が多い順</option>
            <option value="followed_me_at">フォローされた日が新しい順</option>
            <option value="username">ユーザー名順</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={dmOnly} onChange={(e) => setDmOnly(e.target.checked)} />
            DM したことがある人だけ
          </label>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>
            {filtered.length.toLocaleString()}人中 {selectedInView.length}人を選択中
          </span>
          <button style={buttonStyle()} onClick={() => setSelected(new Set(filtered.map((f) => f.id)))}>
            表示中を全選択
          </button>
          <button style={buttonStyle()} onClick={() => setSelected(new Set())}>
            選択解除
          </button>
          <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select style={inputStyle} value={targetEvent} onChange={(e) => setTargetEvent(e.target.value)}>
              <option value="">イベントを選択…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                  {e.event_date ? `（${e.event_date}）` : ""}
                </option>
              ))}
            </select>
            <button
              style={buttonStyle(true)}
              onClick={addToEvent}
              disabled={!targetEvent || selectedInView.length === 0}
            >
              選択した人をイベントに追加
            </button>
          </span>
        </div>
        {events.length === 0 && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
            イベントは「イベント」タブで作成できます。
          </p>
        )}
        {status && <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 12px" }}>{status}</p>}

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--gridline)" }}>
                <th style={thStyle} />
                <th style={thStyle}>ユーザー名</th>
                <th style={thStyle}>関係</th>
                <th style={thStyle}>フォローされた日</th>
                <th style={{ ...thStyle, textAlign: "right" }}>DM 件数</th>
                <th style={thStyle}>最終 DM</th>
                <th style={{ ...thStyle, textAlign: "right" }}>イベント</th>
                <th style={thStyle}>メモ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--gridline)" }}>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} />
                  </td>
                  <td style={tdStyle}>
                    <a href={profileUrl(f.username)} target="_blank" rel="noreferrer" style={{ color: "var(--series-1)" }}>
                      @{f.username}
                    </a>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                    {RELATION_LABELS[relationOf(f)]}
                  </td>
                  <td style={tdStyle}>{formatDate(f.followed_me_at)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{f.dm_count.toLocaleString()}</td>
                  <td style={tdStyle}>{formatDate(f.last_dm_at)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{eventCount.get(f.id) ?? 0}</td>
                  <td style={tdStyle}>
                    <input
                      key={f.note}
                      style={{ ...inputStyle, width: "100%", minWidth: 160, padding: "4px 8px" }}
                      defaultValue={f.note}
                      placeholder="メモ"
                      onBlur={(e) => void saveNote(f, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <button style={{ ...buttonStyle(), marginTop: 12 }} onClick={() => setLimit((l) => l + PAGE)}>
            さらに表示（残り {(filtered.length - limit).toLocaleString()}人）
          </button>
        )}
        {friends.length === 0 && (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>まだデータがありません。「取り込み」タブから ZIP を読み込んでください。</p>
        )}

        <ExportBox
          usernames={exportTargets.map((f) => f.username)}
          label={selectedInView.length > 0 ? "選択した人" : "表示中の人"}
        />
      </Card>
    </>
  );
}
