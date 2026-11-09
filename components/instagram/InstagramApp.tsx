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
  const [targetId, setTargetId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [inviteFilter, setInviteFilter] = useState<InviteFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const today = localDateString();

  const views = useMemo(
    () => buildFriendViews(friends, tags, friendTags, events, attendees, today),
    [friends, tags, friendTags, events, attendees, today],
  );
  const sortedEvents = useMemo(() => sortEvents(events), [events]);
  const upcoming = useMemo(() => sortedEvents.filter((e) => !isEnded(e, today)), [sortedEvents, today]);
  const target = upcoming.find((e) => e.id === targetId) ?? upcoming[0] ?? null;
  const activeEvent = sortedEvents.find((e) => e.id === activeEventId) ?? sortedEvents[0] ?? null;
  const lastImport = friends.reduce<string | null>((max, f) => (!max || f.imported_at > max ? f.imported_at : max), null);

  useEffect(() => {
    if (loaded && friends.length === 0) setImporting(true);
  }, [loaded, friends.length]);

  function go(next: Tab) {
    setForm(null);
    setTab(next);
    window.scrollTo(0, 0);
  }

  async function addSelectedToTarget() {
    if (!target || selected.size === 0) return;
    try {
      await addAttendees(target.id, [...selected]);
      await reload();
      setSelected(new Set());
      setActiveEventId(target.id);
      setInviteFilter("not_invited");
      go("events");
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
              setTargetId(id);
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
            target={target}
            onTarget={setTargetId}
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
              if (upcoming.some((e) => e.id === id)) setTargetId(id);
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
