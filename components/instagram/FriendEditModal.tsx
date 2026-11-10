"use client";

import { useState } from "react";
import { updateFriend } from "@/lib/instagram/api";
import { formatDate, historyLabel, profileUrl, relationLabel, type FriendView } from "@/lib/instagram/selectors";
import type { IgTagRow } from "@/lib/supabase";
import { Avatar, CommunityChip, Modal, errorMessage } from "./ui";

export default function FriendEditModal({
  view,
  tags,
  onClose,
  onSaved,
}: {
  view: FriendView;
  tags: IgTagRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const f = view.friend;
  const [displayName, setDisplayName] = useState(f.display_name);
  const [metWhere, setMetWhere] = useState(f.met_where);
  const [lastMet, setLastMet] = useState(f.last_met_on ?? "");
  const [note, setNote] = useState(f.note);
  const [tagIds, setTagIds] = useState<Set<string>>(new Set([...view.communities, ...view.attributes].map((t) => t.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const communities = tags.filter((t) => t.kind === "community");
  const attributes = tags.filter((t) => t.kind === "attribute");
  const firstCommunity = communities.find((t) => tagIds.has(t.id));

  function toggleTag(id: string) {
    setTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await updateFriend(
        f.id,
        { display_name: displayName.trim(), met_where: metWhere.trim(), last_met_on: lastMet || null, note },
        [...tagIds],
      );
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const noTags = <span className="tn-muted" style={{ fontWeight: 400 }}>まだありません（友達一覧の「＋ タグを作成」から作れます）</span>;

  return (
    <Modal
      title="友達の情報"
      onClose={onClose}
      footer={
        <>
          {error && <span className="tn-error" style={{ marginRight: "auto" }}>{error}</span>}
          <button type="button" className="tn-btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="tn-btn tn-btn-dark" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存する"}
          </button>
        </>
      }
    >
      <div className="tn-row-person">
        <Avatar friend={{ ...f, display_name: displayName }} color={firstCommunity} />
        <div className="tn-person">
          <a className="tn-name tn-name-link" href={profileUrl(f.username)} target="_blank" rel="noreferrer">
            {f.username}
          </a>
          <span className="tn-handle">{displayName.trim() || "名前未入力"}</span>
        </div>
      </div>

      <div className="tn-info">
        {relationLabel(f)}
        {f.followed_me_at && ` · フォローされた日 ${formatDate(f.followed_me_at)}`}
        <br />
        DM {f.dm_count.toLocaleString()}件{f.last_dm_at && ` · 最終 DM ${formatDate(f.last_dm_at)}`}
        <br />
        {historyLabel(view)}
      </div>

      <label className="tn-field">
        名前（Instagram のプロフィール名など）
        <input className="tn-input" value={displayName} placeholder="例:momoka" onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="tn-field">
        メモ（カードに表示されます）
        <textarea className="tn-input" rows={3} value={note} placeholder="例:前回の BBQ に来てくれた。お酒は飲まない" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="tn-form-grid">
        <label className="tn-field">
          出会い
          <input className="tn-input" value={metWhere} placeholder="例:KL日本人会 新年会" onChange={(e) => setMetWhere(e.target.value)} />
        </label>
        <label className="tn-field">
          最後に会った日
          <input className="tn-input" type="date" value={lastMet} onChange={(e) => setLastMet(e.target.value)} />
        </label>
      </div>
      <div className="tn-field">
        コミュニティ・出会った場所
        {communities.length === 0 ? (
          noTags
        ) : (
          <div className="tn-chips">
            {communities.map((t) => (
              <CommunityChip key={t.id} tag={t} active={tagIds.has(t.id)} onClick={() => toggleTag(t.id)}>
                {t.name}
              </CommunityChip>
            ))}
          </div>
        )}
      </div>
      <div className="tn-field">
        属性
        {attributes.length === 0 ? (
          noTags
        ) : (
          <div className="tn-chips">
            {attributes.map((t) => (
              <button key={t.id} type="button" className="tn-chip tn-chip-light" aria-pressed={tagIds.has(t.id)} onClick={() => toggleTag(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="tn-muted" style={{ margin: 0, fontSize: 12 }}>
        「最後に会った」は、ここで入れた日と、出席にチェックしたイベントの日付のうち新しい方が表示されます。
      </p>
    </Modal>
  );
}
