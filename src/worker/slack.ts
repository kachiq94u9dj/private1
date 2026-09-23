import { categoryLabel } from "../shared/categories";
import { formatDuration } from "../shared/time";
import type { OverviewResponse } from "../shared/types";
import type { ReportContent } from "./ai";
import type { Env } from "./env";

function delta(current: number, base: number): string {
  if (base <= 0) return "";
  const diff = current - base;
  const sign = diff >= 0 ? "+" : "−";
  return `${sign}${formatDuration(Math.abs(diff))}`;
}

export function buildSlackMessage(env: Env, o: OverviewResponse, report: ReportContent) {
  const t = o.today;
  const topCategories = Object.entries(t.byCategory)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 4)
    .map(([k, v]) => `${categoryLabel(k)} ${formatDuration(v ?? 0)}`)
    .join(" / ");
  const goals = o.goals.map((g) => `${g.achieved ? "✅" : "⚠️"} ${g.label}: ${g.actualMinutes}分（${g.comparator === "max" ? "上限" : "目標"}${g.minutes}分）`);
  const link = env.APP_URL ? `\n<${env.APP_URL.replace(/\/$/, "")}/?date=${o.date}|ダッシュボードで詳しく見る>` : "";

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `📊 ${o.date} の振り返り`, emoji: true } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${report.headline}*\n合計 *${formatDuration(t.total)}*（前日比 ${delta(t.total, o.previousDay.total) || "—"} / 7日平均比 ${delta(t.total, o.lastWeekAverage.total) || "—"}）\n${topCategories}`,
      },
    },
    { type: "section", text: { type: "mrkdwn", text: report.summary } },
  ];
  if (report.highlights.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*傾向*\n${report.highlights.map((h) => `• ${h}`).join("\n")}` } });
  }
  if (report.suggestions.length) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*明日への提案*\n${report.suggestions.map((h) => `• ${h}`).join("\n")}` } });
  }
  if (goals.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*目標*\n${goals.join("\n")}` } });
  if (link) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: link.trim() }] });

  return { text: `${o.date} の振り返り: ${report.headline}`, blocks };
}

export async function notifySlack(env: Env, o: OverviewResponse, report: ReportContent): Promise<boolean> {
  if (!env.SLACK_WEBHOOK_URL) return false;
  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildSlackMessage(env, o, report)),
  });
  if (!res.ok) throw new Error(`Slack への送信に失敗しました (${res.status})`);
  return true;
}
