"use client";

import { useMemo, useState } from "react";
import {
  getBrowserClient,
  type AttendeeStatus,
  type IgAttendeeRow,
  type IgEventRow,
  type IgFriendRow,
} from "@/lib/supabase";
import {
  Card,
  ExportBox,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  buttonStyle,
  formatDate,
  inputStyle,
  profileUrl,
  tdStyle,
  thStyle,
} from "./ui";

interface EventDraft {
  title: string;
  event_date: string;
  location: string;
  note: string;
}

const EMPTY_DRAFT: EventDraft = { title: "", event_date: "", location: "", note: "" };

function EventForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: EventDraft;
  submitLabel: string;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!draft.title.trim()) return;
        setBusy(true);
        await onSubmit(draft);
        setBusy(false);
      }}
      style={{ display: "grid", gap: 8 }}
    >
      <input
        style={inputStyle}
        placeholder="イベント名（必須）"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        required
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          style={inputStyle}
          type="date"
          value={draft.event_date}
          onChange={(e) => setDraft({ ...draft, event_date: e.target.value })}
        />
        <input
          style={{ ...inputStyle, flex: "1 1 160px" }}
          placeholder="場所"
          value={draft.location}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })}
        />
      </div>
      <textarea
        style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit" }}
        placeholder="メモ"
        value={draft.note}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={buttonStyle(true)} disabled={busy}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" style={buttonStyle()} onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}

export default function EventsView({
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
  const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id ?? null);
  const [creating, setCreating] = useState(events.length === 0);
  const [editing, setEditing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AttendeeStatus | "all">("all");
  const [addQuery, setAddQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const supabase = getBrowserClient();
  const event = events.find((e) => e.id === selectedId) ?? null;
  const friendById = useMemo(() => new Map(friends.map((f) => [f.id, f])), [friends]);

  const eventAttendees = useMemo(
    () =>
      attendees
        .filter((a) => a.event_id === selectedId && friendById.has(a.friend_id))
        .sort((a, b) => friendById.get(a.friend_id)!.username.localeCompare(friendById.get(b.friend_id)!.username)),
    [attendees, selectedId, friendById],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<AttendeeStatus, number>;
    for (const a of eventAttendees) c[a.status]++;
    return c;
  }, [eventAttendees]);

  const visible = statusFilter === "all" ? eventAttendees : eventAttendees.filter((a) => a.status === statusFilter);

  const addCandidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase().replace(/^@/, "");
    if (!q) return [];
    const already = new Set(eventAttendees.map((a) => a.friend_id));
    return friends.filter((f) => !already.has(f.id) && f.username.includes(q)).slice(0, 8);
  }, [addQuery, friends, eventAttendees]);

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await action;
    if (error) {
      setError(error.message);
      return false;
    }
    setError(null);
    await onChanged();
    return true;
  }

  async function createEvent(draft: EventDraft) {
    const { data, error } = await supabase
      .from("ig_events")
      .insert({ ...draft, event_date: draft.event_date || null })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    await onChanged();
    setSelectedId(data.id);
    setCreating(false);
  }

  async function updateEvent(draft: EventDraft) {
    if (!event) return;
    const ok = await run(
      supabase
        .from("ig_events")
        .update({ ...draft, event_date: draft.event_date || null })
        .eq("id", event.id),
    );
    if (ok) setEditing(false);
  }

  async function deleteEvent() {
    if (!event || !window.confirm(`「${event.title}」を削除しますか？参加者の記録も消えます。`)) return;
    const ok = await run(supabase.from("ig_events").delete().eq("id", event.id));
    if (ok) setSelectedId(events.find((e) => e.id !== event.id)?.id ?? null);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr)", gap: 16 }} className="ig-events-grid">
      <style>{`@media (max-width: 720px) { .ig-events-grid { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
      <div>
        <Card
          title="イベント"
          actions={
            <button style={buttonStyle()} onClick={() => setCreating(true)}>
              ＋ 新規
            </button>
          }
        >
          {events.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>まだイベントがありません。</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {events.map((e) => {
              const n = attendees.filter((a) => a.event_id === e.id && a.status === "attending").length;
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    setSelectedId(e.id);
                    setCreating(false);
                    setEditing(false);
                    setStatusFilter("all");
                  }}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid " + (e.id === selectedId && !creating ? "var(--series-1)" : "transparent"),
                    background: e.id === selectedId && !creating ? "var(--page-plane)" : "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {e.event_date ?? "日付未定"} ・ 参加 {n}人
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ minWidth: 0 }}>
        {error && <p style={{ fontSize: 13, color: "var(--critical)", marginTop: 0 }}>エラー: {error}</p>}

        {creating ? (
          <Card title="新しいイベント">
            <EventForm
              initial={EMPTY_DRAFT}
              submitLabel="作成する"
              onSubmit={createEvent}
              onCancel={events.length > 0 ? () => setCreating(false) : undefined}
            />
          </Card>
        ) : event ? (
          <>
            <Card
              title={event.title}
              actions={
                !editing && (
                  <>
                    <button style={buttonStyle()} onClick={() => setEditing(true)}>
                      編集
                    </button>
                    <button style={{ ...buttonStyle(), color: "var(--critical)" }} onClick={deleteEvent}>
                      削除
                    </button>
                  </>
                )
              }
            >
              {editing ? (
                <EventForm
                  key={event.id}
                  initial={{
                    title: event.title,
                    event_date: event.event_date ?? "",
                    location: event.location,
                    note: event.note,
                  }}
                  submitLabel="保存する"
                  onSubmit={updateEvent}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  <div>日付: {event.event_date ?? "未定"}</div>
                  {event.location && <div>場所: {event.location}</div>}
                  {event.note && <div style={{ whiteSpace: "pre-wrap" }}>{event.note}</div>}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")} label={`すべて ${eventAttendees.length}`} />
                {STATUS_ORDER.map((s) => (
                  <FilterChip
                    key={s}
                    active={statusFilter === s}
                    onClick={() => setStatusFilter(s)}
                    label={`${STATUS_LABELS[s]} ${counts[s]}`}
                    color={STATUS_COLORS[s]}
                  />
                ))}
              </div>
            </Card>

            <Card title="参加者リスト">
              <div style={{ position: "relative", marginBottom: 12 }}>
                <input
                  style={{ ...inputStyle, width: "100%" }}
                  placeholder="ユーザー名で検索して候補に追加（友達タブからまとめて追加もできます）"
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                />
                {addCandidates.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 10,
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                      marginTop: 4,
                    }}
                  >
                    {addCandidates.map((f) => (
                      <button
                        key={f.id}
                        onClick={async () => {
                          const ok = await run(
                            supabase.from("ig_event_attendees").insert({ event_id: event.id, friend_id: f.id }),
                          );
                          if (ok) setAddQuery("");
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          background: "transparent",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        @{f.username}
                        <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 8 }}>
                          DM {f.dm_count}件 ・ 最終 {formatDate(f.last_dm_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--gridline)" }}>
                      <th style={thStyle}>ユーザー名</th>
                      <th style={thStyle}>ステータス</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>DM 件数</th>
                      <th style={thStyle}>最終 DM</th>
                      <th style={thStyle}>メモ</th>
                      <th style={thStyle} />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => {
                      const f = friendById.get(a.friend_id)!;
                      const match = { event_id: a.event_id, friend_id: a.friend_id };
                      return (
                        <tr key={a.friend_id} style={{ borderBottom: "1px solid var(--gridline)" }}>
                          <td style={tdStyle}>
                            <a href={profileUrl(f.username)} target="_blank" rel="noreferrer" style={{ color: "var(--series-1)" }}>
                              @{f.username}
                            </a>
                          </td>
                          <td style={tdStyle}>
                            <select
                              style={{ ...inputStyle, padding: "4px 8px", borderLeft: `4px solid ${STATUS_COLORS[a.status]}` }}
                              value={a.status}
                              onChange={(e) =>
                                void run(
                                  supabase
                                    .from("ig_event_attendees")
                                    .update({ status: e.target.value, updated_at: new Date().toISOString() })
                                    .match(match),
                                )
                              }
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{f.dm_count}</td>
                          <td style={tdStyle}>{formatDate(f.last_dm_at)}</td>
                          <td style={tdStyle}>
                            <input
                              key={a.note}
                              style={{ ...inputStyle, width: "100%", minWidth: 140, padding: "4px 8px" }}
                              defaultValue={a.note}
                              placeholder="メモ（人数・連絡事項など）"
                              onBlur={(e) => {
                                if (e.target.value !== a.note) {
                                  void run(supabase.from("ig_event_attendees").update({ note: e.target.value }).match(match));
                                }
                              }}
                            />
                          </td>
                          <td style={tdStyle}>
                            <button
                              style={{ ...buttonStyle(), padding: "4px 8px", fontSize: 12 }}
                              onClick={() => void run(supabase.from("ig_event_attendees").delete().match(match))}
                              title="このイベントから外す"
                            >
                              外す
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {eventAttendees.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  まだ誰もいません。上の検索欄か、「友達」タブで選んで追加してください。
                </p>
              )}

              <ExportBox
                usernames={visible.map((a) => friendById.get(a.friend_id)!.username)}
                label={statusFilter === "all" ? "このイベントの全員" : `「${STATUS_LABELS[statusFilter]}」の人`}
              />
            </Card>
          </>
        ) : (
          <Card>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>左の一覧からイベントを選んでください。</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid " + (active ? "var(--text-primary)" : "var(--border)"),
        background: active ? "var(--page-plane)" : "transparent",
        color: "var(--text-primary)",
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {color && <span style={{ width: 8, height: 8, borderRadius: 4, background: color, display: "inline-block" }} />}
      {label}
    </button>
  );
}
