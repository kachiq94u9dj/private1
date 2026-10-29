"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserClient, type IgAttendeeRow, type IgEventRow, type IgFriendRow } from "@/lib/supabase";
import EventsView from "./EventsView";
import FriendsView from "./FriendsView";
import ImportPanel from "./ImportPanel";
import { Card, buttonStyle, inputStyle } from "./ui";

type Tab = "friends" | "events" | "import";

const TAB_LABELS: Record<Tab, string> = { friends: "友達", events: "イベント", import: "取り込み" };

// Supabaseは1リクエスト最大1000行なので、ページングして全件読む。
async function fetchAll<T>(table: string, order: string): Promise<T[]> {
  const supabase = getBrowserClient();
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(order)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return rows;
  }
}

function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="ログイン">
      {sent ? (
        <p style={{ fontSize: 13, margin: 0 }}>
          {email} にログイン用のリンクを送りました。メールを開いてリンクをクリックしてください。
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await getBrowserClient().auth.signInWithOtp({
              email,
              options: { emailRedirectTo: `${window.location.origin}/instagram` },
            });
            if (error) setError(error.message);
            else setSent(true);
          }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <input
            style={{ ...inputStyle, flex: "1 1 240px" }}
            type="email"
            required
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" style={buttonStyle(true)}>
            ログインリンクを送る
          </button>
        </form>
      )}
      {error && <p style={{ fontSize: 13, color: "var(--critical)" }}>{error}</p>}
    </Card>
  );
}

export default function InstagramApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("friends");
  const [friends, setFriends] = useState<IgFriendRow[]>([]);
  const [events, setEvents] = useState<IgEventRow[]>([]);
  const [attendees, setAttendees] = useState<IgAttendeeRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    try {
      const [f, e, a] = await Promise.all([
        fetchAll<IgFriendRow>("ig_friends", "username"),
        fetchAll<IgEventRow>("ig_events", "created_at"),
        fetchAll<IgAttendeeRow>("ig_event_attendees", "updated_at"),
      ]);
      setFriends(f);
      setEvents(e.reverse());
      setAttendees(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void reload();
  }, [session, reload]);

  useEffect(() => {
    if (loaded && friends.length === 0) setTab("import");
  }, [loaded, friends.length]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 16px 80px" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Instagram 友達ダッシュボード</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            友達の整理と、イベントに来てくれそうなお客さんのリストアップ
          </p>
        </div>
        {session && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-muted)" }}>
            {session.user.email}
            <button style={buttonStyle()} onClick={() => void getBrowserClient().auth.signOut()}>
              ログアウト
            </button>
          </div>
        )}
      </header>

      {session === undefined && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>読み込み中…</p>}
      {session === null && <Login />}

      {session && (
        <>
          <nav style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--gridline)" }}>
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontSize: 14,
                  padding: "8px 14px",
                  border: "none",
                  borderBottom: `2px solid ${tab === t ? "var(--series-1)" : "transparent"}`,
                  background: "none",
                  color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: tab === t ? 600 : 400,
                  cursor: "pointer",
                  marginBottom: -1,
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>

          {error && <p style={{ fontSize: 13, color: "var(--critical)" }}>データを読み込めませんでした: {error}</p>}
          {!loaded && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>読み込み中…</p>}

          {loaded && tab === "friends" && (
            <FriendsView friends={friends} events={events} attendees={attendees} onChanged={reload} />
          )}
          {loaded && tab === "events" && (
            <EventsView friends={friends} events={events} attendees={attendees} onChanged={reload} />
          )}
          {loaded && tab === "import" && (
            <ImportPanel ownerId={session.user.id} existing={friends} onImported={reload} />
          )}
        </>
      )}
    </main>
  );
}
