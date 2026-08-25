// Claude Code のローカルログ (~/.claude/projects/**/*.jsonl) を解析し、
// 日別・プロジェクト別・モデル別にトークン使用量を集計して Supabase に送信するスクリプト。
//
// 実行方法: npm run collect
// 定期実行したい場合は cron や macOS の launchd に登録してください（README参照）。

import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { estimateCostUsd } from "../lib/pricing";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const LOOKBACK_DAYS = 30;

interface AggregateKey {
  date: string;
  project: string;
  model: string;
}

interface AggregateValue {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  sessionIds: Set<string>;
}

function listJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...listJsonlFiles(fullPath));
    } else if (entry.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }
  return files;
}

function projectNameFromCwd(cwd: string | undefined): string {
  if (!cwd) return "unknown";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください（.env.example 参照）。",
    );
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

  const files = listJsonlFiles(CLAUDE_PROJECTS_DIR);
  if (files.length === 0) {
    console.error(`ログが見つかりませんでした: ${CLAUDE_PROJECTS_DIR}`);
    process.exit(1);
  }

  const aggregates = new Map<string, AggregateValue & AggregateKey>();

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type !== "assistant") continue;
      const usage = entry.message?.usage;
      const model = entry.message?.model;
      const timestamp = entry.timestamp;
      if (!usage || !model || !timestamp) continue;

      const date = new Date(timestamp);
      if (date < cutoff) continue;

      const dateStr = date.toISOString().slice(0, 10);
      const project = projectNameFromCwd(entry.cwd);
      const sessionId: string = entry.sessionId ?? "unknown";

      const key = `${dateStr}|${project}|${model}`;
      const existing = aggregates.get(key);
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

      if (existing) {
        existing.inputTokens += inputTokens;
        existing.outputTokens += outputTokens;
        existing.cacheCreationTokens += cacheCreationTokens;
        existing.cacheReadTokens += cacheReadTokens;
        existing.sessionIds.add(sessionId);
      } else {
        aggregates.set(key, {
          date: dateStr,
          project,
          model,
          inputTokens,
          outputTokens,
          cacheCreationTokens,
          cacheReadTokens,
          sessionIds: new Set([sessionId]),
        });
      }
    }
  }

  if (aggregates.size === 0) {
    console.log(`直近${LOOKBACK_DAYS}日間の使用ログは見つかりませんでした。`);
    return;
  }

  const rows = Array.from(aggregates.values()).map((agg) => ({
    usage_date: agg.date,
    project: agg.project,
    model: agg.model,
    input_tokens: agg.inputTokens,
    output_tokens: agg.outputTokens,
    cache_creation_tokens: agg.cacheCreationTokens,
    cache_read_tokens: agg.cacheReadTokens,
    estimated_cost_usd: estimateCostUsd(agg.model, {
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheCreationTokens: agg.cacheCreationTokens,
      cacheReadTokens: agg.cacheReadTokens,
    }),
    session_count: agg.sessionIds.size,
  }));

  const totalCost = rows.reduce((sum, r) => sum + r.estimated_cost_usd, 0);
  const totalTokens = rows.reduce(
    (sum, r) => sum + r.input_tokens + r.output_tokens + r.cache_creation_tokens + r.cache_read_tokens,
    0,
  );
  console.log(
    `集計完了: ${rows.length}件 (日付×プロジェクト×モデル) / 合計 ${totalTokens.toLocaleString()} トークン / 概算 $${totalCost.toFixed(2)}`,
  );

  const supabase = createClient(supabaseUrl, serviceKey);
  supabase
    .from("daily_usage")
    .upsert(rows, { onConflict: "usage_date,project,model" })
    .then(({ error }) => {
      if (error) {
        console.error("Supabaseへの送信に失敗しました:", error.message);
        process.exit(1);
      }
      console.log("Supabaseへの送信が完了しました。ダッシュボードで確認してください。");
    });
}

main();
