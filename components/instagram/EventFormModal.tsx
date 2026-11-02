"use client";

import { useState } from "react";
import * as api from "@/lib/instagram/api";
import type { IgEventRow } from "@/lib/supabase";
import { Modal, errorMessage } from "./ui";

function toDraft(e: IgEventRow | null): api.EventDraft {
  return {
    title: e?.title ?? "",
    event_date: e?.event_date ?? "",
    start_time: e?.start_time?.slice(0, 5) ?? "",
    location: e?.location ?? "",
    fee: e?.fee?.toString() ?? "",
    currency: e?.currency ?? "RM",
    capacity: e?.capacity?.toString() ?? "",
    note: e?.note ?? "",
  };
}

export default function EventFormModal({
  event,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: IgEventRow | null;
  onClose: () => void;
  onSaved: (createdId: string | null) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => toDraft(event));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof api.EventDraft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function save() {
    if (!draft.title.trim()) {
      setError("イベント名を入れてください");
      return;
    }
    await run(async () => {
      if (event) {
        await api.updateEvent(event.id, draft);
        await onSaved(null);
      } else {
        await onSaved(await api.createEvent(draft));
      }
    });
  }

  async function remove() {
    if (!event || !window.confirm(`「${event.title}」を削除しますか？招待リストも消えます。`)) return;
    await run(async () => {
      await api.deleteEvent(event.id);
      await onDeleted();
    });
  }

  return (
    <Modal
      title={event ? "イベントを編集" : "新しいイベント"}
      onClose={onClose}
      footer={
        <>
          {event && (
            <button className="tn-btn tn-btn-ghost tn-btn-danger" style={{ marginRight: "auto" }} onClick={remove} disabled={busy}>
              削除
            </button>
          )}
          <button className="tn-btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="tn-btn tn-btn-dark" onClick={save} disabled={busy}>
            {event ? "保存する" : "作成する"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="tn-field">
          イベント名
          <input className="tn-input" value={draft.title} onChange={set("title")} placeholder="例: KL BBQナイト" autoFocus />
        </label>
        <div className="tn-row">
          <label className="tn-field">
            日付
            <input className="tn-input" type="date" value={draft.event_date} onChange={set("event_date")} />
          </label>
          <label className="tn-field">
            開始時刻
            <input className="tn-input" type="time" value={draft.start_time} onChange={set("start_time")} />
          </label>
        </div>
        <label className="tn-field">
          場所
          <input className="tn-input" value={draft.location} onChange={set("location")} placeholder="例: Mont Kiara" />
        </label>
        <div className="tn-row">
          <label className="tn-field">
            会費
            <div style={{ display: "flex", gap: 6 }}>
              <input className="tn-input" style={{ width: 70 }} value={draft.currency} onChange={set("currency")} aria-label="通貨" />
              <input className="tn-input" type="number" min={0} value={draft.fee} onChange={set("fee")} placeholder="60" />
            </div>
          </label>
          <label className="tn-field">
            定員
            <input className="tn-input" type="number" min={1} value={draft.capacity} onChange={set("capacity")} placeholder="15" />
          </label>
        </div>
        <label className="tn-field">
          メモ
          <textarea className="tn-input" value={draft.note} onChange={set("note")} />
        </label>
        {error && <p className="tn-error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
