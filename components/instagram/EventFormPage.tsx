"use client";

import { useMemo, useState } from "react";
import * as api from "@/lib/instagram/api";
import {
  EVENT_TEMPLATES,
  PAY_LABELS,
  PAY_METHODS,
  autoInviteMessage,
  formatLongDate,
  formatShortDate,
  type FriendView,
} from "@/lib/instagram/selectors";
import type { IgEventRow, IgTagRow } from "@/lib/supabase";
import { Avatar, CommunityChip, Icon, errorMessage, useCopy } from "./ui";

const MAX_AVATARS = 8;

function toDraft(e: IgEventRow | null): api.EventDraft {
  return {
    title: e?.title ?? "",
    event_date: e?.event_date ?? "",
    start_time: e?.start_time?.slice(0, 5) ?? "",
    location: e?.location ?? "",
    fee: e?.fee?.toString() ?? "",
    capacity: e?.capacity?.toString() ?? "",
    pay_method: e?.pay_method ?? "cash",
    invite_message: e?.invite_message ?? "",
    note: e?.note ?? "",
  };
}

/**
 * イベントの作成・編集画面。作成時は、選んだコミュニティの友達を「誘う候補」として
 * 友達一覧で選択した状態にして渡す（onCreated の candidateIds）。
 */
export default function EventFormPage({
  event,
  views,
  tags,
  onCancel,
  onCreated,
  onSaved,
  onDeleted,
}: {
  event: IgEventRow | null;
  views: FriendView[];
  tags: IgTagRow[];
  onCancel: () => void;
  onCreated: (id: string, candidateIds: string[]) => Promise<void>;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const editing = event !== null;
  const [draft, setDraft] = useState(() => toDraft(event));
  const [template, setTemplate] = useState<string | null>(null);
  const [communityIds, setCommunityIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, copy] = useCopy();

  const set = <K extends keyof api.EventDraft>(key: K, value: api.EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const field = (key: keyof api.EventDraft) => (e: { target: { value: string } }) => set(key, e.target.value);

  const communities = tags.filter((t) => t.kind === "community");
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of views) for (const t of v.communities) map.set(t.id, (map.get(t.id) ?? 0) + 1);
    return map;
  }, [views]);
  const candidates = useMemo(
    () => views.filter((v) => v.communities.some((t) => communityIds.includes(t.id))),
    [views, communityIds],
  );

  const autoMessage = autoInviteMessage(draft);
  const message = draft.invite_message || autoMessage;
  const canSave = !!(draft.title.trim() && draft.event_date);
  const feeLabel = draft.fee !== "" ? (Number(draft.fee) > 0 ? `RM${draft.fee}` : "無料") : "会費未設定";

  function pickTemplate(label: string) {
    const t = EVENT_TEMPLATES.find((x) => x.label === label)!;
    setTemplate(label);
    setDraft((d) => ({
      ...d,
      title: t.title,
      location: t.location,
      fee: t.fee,
      capacity: t.capacity,
      start_time: t.startTime,
      pay_method: t.payMethod,
    }));
  }

  function toggleCommunity(id: string) {
    setCommunityIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      // 自動作成のままなら空で保存し、あとで内容を変えても文面が追従するようにする
      const toSave = { ...draft, invite_message: draft.invite_message === autoMessage ? "" : draft.invite_message };
      if (editing) {
        await api.updateEvent(event.id, toSave);
        await onSaved();
      } else {
        const id = await api.createEvent(toSave);
        await onCreated(
          id,
          candidates.map((v) => v.friend.id),
        );
      }
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!event || !window.confirm(`「${event.title}」を削除しますか?招待リストも消えます。`)) return;
    setBusy(true);
    try {
      await api.deleteEvent(event.id);
      await onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const title = editing ? "イベントを編集" : "新しいイベントを作成";
  const ctaLabel = editing ? "保存する" : "作成して友達を選ぶ";
  const ctaHint = !canSave
    ? "イベント名と日付を入れると作成できます"
    : editing
      ? "変更内容を保存します"
      : "作成すると友達一覧に移り、候補が選択された状態になります";

  return (
    <div className="tn-create">
      <div className="tn-create-head-pc">
        <button type="button" className="tn-btn-link" style={{ alignSelf: "flex-start" }} onClick={onCancel}>
          ← イベント一覧に戻る
        </button>
        <h1 className="tn-h1">{title}</h1>
      </div>
      <header className="tn-sp tn-sp-modal-head">
        <button type="button" className="tn-icon-btn" style={{ color: "var(--tn-text)" }} aria-label="閉じる" onClick={onCancel}>
          {Icon.close}
        </button>
        <h1>{editing ? "イベントを編集" : "新しいイベント"}</h1>
      </header>

      <div className="tn-create-cols">
        <div>
          {!editing && (
            <section className="tn-form-section tn-form-section-templates">
              <h2>テンプレートから始める</h2>
              <div className="tn-chips">
                {EVENT_TEMPLATES.map((t) => (
                  <button key={t.label} type="button" className="tn-template" aria-pressed={template === t.label} onClick={() => pickTemplate(t.label)}>
                    {t.label}
                    <small>
                      RM{t.fee} · {t.capacity}人
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="tn-form-section">
            <h2 className="tn-pc">基本情報</h2>
            <label className="tn-field">
              <span>
                イベント名 <span className="tn-required">必須</span>
              </span>
              <input className="tn-input" value={draft.title} onChange={field("title")} placeholder="例:忘年会 2026" />
            </label>
            <div className="tn-form-grid">
              <label className="tn-field">
                <span>
                  日付 <span className="tn-required">必須</span>
                </span>
                <input className="tn-input" type="date" value={draft.event_date} onChange={field("event_date")} />
              </label>
              <label className="tn-field">
                開始時間
                <input className="tn-input" type="time" value={draft.start_time} onChange={field("start_time")} />
              </label>
              <label className="tn-field tn-field-wide-sp">
                場所
                <input className="tn-input" value={draft.location} onChange={field("location")} placeholder="例:Bukit Bintang" />
              </label>
            </div>
          </section>

          <section className="tn-form-section">
            <h2 className="tn-pc">会費と定員</h2>
            <div className="tn-form-grid">
              <label className="tn-field">
                <span>
                  会費(RM<span className="tn-pc">/1人</span>)
                </span>
                <input className="tn-input" type="number" min={0} value={draft.fee} onChange={field("fee")} placeholder="0" />
              </label>
              <label className="tn-field">
                定員(人)
                <input className="tn-input" type="number" min={1} value={draft.capacity} onChange={field("capacity")} placeholder="例:12" />
              </label>
            </div>
            <div className="tn-field">
              集金方法
              <div className="tn-chips">
                {PAY_METHODS.map((p) => (
                  <button key={p} type="button" className="tn-chip" aria-pressed={draft.pay_method === p} onClick={() => set("pay_method", p)}>
                    {PAY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {!editing && (
            <section className="tn-form-section" style={{ gap: 12 }}>
              <div>
                <h2>誘う候補のコミュニティ</h2>
                <p className="tn-form-note tn-pc">選んだコミュニティの友達が、作成後に最初から選択された状態になります。</p>
              </div>
              {communities.length === 0 ? (
                <p className="tn-muted" style={{ margin: 0 }}>
                  コミュニティのタグがまだありません。友達一覧の「＋ タグを作成」から作れます。
                </p>
              ) : (
                <div className="tn-chips">
                  {communities.map((t) => (
                    <CommunityChip key={t.id} tag={t} active={communityIds.includes(t.id)} onClick={() => toggleCommunity(t.id)}>
                      {t.name} <small>{counts.get(t.id) ?? 0}人</small>
                    </CommunityChip>
                  ))}
                </div>
              )}
              <div className="tn-sp" style={{ alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
                  {candidates.slice(0, 5).map((v) => (
                    <span key={v.friend.id} style={{ marginRight: -6, border: "2px solid #fff", borderRadius: "50%", display: "inline-flex" }}>
                      <Avatar friend={v.friend} color={v.communities[0]} small />
                    </span>
                  ))}
                </span>
                <span style={{ fontSize: 13, color: "var(--tn-text-2)", marginLeft: 12 }}>
                  <b>{candidates.length}人</b>が選択された状態で始まります
                </span>
              </div>
            </section>
          )}

          <section className="tn-form-section" style={{ gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div>
                <h2>
                  <label htmlFor="tn-invite-message">招待メッセージ(DM用)</label>
                </h2>
                <p className="tn-form-note tn-pc">入力した内容から自動で作られます。自由に書き換えられます。</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="tn-btn tn-btn-sm tn-pc" onClick={() => set("invite_message", "")}>
                  自動作成に戻す
                </button>
                <button type="button" className="tn-btn tn-btn-sm tn-btn-dark" onClick={() => copy(message)}>
                  {copied ? "コピーしました" : "コピー"}
                </button>
              </div>
            </div>
            <textarea
              id="tn-invite-message"
              className="tn-input"
              rows={7}
              value={message}
              onChange={(e) => set("invite_message", e.target.value)}
            />
            <button
              type="button"
              className="tn-btn-link tn-sp"
              style={{ alignSelf: "flex-start", fontSize: 12, textDecoration: "underline" }}
              onClick={() => set("invite_message", "")}
            >
              自動作成に戻す
            </button>
          </section>
        </div>

        <aside>
          <section className="tn-form-section" style={{ padding: 20, gap: 12 }}>
            <span className="tn-label" style={{ fontSize: 12 }}>
              プレビュー
            </span>
            <div className="tn-preview">
              <span className="tn-event-meta">
                <span>{draft.event_date ? formatShortDate(draft.event_date) : "日付未設定"}</span>
                <span className="tn-badge">募集中</span>
              </span>
              <span className="tn-preview-title" data-empty={!draft.title}>
                {draft.title || "イベント名"}
              </span>
              <span>{draft.event_date ? formatLongDate(draft.event_date, draft.start_time || null) : "日付未設定"}</span>
              <span>
                {draft.location || "場所未定"} · {feeLabel} · {draft.capacity ? `定員${draft.capacity}人` : "定員なし"}
              </span>
              <span>集金:{PAY_LABELS[draft.pay_method]}</span>
            </div>
          </section>

          {!editing && (
            <section className="tn-form-section" style={{ padding: 20, gap: 12 }}>
              <span className="tn-label" style={{ fontSize: 12 }}>
                誘う候補
              </span>
              <span className="tn-big-number">
                {candidates.length}
                <small> 人が選択された状態になります</small>
              </span>
              {candidates.length > 0 && (
                <div className="tn-avatars">
                  {candidates.slice(0, MAX_AVATARS).map((v) => (
                    <span key={v.friend.id} title={v.friend.display_name || v.friend.username}>
                      <Avatar friend={v.friend} color={v.communities[0]} small />
                    </span>
                  ))}
                  {candidates.length > MAX_AVATARS && <span className="tn-more">+{candidates.length - MAX_AVATARS}</span>}
                </div>
              )}
            </section>
          )}

          <div className="tn-cta-bar" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {error && <p className="tn-error">{error}</p>}
            <button type="button" className="tn-cta" disabled={!canSave || busy} onClick={save}>
              {busy ? "保存中…" : ctaLabel}
            </button>
            <span className="tn-cta-hint">{ctaHint}</span>
            <button type="button" className="tn-btn" style={{ borderRadius: 12 }} onClick={onCancel}>
              キャンセル
            </button>
            {editing && (
              <button type="button" className="tn-btn tn-btn-danger" style={{ borderRadius: 12 }} disabled={busy} onClick={remove}>
                このイベントを削除
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
