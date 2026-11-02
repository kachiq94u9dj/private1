"use client";

import { useState } from "react";
import { createTag, deleteTag } from "@/lib/instagram/api";
import { TAG_COLORS } from "@/lib/instagram/selectors";
import type { IgTagRow, TagKind } from "@/lib/supabase";
import { Icon, Modal, TagChip, errorMessage } from "./ui";

export default function TagModal({
  tags,
  counts,
  onClose,
  onChanged,
}: {
  tags: IgTagRow[];
  counts: Map<string, number>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<TagKind>("community");
  const [color, setColor] = useState("red");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      setError(null);
      await onChanged();
    } catch (e) {
      setError(errorMessage(e).includes("duplicate") ? "同じ名前のタグがすでにあります" : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!name.trim()) return;
    await run(() => createTag(name.trim(), kind, kind === "community" ? color : ""));
    setName("");
  }

  return (
    <Modal title="タグを作成・管理" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="tn-field">
          種類
          <div className="tn-segment">
            <button type="button" className="tn-filter-chip" aria-pressed={kind === "community"} onClick={() => setKind("community")}>
              コミュニティ・出会った場所
            </button>
            <button type="button" className="tn-filter-chip" aria-pressed={kind === "attribute"} onClick={() => setKind("attribute")}>
              属性（日本人・学生など）
            </button>
          </div>
        </div>
        <label className="tn-field">
          名前
          <input
            className="tn-input"
            value={name}
            placeholder={kind === "community" ? "例: ランニング部" : "例: 駐在員"}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {kind === "community" && (
          <div className="tn-field">
            色
            <div className="tn-swatches">
              {Object.entries(TAG_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  className="tn-swatch"
                  aria-pressed={color === key}
                  aria-label={c.label}
                  style={{ background: c.dot }}
                  onClick={() => setColor(key)}
                />
              ))}
            </div>
          </div>
        )}
        <button type="submit" className="tn-btn tn-btn-dark" disabled={busy || !name.trim()}>
          作成する
        </button>
        {error && <p className="tn-error">{error}</p>}
      </form>

      {tags.length > 0 && (
        <>
          <p className="tn-side-label" style={{ marginTop: 24 }}>
            作成済みのタグ
          </p>
          {tags.map((t) => (
            <div key={t.id} className="tn-pick-row" style={{ cursor: "default" }}>
              <TagChip tag={t} />
              <span className="tn-muted">{counts.get(t.id) ?? 0}人</span>
              <button
                className="tn-icon-btn"
                style={{ marginLeft: "auto" }}
                aria-label={`${t.name} を削除`}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`タグ「${t.name}」を削除しますか？友達からも外れます。`)) void run(() => deleteTag(t.id));
                }}
              >
                {Icon.close}
              </button>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
