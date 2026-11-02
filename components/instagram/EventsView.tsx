"use client";

import { useMemo, useState } from "react";
import * as api from "@/lib/instagram/api";
import {
  INVITE_FILTER_LABELS,
  REPLY_CYCLE,
  REPLY_LABELS,
  displayName,
  formatEventLong,
  formatEventShort,
  formatMoney,
  inviteFilterCount,
  isEnded,
  matchesInviteFilter,
  sortEvents,
  summarize,
  type FriendView,
  type InviteFilter,
} from "@/lib/instagram/selectors";
import type { IgAttendeeRow, IgEventRow } from "@/lib/supabase";
import EventFormModal from "./EventFormModal";
import FriendPickerModal from "./FriendPickerModal";
import { Avatar, ExportButtons, Icon, LinksModal, PersonName, TagChip, errorMessage, useCopy } from "./ui";

const FILTERS: InviteFilter[] = ["all", "not_invited", "no_reply", "unpaid"];

function percent(n: number, total: number): string {
  return `${total > 0 ? Math.min(100, (n / total) * 100) : 0}%`;
}

function ReminderModal({ event, usernames, onClose }: { event: IgEventRow; usernames: string[]; onClose: () => void }) {
  const fee = event.fee ? `会費 ${formatMoney(event.fee, event.currency)} ` : "会費";
  const message = `「${event.title}」（${formatEventLong(event)}）の${fee}のお支払いがまだのようです。当日までにお願いできると助かります！`;
  const [copied, copy] = useCopy();
  return (
    <LinksModal title="未払いの人にリマインド" usernames={usernames} onClose={onClose}>
      <p className="tn-muted" style={{ marginTop: 0 }}>
        Instagram の規約上、DM は自動では送れません。下の文面をコピーして、一人ずつ DM で送ってください。
      </p>
      <textarea className="tn-input" readOnly value={message} style={{ marginBottom: 8 }} />
      <button className="tn-btn tn-btn-sm" style={{ marginBottom: 16 }} onClick={() => copy(message)}>
        {copied ? "コピーしました" : "文面をコピー"}
      </button>
    </LinksModal>
  );
}

export default function EventsView({
  views,
  events,
  attendees,
  today,
  onChanged,
}: {
  views: FriendView[];
  events: IgEventRow[];
  attendees: IgAttendeeRow[];
  today: string;
  onChanged: () => Promise<void>;
}) {
  const sorted = useMemo(() => sortEvents(events), [events]);
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const [filter, setFilter] = useState<InviteFilter>("all");
  const [form, setForm] = useState<"new" | "edit" | null>(null);
  const [picker, setPicker] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const event = sorted.find((e) => e.id === selectedId) ?? sorted[0] ?? null;
  const viewById = useMemo(() => new Map(views.map((v) => [v.friend.id, v])), [views]);
  const byEvent = useMemo(() => {
    const map = new Map<string, IgAttendeeRow[]>();
    for (const a of attendees) {
      if (!viewById.has(a.friend_id)) continue;
      const list = map.get(a.event_id) ?? [];
      list.push(a);
      map.set(a.event_id, list);
    }
    return map;
  }, [attendees, viewById]);

  const rows = event ? byEvent.get(event.id) ?? [] : [];
  const summary = summarize(rows);
  const visible = rows
    .filter((a) => matchesInviteFilter(a, filter))
    .sort((a, b) => displayName(viewById.get(a.friend_id)!.friend).localeCompare(displayName(viewById.get(b.friend_id)!.friend), "ja"));
  const unpaidUsernames = rows
    .filter((a) => matchesInviteFilter(a, "unpaid"))
    .map((a) => viewById.get(a.friend_id)!.friend.username);

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    try {
      await action();
      setError(null);
      await onChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }

  function patch(a: IgAttendeeRow, p: api.AttendeePatch) {
    void run(() => api.updateAttendee(a.event_id, a.friend_id, p));
  }

  const ended = event ? isEnded(event, today) : false;

  return (
    <div className="tn-main tn-main-events">
      <aside>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <p className="tn-side-label" style={{ margin: 0 }}>
            イベント
          </p>
          <button className="tn-btn tn-btn-accent" style={{ marginLeft: "auto" }} onClick={() => setForm("new")}>
            ＋ 新規イベント
          </button>
        </div>
        <div className="tn-event-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((e) => {
            const s = summarize(byEvent.get(e.id) ?? []);
            const done = isEnded(e, today);
            return (
              <button
                key={e.id}
                className="tn-event-card"
                aria-pressed={e.id === event?.id}
                onClick={() => {
                  setSelectedId(e.id);
                  setFilter("all");
                }}
              >
                <span className="tn-event-meta">
                  {formatEventShort(e)}
                  {e.location && ` · ${e.location}`}
                  <span className={`tn-badge${done ? " tn-badge-ended" : ""}`}>{done ? "終了" : "募集中"}</span>
                </span>
                <span className="tn-event-title">{e.title}</span>
                <span className="tn-muted">
                  リスト {s.listed}・参加 {s.yes}・支払 {s.paid}/{s.yes}
                </span>
              </button>
            );
          })}
          {sorted.length === 0 && <div className="tn-empty">まだイベントがありません。</div>}
        </div>
      </aside>

      <section>
        {error && <p className="tn-error" style={{ marginTop: 0 }}>エラー: {error}</p>}
        {event ? (
          <>
            <div className="tn-panel tn-event-head">
              <div style={{ flex: "1 1 320px" }}>
                <p className={`tn-eyebrow${ended ? " tn-eyebrow-ended" : ""}`}>{ended ? "終了したイベント" : "募集中のイベント"}</p>
                <h1 className="tn-event-h1">{event.title}</h1>
                <div className="tn-event-facts">
                  <span>{formatEventLong(event)}</span>
                  {event.location && <span>{event.location}</span>}
                  {event.fee !== null && <span>会費 {formatMoney(event.fee, event.currency)}</span>}
                  {event.capacity && <span>定員 {event.capacity}人</span>}
                  <button className="tn-btn tn-btn-ghost tn-btn-sm" style={{ padding: 0 }} onClick={() => setForm("edit")}>
                    編集
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="tn-btn" onClick={() => setPicker(true)}>
                  ＋ 友達を選んで追加
                </button>
                <button className="tn-btn tn-btn-dark" disabled={unpaidUsernames.length === 0} onClick={() => setReminder(true)}>
                  未払いの人にリマインド
                </button>
              </div>
            </div>

            <div className="tn-stats">
              <div className="tn-stat">
                <p className="tn-stat-label">誘った</p>
                <div className="tn-stat-value">
                  {summary.invited}
                  <small>/ {summary.listed}人</small>
                </div>
                <div className="tn-progress">
                  <span style={{ width: percent(summary.invited, summary.listed) }} />
                </div>
              </div>
              <div className="tn-stat">
                <p className="tn-stat-label">参加予定</p>
                <div className="tn-stat-value">
                  {summary.yes}
                  <small>{event.capacity ? `/ 定員${event.capacity}` : "人"}</small>
                </div>
                <p className="tn-stat-sub">
                  未定 {summary.maybe}・未返信 {summary.noReply}
                </p>
              </div>
              <div className="tn-stat">
                <p className="tn-stat-label">実際に出席</p>
                <div className="tn-stat-value">
                  {summary.attended}
                  <small>人</small>
                </div>
                <p className="tn-stat-sub">当日にチェックを付けます</p>
              </div>
              <div className="tn-stat">
                <p className="tn-stat-label">支払い済み</p>
                <div className="tn-stat-value">
                  {summary.paid}
                  <small>/ {summary.yes}人</small>
                </div>
                {event.fee !== null && (
                  <p className="tn-stat-sub">
                    集金 {formatMoney(summary.paid * event.fee, event.currency)} / {formatMoney(summary.yes * event.fee, event.currency)}
                  </p>
                )}
                <div className="tn-progress tn-progress-accent">
                  <span style={{ width: percent(summary.paid, summary.yes) }} />
                </div>
              </div>
            </div>

            <div className="tn-panel" style={{ padding: 0 }}>
              <div className="tn-list-head">
                <h2 className="tn-list-title">招待リスト</h2>
                {FILTERS.map((f) => (
                  <button key={f} className="tn-filter-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {INVITE_FILTER_LABELS[f]} {inviteFilterCount(summary, f)}
                  </button>
                ))}
                <span className="tn-hint">各セルをクリックで切り替え</span>
              </div>

              {rows.length === 0 ? (
                <div className="tn-empty" style={{ margin: "0 20px 20px", background: "var(--tn-bg)" }}>
                  まだ誰もいません。「＋ 友達を選んで追加」か、友達一覧で選んで追加してください。
                </div>
              ) : (
                <div className="tn-table-wrap">
                  <table className="tn-table">
                    <thead>
                      <tr>
                        <th>友達</th>
                        <th>コミュニティ</th>
                        <th>誘った</th>
                        <th>返事</th>
                        <th>出席</th>
                        <th>支払い</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((a) => {
                        const v = viewById.get(a.friend_id)!;
                        return (
                          <tr key={a.friend_id}>
                            <td>
                              <div className="tn-person">
                                <Avatar friend={v.friend} color={v.communities[0]} small />
                                <PersonName friend={v.friend} />
                              </div>
                            </td>
                            <td>{v.communities[0] ? <TagChip tag={v.communities[0]} /> : <span className="tn-muted">—</span>}</td>
                            <td>
                              <button className="tn-cell" data-v={a.invited ? "invited" : "empty"} onClick={() => patch(a, { invited: !a.invited })}>
                                {a.invited ? "誘った" : "未"}
                              </button>
                            </td>
                            <td>
                              <button className="tn-cell" data-v={a.reply} onClick={() => patch(a, { reply: REPLY_CYCLE[a.reply] })}>
                                {REPLY_LABELS[a.reply]}
                              </button>
                            </td>
                            <td>
                              <button className="tn-cell" data-v={a.attended ? "attended" : "empty"} onClick={() => patch(a, { attended: !a.attended })}>
                                {a.attended ? "出席" : "—"}
                              </button>
                            </td>
                            <td>
                              <button className="tn-cell" data-v={a.paid ? "paid" : "unpaid"} onClick={() => patch(a, { paid: !a.paid })}>
                                {a.paid ? "支払済" : "未払い"}
                              </button>
                            </td>
                            <td>
                              <button
                                className="tn-icon-btn"
                                aria-label={`@${v.friend.username} をリストから外す`}
                                onClick={() => void run(() => api.removeAttendee(a.event_id, a.friend_id))}
                              >
                                {Icon.close}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {rows.length > 0 && (
                <div className="tn-list-foot">
                  <span className="tn-muted" style={{ marginRight: "auto" }}>
                    表示中の {visible.length}人を
                  </span>
                  <ExportButtons
                    small
                    usernames={visible.map((a) => viewById.get(a.friend_id)!.friend.username)}
                    label={`${event.title}（${INVITE_FILTER_LABELS[filter]}）`}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="tn-empty">左上の「＋ 新規イベント」からイベントを作成してください。</div>
        )}
      </section>

      {form && (
        <EventFormModal
          event={form === "edit" ? event : null}
          onClose={() => setForm(null)}
          onSaved={async (id) => {
            setForm(null);
            if (id) setSelectedId(id);
            await onChanged();
          }}
          onDeleted={async () => {
            setForm(null);
            setSelectedId(null);
            await onChanged();
          }}
        />
      )}
      {picker && event && (
        <FriendPickerModal
          event={event}
          views={views}
          alreadyIds={new Set(rows.map((a) => a.friend_id))}
          onClose={() => setPicker(false)}
          onAdded={async () => {
            setPicker(false);
            await onChanged();
          }}
        />
      )}
      {reminder && event && <ReminderModal event={event} usernames={unpaidUsernames} onClose={() => setReminder(false)} />}
    </div>
  );
}
