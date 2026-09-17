import type { Env } from "../types";

export async function sendSlackMessage(env: Env, text: string): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) return; // 未設定時は無視(開発中など)
  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.error(`Slack notify failed: ${res.status} ${await res.text()}`);
  }
}
