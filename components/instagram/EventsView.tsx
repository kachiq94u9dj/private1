"use client";

import { useMemo, useState } from "react";
import * as api from "@/lib/instagram/api";
import {
  INVITE_FILTERS,
  INVITE_FILTER_LABELS,
  PAY_LABELS,
  REPLY_CYCLE,
  REPLY_LABELS,
  displayName,
  formatFee,
  formatLongDate,
  formatShortDate,
  inviteFilterCount,
  isEnded,
  matchesInviteFilter,
  percent,
  summarize,
  type FriendView,
  type InviteFilter,
} from "@/lib/instagram/selectors";
import type { IgAttendeeRow, IgEventRow } from "@/lib/supabase";
import { Avatar, ExportButtons, Icon, LinksModal, PersonName, TagChip, errorMessage, useCopy } from "./ui";

function ReminderModal({ event, usernames, onClose }: { event: IgEventRow; usernames: string[]; onClose: () => void }) {
  const fee = event.fee ? `会費 RM${event.fee}` : "会費";
  const pay = event.pay_method !== "none" ? `（${PAY_LABELS[event.pay_method]}）` : "";
  const message = `「${event.title}」（${formatLongDate(event.event_date, event.start_time)}）の${fee}${pay}のお支払いがまだのようです。当日までにお願いできると助かります!`;
  const [copied, copy] = useCopy();
  return (
    <LinksModal title="未払いの人にリマインド" usernames={usernames} onClose={onClose}>
      <p className="tn-muted" style={{ margin: 0 }}>
        Instagram の規約上、DM は自動では送れません。下の文面をコピーして、一人ずつ DM で送ってください。
      </p>
      <textarea className="tn-input" rows={4} readOnly value={message} />
      <button type="button" className="tn-btn tn-btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => copy(message)}>
        {copied ? "コピーしました" : "文面をコピー"}
      </button>
    </LinksModal>
  );
}

interface Row {
  a: IgAttendeeRow;
  v: FriendView;
}

export default function EventsView({
  views,
  events,
  attendees,
  today,
  active,
  onActive,
  filter,
  onFilter,
  onCreate,
  onEdit,
  onInviteMore,
  onChanged,
}: {
  views: FriendView[];
  events: IgEventRow[];
  attendees: IgAttendeeRow[];
  today: string;
  active: IgEventRow | null;
  onActive: (id: string) => void;
  filter: InviteFilter;
  onFilter: (f: InviteFilter) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onInviteMore: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [reminder, setReminder] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const patch = (a: IgAttendeeRow, p: api.AttendeePatch) => void run(() => api.updateAttendee(a.event_id, a.friend_id, p));
  const remove = (a: IgAttendeeRow) => void run(() => api.removeAttendee(a.event_id, a.friend_id));

  const eventCards = events.map((e) => {
    const s = summarize(byEvent.get(e.id) ?? []);
    const ended = isEnded(e, today);
    return (
      <button key={e.id} type="button" className="tn-event-card" aria-pressed={e.id === active?.id} onClick={() => onActive(e.id)}>
        <span className="tn-event-meta">
          <span>
            {formatShortDate(e.event_date)}
            {e.location && ` · ${e.location}`}
          </span>
          <span className={`tn-badge tn-pc${ended ? " tn-badge-ended" : ""}`}>{ended ? "終了" : "募集中"}</span>
        </span>
        <span className="tn-event-title">{e.title}</span>
        <span className="tn-event-sub tn-pc">
          リスト {s.listed} · 参加 {s.going} · 支払 {s.paid}/{s.going}
        </span>
        <span className="tn-event-sub tn-sp">
          <span className={`tn-badge${ended ? " tn-badge-ended" : ""}`}>{ended ? "終了" : "募集中"}</span>
          参加 {s.going} · 支払 {s.paid}
        </span>
      </button>
    );
  });

  const spHeader = (
    <header className="tn-sp tn-sp-header tn-sp-header-events">
      <div className="tn-sp-title-row">
        <h1 className="tn-sp-h1">イベント</h1>
        <button type="button" className="tn-square-btn tn-square-btn-accent" aria-label="新規イベント" onClick={onCreate}>
          {Icon.plus}
        </button>
      </div>
      {events.length > 0 && <div className="tn-event-strip">{eventCards}</div>}
    </header>
  );

  if (!active) {
    return (
      <>
        {spHeader}
        <div className="tn-split tn-split-events">
          <aside>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 className="tn-label">イベント</h2>
              <button type="button" className="tn-btn tn-btn-accent tn-btn-sm" onClick={onCreate}>
                ＋ 新規イベント
              </button>
            </div>
          </aside>
          <section>
            <div className="tn-empty">まだイベントがありません。「＋ 新規イベント」から作成してください。</div>
          </section>
        </div>
      </>
    );
  }

  const rows: Row[] = (byEvent.get(active.id) ?? [])
    .map((a) => ({ a, v: viewById.get(a.friend_id)! }))
    .sort((x, y) => displayName(x.v.friend).localeCompare(displayName(y.v.friend), "ja"));
  const s = summarize(rows.map((r) => r.a));
  const visible = rows.filter((r) => matchesInviteFilter(r.a, filter));
  const unpaid = rows.filter((r) => matchesInviteFilter(r.a, "unpaid")).map((r) => r.v.friend.username);
  const ended = isEnded(active, today);
  const fee = active.fee ?? 0;

  const cells = (r: Row) => [
    <button
      key="inv"
      type="button"
      className="tn-cell"
      data-v={r.a.invited ? "invited" : "not-invited"}
      aria-pressed={r.a.invited}
      aria-label={`${displayName(r.v.friend)}:誘った ${r.a.invited ? "はい" : "いいえ"}`}
      onClick={() => patch(r.a, { invited: !r.a.invited })}
    >
      <span className="tn-cell-label">招待</span>
      {r.a.invited ? "誘った" : "未"}
    </button>,
    <button
      key="reply"
      type="button"
      className="tn-cell"
      data-v={r.a.reply}
      aria-label={`${displayName(r.v.friend)}:返事 ${REPLY_LABELS[r.a.reply]}(クリックで変更)`}
      onClick={() => patch(r.a, { reply: REPLY_CYCLE[r.a.reply], invited: true })}
    >
      <span className="tn-cell-label">返事</span>
      {REPLY_LABELS[r.a.reply]}
    </button>,
    <button
      key="came"
      type="button"
      className="tn-cell"
      data-v={r.a.attended ? "came" : "empty"}
      aria-pressed={r.a.attended}
      aria-label={`${displayName(r.v.friend)}:出席 ${r.a.attended ? "はい" : "いいえ"}`}
      onClick={() => patch(r.a, { attended: !r.a.attended })}
    >
      <span className="tn-cell-label">出席</span>
      {r.a.attended ? "出席" : "—"}
    </button>,
    <button
      key="paid"
      type="button"
      className="tn-cell tn-cell-paid"
      data-v={r.a.paid ? "paid" : "unpaid"}
      aria-pressed={r.a.paid}
      aria-label={`${displayName(r.v.friend)}:支払い ${r.a.paid ? "済み" : "まだ"}`}
      onClick={() => patch(r.a, { paid: !r.a.paid })}
    >
      <span className="tn-cell-label">支払い</span>
      {r.a.paid ? "支払済" : "未払い"}
    </button>,
  ];

  return (
    <>
      {spHeader}
      <div className="tn-split tn-split-events">
        <aside>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 className="tn-label">イベント</h2>
            <button type="button" className="tn-btn tn-btn-accent tn-btn-sm" onClick={onCreate}>
              ＋ 新規イベント
            </button>
          </div>
          {eventCards}
        </aside>

        <section>
          {error && <p className="tn-error">エラー: {error}</p>}

          <div className="tn-panel tn-event-head">
            <div>
              <span className="tn-eyebrow">{ended ? "終了したイベント" : "募集中のイベント"}</span>
              <h1 className="tn-h1">{active.title}</h1>
              <div className="tn-event-facts">
                <span>{formatLongDate(active.event_date, active.start_time)}</span>
                <span className="tn-pc">{active.location}</span>
                <span className="tn-pc">{formatFee(active)}</span>
                {active.capacity && <span className="tn-pc">定員 {active.capacity}人</span>}
                <span className="tn-sp">
                  {[active.location, formatFee(active), active.capacity ? `定員 ${active.capacity}人` : ""].filter(Boolean).join(" · ")}
                </span>
                <button type="button" className="tn-btn-link" style={{ fontSize: 13, textDecoration: "underline" }} onClick={() => onEdit(active.id)}>
                  編集
                </button>
              </div>
            </div>
            <div className="tn-event-actions">
              <button type="button" className="tn-btn" onClick={() => onInviteMore(active.id)}>
                ＋ 友達を選んで追加
              </button>
              <button type="button" className="tn-btn tn-btn-dark" disabled={unpaid.length === 0} onClick={() => setReminder(true)}>
                未払いの人にリマインド
              </button>
            </div>
          </div>

          <div className="tn-stats">
            <div className="tn-stat">
              <span className="tn-stat-label">誘った</span>
              <span className="tn-stat-value">
                {s.invited}
                <small> / {s.listed}人</small>
              </span>
              <div className="tn-progress" aria-hidden>
                <span style={{ width: `${percent(s.invited, s.listed)}%` }} />
              </div>
            </div>
            <div className="tn-stat">
              <span className="tn-stat-label">参加予定</span>
              <span className="tn-stat-value">
                {s.going}
                <small>{active.capacity ? ` / 定員${active.capacity}` : " 人"}</small>
              </span>
              <span className="tn-stat-sub">
                未定 {s.maybe} · 未返信 {s.noReply}
              </span>
            </div>
            <div className="tn-stat">
              <span className="tn-stat-label">実際に出席</span>
              <span className="tn-stat-value">
                {s.came}
                <small> 人</small>
              </span>
              <span className="tn-stat-sub">{ended ? `参加予定 ${s.going}人中 ${s.came}人が来場` : "当日にチェックを付けます"}</span>
            </div>
            <div className="tn-stat">
              <span className="tn-stat-label">支払い済み</span>
              <span className="tn-stat-value">
                {s.paid}
                <small> / {s.going}人</small>
              </span>
              <span className="tn-stat-sub">
                <span className="tn-pc">集金 </span>RM{(s.paid * fee).toLocaleString()} / RM{(s.going * fee).toLocaleString()}
              </span>
              <div className="tn-progress tn-progress-accent" aria-hidden>
                <span style={{ width: `${percent(s.paid, s.going)}%` }} />
              </div>
            </div>
          </div>

          <div className="tn-sp tn-event-actions-sp">
            <button type="button" className="tn-btn" onClick={() => onInviteMore(active.id)}>
              ＋ 友達を追加
            </button>
            <button type="button" className="tn-btn tn-btn-dark" disabled={unpaid.length === 0} onClick={() => setReminder(true)}>
              未払いにリマインド
            </button>
          </div>

          <div className="tn-list-panel">
            <div className="tn-list-head">
              <h2 className="tn-list-title">招待リスト</h2>
              <div className="tn-chips tn-invite-filters" style={{ gap: 8 }}>
                {INVITE_FILTERS.map((f) => (
                  <button key={f} type="button" className="tn-chip" aria-pressed={filter === f} onClick={() => onFilter(f)}>
                    {INVITE_FILTER_LABELS[f]} {inviteFilterCount(s, f)}
                  </button>
                ))}
              </div>
              <span className="tn-hint">各セルをクリックで切り替え</span>
            </div>

            {visible.length > 0 && (
              <>
                <div className="tn-table-wrap">
                  <table className="tn-table">
                    <thead>
                      <tr>
                        <th scope="col">友達</th>
                        <th scope="col">コミュニティ</th>
                        <th scope="col">誘った</th>
                        <th scope="col">返事</th>
                        <th scope="col">出席</th>
                        <th scope="col">支払い</th>
                        <th scope="col">
                          <span className="tn-sr">操作</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.a.friend_id}>
                          <td>
                            <div className="tn-row-person">
                              <Avatar friend={r.v.friend} color={r.v.communities[0]} small />
                              <PersonName friend={r.v.friend} />
                            </div>
                          </td>
                          <td>{r.v.communities[0] ? <TagChip tag={r.v.communities[0]} /> : <span className="tn-muted">—</span>}</td>
                          {cells(r).map((cell) => (
                            <td key={cell.key}>{cell}</td>
                          ))}
                          <td>
                            <button
                              type="button"
                              className="tn-icon-btn"
                              aria-label={`${displayName(r.v.friend)}をリストから外す`}
                              onClick={() => remove(r.a)}
                            >
                              {Icon.close}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="tn-invite-cards">
                  {visible.map((r) => (
                    <article key={r.a.friend_id} className="tn-invite-card">
                      <div className="tn-row-person">
                        <Avatar friend={r.v.friend} color={r.v.communities[0]} small />
                        <PersonName friend={r.v.friend} />
                        {r.v.communities[0] && <TagChip tag={r.v.communities[0]} />}
                      </div>
                      <div className="tn-invite-cells">{cells(r)}</div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {visible.length === 0 && (
              <div className="tn-muted" style={{ padding: "32px 20px", textAlign: "center", fontSize: 14 }}>
                {rows.length === 0 ? "まだ誰もいません。「＋ 友達を選んで追加」から追加してください。" : "該当する人はいません。"}
              </div>
            )}

            {visible.length > 0 && (
              <div className="tn-list-foot">
                <span className="tn-muted tn-pc" style={{ marginRight: "auto" }}>
                  表示中の {visible.length}人を
                </span>
                <ExportButtons
                  usernames={visible.map((r) => r.v.friend.username)}
                  label={`${active.title}（${INVITE_FILTER_LABELS[filter]}）`}
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {reminder && <ReminderModal event={active} usernames={unpaid} onClose={() => setReminder(false)} />}
    </>
  );
}
