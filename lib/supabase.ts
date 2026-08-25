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

export function createReadOnlyClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません。.env.example を参考に .env.local を作成してください。",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
