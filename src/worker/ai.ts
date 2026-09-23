import Anthropic from "@anthropic-ai/sdk";
import { BROWSER_BUNDLE_IDS, CATEGORIES, CATEGORY_IDS, categoryLabel, isCategoryId, type CategoryId } from "../shared/categories";
import { formatDuration } from "../shared/time";
import type { ItemType, OverviewResponse } from "../shared/types";
import type { Env } from "./env";

const DEFAULT_MODEL = "claude-opus-5";

export class RefusalError extends Error {}

function client(env: Env): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY が設定されていません");
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });
}

export function modelOf(env: Env): string {
  return env.CLAUDE_MODEL || DEFAULT_MODEL;
}

/** 構造化出力（JSON Schema）で呼び出し、パース済みの JSON を返す */
async function callJson(
  env: Env,
  params: { system: string; user: string; schema: Record<string, unknown>; effort: "low" | "medium" | "high" },
): Promise<unknown> {
  const response = await client(env).beta.messages.create({
    model: modelOf(env),
    max_tokens: 16000,
    // 安全分類器による拒否時は、サーバー側で推奨モデルに自動フォールバックする
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: params.effort, format: { type: "json_schema", schema: params.schema } },
    system: params.system,
    messages: [{ role: "user", content: params.user }],
  });
  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.explanation ?? "リクエストが拒否されました");
  }
  if (response.stop_reason === "max_tokens") throw new Error("出力が上限に達して途中で終了しました");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("応答にテキストがありません");
  return JSON.parse(text.text);
}

// ---------------------------------------------------------------------------
// アプリ / ドメインのカテゴリ自動分類
// ---------------------------------------------------------------------------

export interface CategorizeInput {
  type: ItemType;
  key: string;
  name: string | null;
}

export interface CategorizeOutput {
  type: ItemType;
  key: string;
  category: CategoryId;
  displayName: string;
}

const CATEGORY_GUIDE = CATEGORIES.map((c) => `- ${c.id}: ${c.label}`).join("\n");

export async function categorizeItems(env: Env, items: CategorizeInput[]): Promise<CategorizeOutput[]> {
  if (items.length === 0) return [];
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "category", "display_name"],
          properties: {
            index: { type: "integer" },
            category: { type: "string", enum: CATEGORY_IDS },
            display_name: { type: "string" },
          },
        },
      },
    },
  };

  const system = `あなたは macOS / iOS のスクリーンタイム分析アプリの分類担当です。
アプリ（bundle identifier）や Web サイト（ドメイン）を、次のカテゴリのいずれか1つに分類してください。

${CATEGORY_GUIDE}

判断の目安:
- dev: IDE、ターミナル、GitHub、Stack Overflow、クラウドコンソール、AI コーディングツールなど
- work: ドキュメント、表計算、タスク管理、カレンダー、デザインツール、業務 SaaS
- communication: メール、チャット（Slack / LINE / Discord）、ビデオ会議
- learning: 技術記事、ドキュメントサイト、辞書、オンライン学習、検索エンジン
- sns: X(Twitter)、Instagram、Facebook、TikTok、Threads、Reddit など
- entertainment: 動画・音楽配信、ゲーム、漫画、ニュース以外の娯楽
- utility: システム設定、Finder、ファイル管理、パスワード管理、ランチャーなど
- other: 上記に当てはまらない、または判断できないもの

display_name は日本のユーザーが見て分かる短い名前にしてください（例: com.tinyspeck.slackmacgap → Slack、github.com → GitHub）。
入力の index をそのまま返してください。`;

  const user = JSON.stringify(
    items.map((it, index) => ({ index, kind: it.type === "app" ? "アプリ" : "Webサイト", id: it.key, known_name: it.name })),
  );
  const result = (await callJson(env, { system, user, schema, effort: "low" })) as {
    items?: { index: number; category: string; display_name: string }[];
  };

  const out: CategorizeOutput[] = [];
  for (const r of result.items ?? []) {
    const item = items[r.index];
    if (!item || !isCategoryId(r.category)) continue;
    out.push({ type: item.type, key: item.key, category: r.category, displayName: (r.display_name || item.key).slice(0, 100) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1日の振り返りレポート
// ---------------------------------------------------------------------------

export interface ReportContent {
  headline: string;
  summary: string;
  highlights: string[];
  suggestions: string[];
}

function categoryLines(byCategory: Partial<Record<string, number>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(byCategory)) if (v) out[categoryLabel(k)] = formatDuration(v);
  return out;
}

/** AI に渡す集計データ（生の履歴は渡さず、集計値だけにする） */
export function reportInput(o: OverviewResponse) {
  const t = o.today;
  return {
    対象日: o.date,
    合計: formatDuration(t.total),
    カテゴリ別: categoryLines(t.byCategory),
    時間帯別_分: Object.fromEntries(t.hourly.map((s, h) => [`${h}時`, Math.round(s / 60)]).filter(([, m]) => (m as number) > 0)),
    よく使ったアプリ: t.apps
      .slice(0, 12)
      .map((a) => `${a.name}（${BROWSER_BUNDLE_IDS.has(a.key) ? "ブラウザ・内訳はサイト別" : categoryLabel(a.category ?? "")}）${formatDuration(a.seconds)}`),
    よく見たサイト: t.domains.slice(0, 12).map((a) => `${a.name}（${categoryLabel(a.category ?? "")}）${formatDuration(a.seconds)}`),
    iPhone持ち上げ回数: t.pickups,
    通知数: t.notifications,
    前日: { 合計: formatDuration(o.previousDay.total), カテゴリ別: categoryLines(o.previousDay.byCategory) },
    直近7日平均: { 合計: formatDuration(o.lastWeekAverage.total), カテゴリ別: categoryLines(o.lastWeekAverage.byCategory) },
    目標: o.goals.map((g) => `${g.label} ${g.comparator === "max" ? "上限" : "下限"}${g.minutes}分 → 実績${g.actualMinutes}分（${g.achieved ? "達成" : "未達成"}）`),
    端末: o.devices.map((d) => `${d.name}(${d.platform})`),
  };
}

export async function generateDailyReport(env: Env, overview: OverviewResponse): Promise<ReportContent> {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["headline", "summary", "highlights", "suggestions"],
    properties: {
      headline: { type: "string" },
      summary: { type: "string" },
      highlights: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" } },
    },
  };

  const system = `あなたはユーザー本人の「デジタル習慣コーチ」です。Mac（と iPhone）のスクリーンタイム集計から、その日の使い方を日本語で振り返ります。

書き方:
- headline: その日を一言で表す見出し（30文字程度）。
- summary: 2〜4文。合計時間、中心だった活動、前日・直近7日平均との違いを具体的な数字で。
- highlights: 良かった点・目立った傾向を2〜4個。時間帯の偏り（深夜利用、集中できた時間帯など）にも触れる。
- suggestions: 明日から試せる具体的で小さな改善案を1〜3個。目標が未達成ならそれに触れる。
- 数字は入力にあるものだけを使い、推測で作らない。データが少ない日はその旨を正直に書く。
- 説教調にせず、フラットで前向きなトーンで。`;

  const result = (await callJson(env, {
    system,
    user: JSON.stringify(reportInput(overview), null, 1),
    schema,
    effort: "medium",
  })) as ReportContent;

  return {
    headline: String(result.headline ?? "").slice(0, 200),
    summary: String(result.summary ?? "").slice(0, 2000),
    highlights: (result.highlights ?? []).map(String).slice(0, 6),
    suggestions: (result.suggestions ?? []).map(String).slice(0, 5),
  };
}
