"use client";

import { useMemo, useState } from "react";
import { addAttendees } from "@/lib/instagram/api";
import {
  filterFriendViews,
  formatMonthDay,
  sortEvents,
  tagColor,
  tagCounts,
  type FriendFilter,
  type FriendView,
} from "@/lib/instagram/selectors";
import type { IgEventRow, IgFriendTagRow, IgTagRow } from "@/lib/supabase";
import FriendEditModal from "./FriendEditModal";
import TagModal from "./TagModal";
import { Avatar, Checkbox, ExportButtons, Icon, PersonName, TagChip, errorMessage } from "./ui";

const PAGE = 60;

function FriendCard({
  view,
  selected,
  onToggle,
  onOpen,
}: {
  view: FriendView;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { friend, communities, attributes } = view;
  return (
    <article
      className="tn-card"
      data-selected={selected}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      tabIndex={0}
    >
      <div className="tn-card-head">
        <Avatar friend={friend} color={communities[0]} />
        <PersonName friend={friend} />
        <Checkbox checked={selected} onChange={onToggle} label={`@${friend.username} を選択`} />
      </div>
      {communities.length + attributes.length > 0 && (
        <div className="tn-tags">
          {[...communities, ...attributes].map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      )}
      <dl className="tn-facts">
        <dt>出会い</dt>
        <dd>{friend.met_where || "—"}</dd>
        <dt>最後に会った</dt>
        <dd>{formatMonthDay(view.lastMet)}</dd>
        <dt>参加歴</dt>
        <dd>
          招待 {view.invitedCount}回・参加 {view.joinedCount}回
        </dd>
      </dl>
      {view.upcomingEvent && <div className="tn-banner">「{view.upcomingEvent.title}」の招待リストに追加済み</div>}
    </article>
  );
}

export default function FriendsView({
  views,
  tags,
  friendTags,
  events,
  onChanged,
}: {
  views: FriendView[];
  tags: IgTagRow[];
  friendTags: IgFriendTagRow[];
  events: IgEventRow[];
  onChanged: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<FriendFilter>({ query: "", communityId: null, attributeIds: [] });
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<FriendView | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [targetEvent, setTargetEvent] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const counts = useMemo(() => tagCounts(friendTags), [friendTags]);
  const communities = tags.filter((t) => t.kind === "community");
  const attributes = tags.filter((t) => t.kind === "attribute");
  const filtered = useMemo(() => filterFriendViews(views, filter), [views, filter]);
  const selectedViews = views.filter((v) => selected.has(v.friend.id));
  const sortedEvents = useMemo(() => sortEvents(events), [events]);

  function update(patch: Partial<FriendFilter>) {
    setFilter({ ...filter, ...patch });
    setLimit(PAGE);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addToEvent() {
    const eventId = targetEvent || sortedEvents[0]?.id;
    if (!eventId) return;
    try {
      await addAttendees(eventId, [...selected]);
      const title = events.find((e) => e.id === eventId)?.title ?? "";
      setMessage(`${selected.size}人を「${title}」の招待リストに追加しました`);
      setSelected(new Set());
      await onChanged();
    } catch (e) {
      setMessage(`追加できませんでした: ${errorMessage(e)}`);
    }
  }

  return (
    <div className="tn-main">
      <aside>
        <p className="tn-side-label">コミュニティ・出会った場所</p>
        <div className="tn-side-list">
          <button className="tn-side-item" aria-pressed={!filter.communityId} onClick={() => update({ communityId: null })}>
            すべての友達
            <span className="tn-side-count">{views.length}</span>
          </button>
          {communities.map((t) => (
            <button
              key={t.id}
              className="tn-side-item"
              aria-pressed={filter.communityId === t.id}
              onClick={() => update({ communityId: filter.communityId === t.id ? null : t.id })}
            >
              <span className="tn-dot" style={{ background: tagColor(t).dot }} />
              {t.name}
              <span className="tn-side-count">{counts.get(t.id) ?? 0}</span>
            </button>
          ))}
        </div>

        {attributes.length > 0 && (
          <>
            <p className="tn-side-label">属性</p>
            <div className="tn-chip-wrap">
              {attributes.map((t) => {
                const on = filter.attributeIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    className="tn-filter-chip"
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        attributeIds: on ? filter.attributeIds.filter((id) => id !== t.id) : [...filter.attributeIds, t.id],
                      })
                    }
                  >
                    {t.name}
                    <small>{counts.get(t.id) ?? 0}</small>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button className="tn-dashed-btn" onClick={() => setTagModal(true)}>
          ＋ タグを作成
        </button>
      </aside>

      <section>
        <div className="tn-toolbar">
          <label className="tn-search">
            {Icon.search}
            <input
              placeholder="名前・@ユーザー名・タグで検索"
              value={filter.query}
              onChange={(e) => update({ query: e.target.value })}
            />
          </label>
          <span className="tn-muted">{filtered.length.toLocaleString()}人を表示</span>
          <button className="tn-btn" onClick={() => setSelected(new Set(filtered.map((v) => v.friend.id)))}>
            表示中を全選択
          </button>
        </div>

        {message && (
          <p className="tn-ok" style={{ margin: "0 0 12px" }}>
            {message}
          </p>
        )}

        {views.length === 0 ? (
          <div className="tn-empty">まだ友達がいません。右上の「Instagramから取り込み」から読み込んでください。</div>
        ) : filtered.length === 0 ? (
          <div className="tn-empty">条件に合う友達がいません。</div>
        ) : (
          <div className="tn-grid">
            {filtered.slice(0, limit).map((v) => (
              <FriendCard
                key={v.friend.id}
                view={v}
                selected={selected.has(v.friend.id)}
                onToggle={() => toggle(v.friend.id)}
                onOpen={() => setEditing(v)}
              />
            ))}
          </div>
        )}
        {filtered.length > limit && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button className="tn-btn" onClick={() => setLimit((l) => l + PAGE)}>
              さらに表示（残り {(filtered.length - limit).toLocaleString()}人）
            </button>
          </div>
        )}
      </section>

      {selected.size > 0 && (
        <div className="tn-selbar">
          <strong style={{ fontSize: 13 }}>{selected.size}人を選択中</strong>
          {sortedEvents.length > 0 ? (
            <>
              <select value={targetEvent || sortedEvents[0].id} onChange={(e) => setTargetEvent(e.target.value)} aria-label="追加先のイベント">
                {sortedEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
              <button className="tn-btn tn-btn-accent" onClick={addToEvent}>
                招待リストに追加
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, opacity: 0.8 }}>イベントを作ると招待リストに追加できます</span>
          )}
          <ExportButtons usernames={selectedViews.map((v) => v.friend.username)} label="選択した友達" />
          <button className="tn-btn" onClick={() => setSelected(new Set())}>
            選択解除
          </button>
        </div>
      )}

      {editing && (
        <FriendEditModal
          view={editing}
          tags={tags}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await onChanged();
          }}
        />
      )}
      {tagModal && <TagModal tags={tags} counts={counts} onClose={() => setTagModal(false)} onChanged={onChanged} />}
    </div>
  );
}
