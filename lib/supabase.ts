import { createClient } from "@supabase/supabase-js";

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
