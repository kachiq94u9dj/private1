"use client";

// ログイン状態とデータ読み込みをまとめたフック。画面のデザインを作り直してもこれを使えばよい。
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase";
import { loadAll, type InstagramData } from "./api";

const EMPTY: InstagramData = { friends: [], tags: [], friendTags: [], events: [], attendees: [] };

export function useInstagram() {
  // undefined: 確認中 / null: 未ログイン
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [data, setData] = useState<InstagramData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const reload = useCallback(async () => {
    try {
      setData(await loadAll());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (session) void reload();
  }, [session, reload]);

  return { session, ...data, loaded, error, reload };
}
