"use client";

import { useState } from "react";
import { updateFriend } from "@/lib/instagram/api";
import { formatDate, profileUrl, relationLabel, tagColor, type FriendView } from "@/lib/instagram/selectors";
import type { IgTagRow } from "@/lib/supabase";
import { Avatar, Modal, errorMessage } from "./ui";

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

  const firstCommunity = tags.find((t) => t.kind === "community" && tagIds.has(t.id));

  function TagGroup({ kind, label }: { kind: IgTagRow["kind"]; label: string }) {
    const list = tags.filter((t) => t.kind === kind);
    return (
      <div className="tn-field">
        {label}
        {list.length === 0 ? (
          <span style={{ fontWeight: 400 }}>まだタグがありません（左の「＋ タグを作成」から作れます）</span>
        ) : (
          <div className="tn-chip-wrap" style={{ marginBottom: 0 }}>
            {list.map((t) => {
              const on = tagIds.has(t.id);
              const c = tagColor(t);
              const style =
                on && kind === "community" ? { background: c.bg, borderColor: c.dot, color: c.fg } : undefined;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="tn-filter-chip"
                  aria-pressed={kind === "attribute" && on}
                  style={style}
                  onClick={() => toggleTag(t.id)}
                >
                  {on ? "✓ " : ""}
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal
      title="友達の情報"
      onClose={onClose}
      footer={
        <>
          {error && <span className="tn-error" style={{ marginRight: "auto" }}>{error}</span>}
          <button className="tn-btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="tn-btn tn-btn-dark" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存する"}
          </button>
        </>
      }
    >
      <div className="tn-card-head" style={{ marginBottom: 16 }}>
        <Avatar friend={{ ...f, display_name: displayName }} color={firstCommunity} />
        <div>
          <p className="tn-name">{displayName || f.username}</p>
          <a className="tn-handle" href={profileUrl(f.username)} target="_blank" rel="noreferrer">
            @{f.username}（Instagram を開く）
          </a>
        </div>
      </div>

      <div className="tn-info">
        {relationLabel(f)}
        {f.followed_me_at && `・フォローされた日 ${formatDate(f.followed_me_at)}`}
        <br />
        DM {f.dm_count.toLocaleString()}件{f.last_dm_at && `・最終 DM ${formatDate(f.last_dm_at)}`}
        <br />
        招待 {view.invitedCount}回・参加 {view.joinedCount}回
      </div>

      <label className="tn-field">
        名前
        <input className="tn-input" value={displayName} placeholder={f.username} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <div className="tn-row">
        <label className="tn-field">
          出会い
          <input className="tn-input" value={metWhere} placeholder="例: KL日本人会 新年会" onChange={(e) => setMetWhere(e.target.value)} />
        </label>
        <label className="tn-field">
          最後に会った日
          <input className="tn-input" type="date" value={lastMet} onChange={(e) => setLastMet(e.target.value)} />
        </label>
      </div>
      <TagGroup kind="community" label="コミュニティ・出会った場所" />
      <TagGroup kind="attribute" label="属性" />
      <label className="tn-field">
        メモ
        <textarea className="tn-input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="tn-muted" style={{ margin: 0 }}>
        「最後に会った」は、ここで入れた日と、出席にチェックしたイベントの日付のうち新しい方が表示されます。
      </p>
    </Modal>
  );
}
