import { createReadOnlyClient, type DailyUsageRow } from "@/lib/supabase";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

async function getRows(): Promise<DailyUsageRow[]> {
  const supabase = createReadOnlyClient();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await supabase
    .from("daily_usage")
    .select("*")
    .gte("usage_date", since.toISOString().slice(0, 10))
    .order("usage_date", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export default async function Page() {
  const rows = await getRows();
  return <Dashboard rows={rows} />;
}
