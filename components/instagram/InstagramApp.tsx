"use client";

import { useEffect, useMemo, useState } from "react";
import { addAttendees, sendLoginLink, signOut } from "@/lib/instagram/api";
import {
  EMPTY_FRIEND_FILTER,
  buildFriendViews,
  formatDateTime,
  isEnded,
  localDateString,
  sortEvents,
  type FriendFilter,
  type InviteFilter,
} from "@/lib/instagram/selectors";
import { useInstagram } from "@/lib/instagram/useInstagram";
import EventFormPage from "./EventFormPage";
import EventsView from "./EventsView";
import FriendsView from "./FriendsView";
import ImportModal from "./ImportModal";
import { Icon, errorMessage } from "./ui";

type Tab = "friends" | "events";

const TARGETS_KEY = "tomodachi-note:target-event-ids";
type Form = { mode: "create" } | { mode: "edit"; eventId: string } | null;

function Brand() {
  return (
    <div className="tn-brand">
      <span className="tn-logo" aria-hidden>
        {Icon.people}
      </span>
      <div>
        <p className="tn-brand-name">ともだちノート</p>
        <p className="tn-brand-sub">Instagramの友達とイベントをまとめて管理</p>
      </div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="tn-login">
      <Brand />
      <div className="tn-panel">
        {sent ? (
          <p style={{ margin: 0 }}>
            {email} にログイン用のリンクを送りました。メールを開いてリンクをクリックしてください。
          </p>
        ) : (
          <form
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await sendLoginLink(email, `${window.location.origin}/instagram`);
                setSent(true);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            <label className="tn-field">
              メールアドレス
              <input className="tn-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="tn-btn tn-btn-dark">
              ログインリンクを送る
            </button>
          </form>
        )}
        {error && <p className="tn-error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}

export default function InstagramApp() {
  const { session, friends, tags, friendTags, events, attendees, loaded, error, reload } = useInstagram();
  const [tab, setTab] = useState<Tab>("friends");
  const [form, setForm] = useState<Form>(null);
  const [importing, setImporting] = useState(false);
  // 画面をまたいで保つ状態（イベント作成 → 友達一覧で候補を選んだまま移る、など）
  const [friendFilter, setFriendFilter] = useState<FriendFilter>(EMPTY_FRIEND_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // 招待先のイベント（複数選べる）。null のあいだは、いちばん新しい募集中のイベントを選んだ状態として扱う。
  // 再読み込みしても選択が戻らないよう、このブラウザに覚えておく。
  const [targetIds, setTargetIds] = useState<string[] | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TARGETS_KEY) ?? "null");
      return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === "string") : null;
    } catch {
      return null;
    }
  });
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  // 招待リストに追加したあとの「追加しました」表示（友達一覧に残ったまま続けて選べるように、画面は移らない）
  const [notice, setNotice] = useState<{ text: string; eventId: string } | null>(null);
  const today = localDateString();

  const views = useMemo(
    () => buildFriendViews(friends, tags, friendTags, events, attendees, today),
    [friends, tags, friendTags, events, attendees, today],
  );
  const sortedEvents = useMemo(() => sortEvents(events), [events]);
  const upcoming = useMemo(() => sortedEvents.filter((e) => !isEnded(e, today)), [sortedEvents, today]);
  // 覚えていたイベントが終わった・消えた場合は、最初の状態に戻す
  const savedIds = targetIds?.filter((id) => upcoming.some((e) => e.id === id)) ?? null;
  const chosenIds =
    savedIds && (savedIds.length > 0 || targetIds?.length === 0) ? savedIds : upcoming[0] ? [upcoming[0].id] : [];
  const targets = upcoming.filter((e) => chosenIds.includes(e.id));
  const activeEvent = sortedEvents.find((e) => e.id === activeEventId) ?? sortedEvents[0] ?? null;
  const lastImport = friends.reduce<string | null>((max, f) => (!max || f.imported_at > max ? f.imported_at : max), null);

  useEffect(() => {
    if (loaded && friends.length === 0) setImporting(true);
  }, [loaded, friends.length]);

  useEffect(() => {
    try {
      if (targetIds) localStorage.setItem(TARGETS_KEY, JSON.stringify(targetIds));
    } catch {
      // 保存できない環境（プライベートブラウズなど）では覚えないだけ
    }
  }, [targetIds]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function go(next: Tab) {
    setForm(null);
    setTab(next);
    window.scrollTo(0, 0);
  }

  async function addSelectedToTarget() {
    if (targets.length === 0 || selected.size === 0) return;
    try {
      const count = selected.size;
      for (const t of targets) await addAttendees(t.id, [...selected]);
      await reload();
      setSelected(new Set());
      setActionError(null);
      const titles = targets.map((t) => `「${t.title}」`).join("");
      setNotice({ text: `${count}人を${titles}の招待リストに追加しました`, eventId: targets[0].id });
    } catch (e) {
      setActionError(`招待リストに追加できませんでした: ${errorMessage(e)}`);
    }
  }

  if (session === undefined) return <div className="tn-root" />;
  if (session === null) {
    return (
      <div className="tn-root">
        <Login />
      </div>
    );
  }

  const editing = form?.mode === "edit" ? events.find((e) => e.id === form.eventId) ?? null : null;

  return (
    <div className="tn-root" data-creating={form !== null}>
      <header className="tn-header tn-pc">
        <div className="tn-header-inner">
          <Brand />
          <nav className="tn-tabs" aria-label="表示切り替え">
            <button type="button" className="tn-tab" aria-pressed={tab === "friends"} onClick={() => go("friends")}>
              友達一覧<span className="tn-tab-count">{friends.length.toLocaleString()}</span>
            </button>
            <button type="button" className="tn-tab" aria-pressed={tab === "events"} onClick={() => go("events")}>
              イベント<span className="tn-tab-count">{events.length}</span>
            </button>
          </nav>
          <div className="tn-header-right">
            {lastImport && <span className="tn-muted">最終取り込み: {formatDateTime(lastImport)}</span>}
            <button type="button" className="tn-btn" onClick={() => setImporting(true)}>
              {Icon.refresh}
              Instagramから取り込み
            </button>
            <button type="button" className="tn-btn-link" onClick={() => void signOut()} title={session.user.email}>
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="tn-main">
        {(error || actionError) && (
          <p className="tn-error" style={{ padding: "0 0 12px" }}>
            {error ? `データを読み込めませんでした: ${error}` : actionError}
          </p>
        )}
        {!loaded ? (
          <p className="tn-muted">読み込み中…</p>
        ) : form ? (
          <EventFormPage
            key={form.mode === "edit" ? form.eventId : "new"}
            event={editing}
            views={views}
            tags={tags}
            onCancel={() => setForm(null)}
            onCreated={async (id, candidateIds) => {
              await reload();
              setTargetIds([id]);
              setActiveEventId(id);
              setSelected(new Set(candidateIds));
              setFriendFilter(EMPTY_FRIEND_FILTER);
              go("friends");
            }}
            onSaved={async () => {
              await reload();
              setForm(null);
            }}
            onDeleted={async () => {
              await reload();
              setActiveEventId(null);
              setForm(null);
            }}
          />
        ) : tab === "friends" ? (
          <FriendsView
            views={views}
            tags={tags}
            friendTags={friendTags}
            upcoming={upcoming}
            targets={targets}
            onToggleTarget={(id) =>
              setTargetIds(chosenIds.includes(id) ? chosenIds.filter((x) => x !== id) : [...chosenIds, id])
            }
            filter={friendFilter}
            onFilter={setFriendFilter}
            selected={selected}
            onSelected={setSelected}
            onAdd={addSelectedToTarget}
            onImport={() => setImporting(true)}
            onChanged={reload}
          />
        ) : (
          <EventsView
            views={views}
            events={sortedEvents}
            attendees={attendees}
            today={today}
            active={activeEvent}
            onActive={(id) => {
              setActiveEventId(id);
              setInviteFilter("all");
            }}
            filter={inviteFilter}
            onFilter={setInviteFilter}
            onCreate={() => setForm({ mode: "create" })}
            onEdit={(id) => setForm({ mode: "edit", eventId: id })}
            onInviteMore={(id) => {
              if (upcoming.some((e) => e.id === id)) setTargetIds([id]);
              go("friends");
            }}
            onChanged={reload}
          />
        )}
      </main>

      {!form && (
        <nav className="tn-bottom-nav" aria-label="表示切り替え">
          <button type="button" aria-pressed={tab === "friends"} onClick={() => go("friends")}>
            {Icon.peopleNav}友達
          </button>
          <button type="button" aria-pressed={tab === "events"} onClick={() => go("events")}>
            {Icon.calendar}イベント
          </button>
        </nav>
      )}

      {notice && (
        <div className="tn-toast" role="status">
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => {
              setActiveEventId(notice.eventId);
              setInviteFilter("not_invited");
              setNotice(null);
              go("events");
            }}
          >
            イベントを見る
          </button>
          <button type="button" className="tn-toast-close" aria-label="閉じる" onClick={() => setNotice(null)}>
            {Icon.close}
          </button>
        </div>
      )}

      {importing && (
        <ImportModal
          ownerId={session.user.id}
          existing={friends}
          onClose={() => setImporting(false)}
          onImported={reload}
          onSignOut={() => void signOut()}
        />
      )}
    </div>
  );
}
