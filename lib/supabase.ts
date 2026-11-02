import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DailyUsageRow {
  id: string;
  usage_date: string;
  project: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  estimated_cost_usd: number;
  session_count: number;
}

// このプロジェクト専用の公開可能な値（読み取り専用anonキー。RLSでSELECTのみ許可済み）。
// 環境変数が設定されていればそちらを優先する。
const DEFAULT_SUPABASE_URL = "https://okjopmsbkqplyhfnfwdo.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_3uiWUwMXKmVS4y_t4FN-qw_RCsXTQws";

export function createReadOnlyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface IgFriendRow {
  id: string;
  username: string;
  display_name: string;
  met_where: string;
  last_met_on: string | null;
  is_follower: boolean;
  is_following: boolean;
  followed_me_at: string | null;
  i_followed_at: string | null;
  dm_count: number;
  last_dm_at: string | null;
  note: string;
  imported_at: string;
}

export type TagKind = "community" | "attribute";

export interface IgTagRow {
  id: string;
  name: string;
  kind: TagKind;
  color: string;
  created_at: string;
}

export interface IgFriendTagRow {
  friend_id: string;
  tag_id: string;
}

export interface IgEventRow {
  id: string;
  title: string;
  event_date: string | null;
  start_time: string | null;
  location: string;
  fee: number | null;
  currency: string;
  capacity: number | null;
  note: string;
  created_at: string;
}

export type Reply = "none" | "yes" | "maybe" | "no";

export interface IgAttendeeRow {
  event_id: string;
  friend_id: string;
  invited: boolean;
  reply: Reply;
  attended: boolean;
  paid: boolean;
  note: string;
  updated_at: string;
}

let browserClient: SupabaseClient | null = null;

// Instagramページ用。ログインセッションをブラウザに保持し、RLSで本人の行だけを読み書きする。
export function getBrowserClient(): SupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? DEFAULT_SUPABASE_ANON_KEY;
    browserClient = createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } });
  }
  return browserClient;
}
