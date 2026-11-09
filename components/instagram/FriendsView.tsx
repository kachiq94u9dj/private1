"use client";

import { useMemo, useState } from "react";
import {
  filterFriendViews,
  formatMonthDay,
  formatShortDate,
  historyLabel,
  tagColor,
  tagCounts,
  type FriendFilter,
  type FriendView,
} from "@/lib/instagram/selectors";
import type { IgEventRow, IgFriendTagRow, IgTagRow } from "@/lib/supabase";
import FriendEditModal from "./FriendEditModal";
import TagModal from "./TagModal";
import { Avatar, CommunityChip, Icon, PersonName, SelectBox, TagChip } from "./ui";

const PAGE = 60;

function FriendCard({
  view,
  selected,
  target,
  onToggle,
  onOpen,
}: {
  view: FriendView;
  selected: boolean;
  target: IgEventRow | null;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { friend, communities, attributes } = view;
  const name = friend.display_name.trim() || friend.username;
  const inTarget = !!target && view.eventIds.has(target.id);
  return (
    <article
      className="tn-card"
      data-selected={selected}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      tabIndex={0}
      aria-label={`${name}の情報を開く`}
    >
      <div className="tn-card-head">
        <Avatar friend={friend} color={communities[0]} />
        <PersonName friend={friend} />
        <SelectBox checked={selected} onChange={onToggle} label={`${name}${selected ? "の選択を解除" : "を選択"}`} />
      </div>
      <div className="tn-card-body">
        <div className="tn-sp">
          <PersonName friend={friend} />
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
          <dd>{historyLabel(view)}</dd>
        </dl>
        <span className="tn-facts-line tn-sp">
          {friend.met_where || "出会い未入力"} · 最後 {formatMonthDay(view.lastMet)}
        </span>
        {inTarget && (
          <div className="tn-banner">
            「{target.title}」<span className="tn-pc">の招待リスト</span>に追加済み
          </div>
        )}
      </div>
    </article>
  );
}

export default function FriendsView({
  views,
  tags,
  friendTags,
  upcoming,
  target,
  onTarget,
  filter,
  onFilter,
  selected,
  onSelected,
  onAdd,
  onImport,
  onChanged,
}: {
  views: FriendView[];
  tags: IgTagRow[];
  friendTags: IgFriendTagRow[];
  upcoming: IgEventRow[];
  target: IgEventRow | null;
  onTarget: (id: string) => void;
  filter: FriendFilter;
  onFilter: (f: FriendFilter) => void;
  selected: Set<string>;
  onSelected: (s: Set<string>) => void;
  onAdd: () => Promise<void>;
  onImport: () => void;
  onChanged: () => Promise<void>;
}) {
  const [limit, setLimit] = useState(PAGE);
  const [editing, setEditing] = useState<FriendView | null>(null);
  const [tagModal, setTagModal] = useState(false);
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => tagCounts(friendTags), [friendTags]);
  const communities = tags.filter((t) => t.kind === "community");
  const attributes = tags.filter((t) => t.kind === "attribute");
  const filtered = useMemo(() => filterFriendViews(views, filter), [views, filter]);

  function update(patch: Partial<FriendFilter>) {
    onFilter({ ...filter, ...patch });
    setLimit(PAGE);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelected(next);
  }

  function selectAllVisible() {
    onSelected(new Set([...selected, ...filtered.map((v) => v.friend.id)]));
  }

  const pickCommunity = (id: string | null) => update({ communityId: filter.communityId === id ? null : id });
  const pickAttribute = (id: string) => update({ attributeId: filter.attributeId === id ? null : id });
  const clearFilter = () => update({ communityId: null, attributeId: null, query: "" });

  const search = (
    <label className="tn-search">
      {Icon.search}
      <span className="tn-sr">友達を検索</span>
      <input
        type="search"
        placeholder="名前・@ユーザー名・タグで検索"
        value={filter.query}
        onChange={(e) => update({ query: e.target.value })}
      />
    </label>
  );

  const targetChips = upcoming.map((e) => (
    <button key={e.id} type="button" className="tn-chip" aria-pressed={target?.id === e.id} onClick={() => onTarget(e.id)}>
      {formatShortDate(e.event_date)} {e.title}
    </button>
  ));

  async function add() {
    setAdding(true);
    await onAdd();
    setAdding(false);
  }

  return (
    <>
      <header className="tn-sp tn-sp-header">
        <div className="tn-sp-title-row">
          <h1 className="tn-sp-h1">
            友達 <small>{views.length.toLocaleString()}</small>
          </h1>
          <button type="button" className="tn-square-btn" aria-label="Instagramから取り込み" onClick={onImport}>
            {Icon.refresh}
          </button>
        </div>
        {search}
        <div className="tn-scroll-row">
          <button
            type="button"
            className="tn-chip"
            aria-pressed={!filter.communityId}
            style={{ borderColor: "var(--tn-text)" }}
            onClick={clearFilter}
          >
            すべて
          </button>
          {communities.map((t) => (
            <CommunityChip
              key={t.id}
              tag={t}
              active={filter.communityId === t.id}
              onClick={() => pickCommunity(t.id)}
              className="tn-chip-comm"
            >
              <span className="tn-dot" style={{ background: tagColor(t).fg }} />
              {t.name}
            </CommunityChip>
          ))}
        </div>
        {attributes.length > 0 && (
          <div className="tn-scroll-row">
            {attributes.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tn-chip tn-chip-light"
                aria-pressed={filter.attributeId === t.id}
                onClick={() => pickAttribute(t.id)}
              >
                {t.name}
              </button>
            ))}
            <button type="button" className="tn-chip tn-chip-light" onClick={() => setTagModal(true)}>
              ＋ タグ
            </button>
          </div>
        )}
      </header>

      <div className="tn-split">
        <aside>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 className="tn-label">コミュニティ・出会った場所</h2>
            <div className="tn-side-list">
              <button type="button" className="tn-side-item tn-side-item-all" aria-pressed={!filter.communityId} onClick={clearFilter}>
                <span>すべての友達</span>
                <span>{views.length.toLocaleString()}</span>
              </button>
              {communities.map((t) => {
                const active = filter.communityId === t.id;
                const c = tagColor(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="tn-side-item"
                    aria-pressed={active}
                    style={active ? { background: c.bg, color: c.fg } : undefined}
                    onClick={() => pickCommunity(t.id)}
                  >
                    <span>
                      <span className="tn-dot" style={{ background: c.fg }} />
                      {t.name}
                    </span>
                    <span>{counts.get(t.id) ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {attributes.length > 0 && (
            <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 className="tn-label">属性</h2>
              <div className="tn-chips" style={{ gap: 6 }}>
                {attributes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="tn-chip tn-chip-light"
                    aria-pressed={filter.attributeId === t.id}
                    onClick={() => pickAttribute(t.id)}
                  >
                    {t.name}
                    <small>{counts.get(t.id) ?? 0}</small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <button type="button" className="tn-dashed-btn" onClick={() => setTagModal(true)}>
            ＋ タグを作成
          </button>
        </aside>

        <section>
          <div className="tn-toolbar">
            {search}
            <span className="tn-muted" style={{ fontSize: 14 }}>
              {filtered.length.toLocaleString()}人を表示
            </span>
            <button type="button" className="tn-btn tn-select-all-pc" onClick={selectAllVisible}>
              表示中を全選択
            </button>
            <button type="button" className="tn-sp tn-select-all-sp" onClick={selectAllVisible}>
              表示中を全選択
            </button>
          </div>

          {selected.size > 0 && (
            <div className="tn-selbar">
              <span className="tn-selbar-count tn-pc">{selected.size}人を選択中</span>
              <div className="tn-sp tn-selbar-top">
                <span className="tn-selbar-count">{selected.size}人を選択中</span>
                <button type="button" onClick={() => onSelected(new Set())}>
                  選択解除
                </button>
              </div>
              {upcoming.length > 0 ? (
                <>
                  <span className="tn-selbar-label">招待先のイベント</span>
                  <div className="tn-chips tn-selbar-targets" style={{ gap: 6 }}>
                    {targetChips}
                  </div>
                </>
              ) : (
                <span className="tn-selbar-label" style={{ display: "inline" }}>
                  これからのイベントがありません。「イベント」から作成してください
                </span>
              )}
              <div className="tn-selbar-actions">
                <button type="button" className="tn-selbar-clear" onClick={() => onSelected(new Set())}>
                  選択解除
                </button>
                <button type="button" className="tn-btn tn-btn-accent" disabled={!target || adding} onClick={add}>
                  招待リストに追加
                </button>
              </div>
            </div>
          )}

          {views.length === 0 ? (
            <div className="tn-empty">まだ友達がいません。「Instagramから取り込み」から読み込んでください。</div>
          ) : filtered.length === 0 ? (
            <div className="tn-empty">条件に合う友達がいません。検索語やタグを変えてみてください。</div>
          ) : (
            <div className="tn-grid">
              {filtered.slice(0, limit).map((v) => (
                <FriendCard
                  key={v.friend.id}
                  view={v}
                  selected={selected.has(v.friend.id)}
                  target={target}
                  onToggle={() => toggle(v.friend.id)}
                  onOpen={() => setEditing(v)}
                />
              ))}
            </div>
          )}
          {filtered.length > limit && (
            <div style={{ textAlign: "center" }}>
              <button type="button" className="tn-btn" onClick={() => setLimit((l) => l + PAGE)}>
                さらに表示（残り {(filtered.length - limit).toLocaleString()}人）
              </button>
            </div>
          )}
          {selected.size > 0 && <div className="tn-sp" style={{ height: 150 }} aria-hidden />}
        </section>
      </div>

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
    </>
  );
}
