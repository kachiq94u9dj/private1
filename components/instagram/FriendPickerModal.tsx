"use client";

import { useMemo, useState } from "react";
import { addAttendees } from "@/lib/instagram/api";
import { filterFriendViews, type FriendView } from "@/lib/instagram/selectors";
import type { IgEventRow } from "@/lib/supabase";
import { Avatar, Checkbox, Icon, Modal, PersonName, TagChip, errorMessage } from "./ui";

const LIMIT = 100;

export default function FriendPickerModal({
  event,
  views,
  alreadyIds,
  onClose,
  onAdded,
}: {
  event: IgEventRow;
  views: FriendView[];
  alreadyIds: Set<string>;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const communities = useMemo(() => {
    const map = new Map(views.flatMap((v) => v.communities).map((t) => [t.id, t]));
    return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [views]);
  const filtered = useMemo(
    () => filterFriendViews(views, { query, communityId, attributeIds: [] }),
    [views, query, communityId],
  );

  function toggle(id: string) {
    if (alreadyIds.has(id)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function add() {
    setBusy(true);
    try {
      await addAttendees(event.id, [...picked]);
      await onAdded();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={`「${event.title}」に友達を追加`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="tn-error" style={{ marginRight: "auto" }}>{error}</span>}
          <button className="tn-btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="tn-btn tn-btn-accent" onClick={add} disabled={busy || picked.size === 0}>
            {picked.size}人を招待リストに追加
          </button>
        </>
      }
    >
      <label className="tn-search" style={{ height: 44, marginBottom: 12 }}>
        {Icon.search}
        <input placeholder="名前・@ユーザー名・タグで検索" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </label>
      {communities.length > 0 && (
        <div className="tn-chip-wrap" style={{ marginBottom: 8 }}>
          <button className="tn-filter-chip" aria-pressed={!communityId} onClick={() => setCommunityId(null)}>
            すべて
          </button>
          {communities.map((t) => (
            <button
              key={t.id}
              className="tn-filter-chip"
              aria-pressed={communityId === t.id}
              onClick={() => setCommunityId(communityId === t.id ? null : t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      {filtered.slice(0, LIMIT).map((v) => {
        const already = alreadyIds.has(v.friend.id);
        return (
          <div key={v.friend.id} className="tn-pick-row" aria-disabled={already} onClick={() => toggle(v.friend.id)}>
            <Avatar friend={v.friend} color={v.communities[0]} small />
            <PersonName friend={v.friend} />
            <div className="tn-tags" style={{ marginLeft: "auto", justifyContent: "flex-end" }}>
              {v.communities.slice(0, 2).map((t) => (
                <TagChip key={t.id} tag={t} />
              ))}
            </div>
            {already ? (
              <span className="tn-muted" style={{ width: 56, textAlign: "right" }}>
                追加済み
              </span>
            ) : (
              <Checkbox checked={picked.has(v.friend.id)} onChange={() => toggle(v.friend.id)} label={`@${v.friend.username} を選択`} />
            )}
          </div>
        );
      })}
      {filtered.length > LIMIT && (
        <p className="tn-muted">ほか {filtered.length - LIMIT}人。検索で絞り込んでください。</p>
      )}
      {filtered.length === 0 && <p className="tn-muted">条件に合う友達がいません。</p>}
    </Modal>
  );
}
