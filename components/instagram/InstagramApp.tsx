"use client";

import { useEffect, useMemo, useState } from "react";
import { sendLoginLink, signOut } from "@/lib/instagram/api";
import { buildFriendViews, formatDateTime, localDateString } from "@/lib/instagram/selectors";
import { useInstagram } from "@/lib/instagram/useInstagram";
import EventsView from "./EventsView";
import FriendsView from "./FriendsView";
import ImportModal from "./ImportModal";
import { Icon, errorMessage } from "./ui";

type Tab = "friends" | "events";

function Brand() {
  return (
    <div className="tn-brand">
      <span className="tn-logo">{Icon.people}</span>
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
      <div style={{ marginBottom: 24 }}>
        <Brand />
      </div>
      <div className="tn-panel">
        {sent ? (
          <p style={{ margin: 0 }}>
            {email} にログイン用のリンクを送りました。メールを開いてリンクをクリックしてください。
          </p>
        ) : (
          <form
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
            <button type="submit" className="tn-btn tn-btn-dark" style={{ width: "100%" }}>
              ログインリンクを送る
            </button>
          </form>
        )}
        {error && <p className="tn-error">{error}</p>}
      </div>
    </div>
  );
}

export default function InstagramApp() {
  const { session, friends, tags, friendTags, events, attendees, loaded, error, reload } = useInstagram();
  const [tab, setTab] = useState<Tab>("friends");
  const [importing, setImporting] = useState(false);
  const today = localDateString();

  const views = useMemo(
    () => buildFriendViews(friends, tags, friendTags, events, attendees, today),
    [friends, tags, friendTags, events, attendees, today],
  );
  const lastImport = friends.reduce<string | null>((max, f) => (!max || f.imported_at > max ? f.imported_at : max), null);

  useEffect(() => {
    if (loaded && friends.length === 0) setImporting(true);
  }, [loaded, friends.length]);

  if (session === undefined) return <div className="tn-root" />;
  if (session === null) {
    return (
      <div className="tn-root">
        <Login />
      </div>
    );
  }

  return (
    <div className="tn-root">
      <header className="tn-header">
        <Brand />
        <nav className="tn-tabs" role="tablist">
          <button className="tn-tab" role="tab" aria-selected={tab === "friends"} onClick={() => setTab("friends")}>
            友達一覧<span className="tn-tab-count">{friends.length.toLocaleString()}</span>
          </button>
          <button className="tn-tab" role="tab" aria-selected={tab === "events"} onClick={() => setTab("events")}>
            イベント<span className="tn-tab-count">{events.length}</span>
          </button>
        </nav>
        <div className="tn-header-right">
          {lastImport && <span className="tn-muted">最終取り込み: {formatDateTime(lastImport)}</span>}
          <button className="tn-btn" onClick={() => setImporting(true)}>
            {Icon.refresh}
            Instagramから取り込み
          </button>
          <button className="tn-btn tn-btn-ghost tn-btn-sm" onClick={() => void signOut()} title={session.user.email}>
            ログアウト
          </button>
        </div>
      </header>

      {error && (
        <p className="tn-error" style={{ padding: "12px 40px 0", margin: 0 }}>
          データを読み込めませんでした: {error}
        </p>
      )}

      {!loaded ? (
        <p className="tn-muted" style={{ padding: "24px 40px" }}>
          読み込み中…
        </p>
      ) : tab === "friends" ? (
        <FriendsView views={views} tags={tags} friendTags={friendTags} events={events} onChanged={reload} />
      ) : (
        <EventsView views={views} events={events} attendees={attendees} today={today} onChanged={reload} />
      )}

      {importing && (
        <ImportModal ownerId={session.user.id} existing={friends} onClose={() => setImporting(false)} onImported={reload} />
      )}
    </div>
  );
}
