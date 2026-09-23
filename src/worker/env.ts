export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** 集計・レポートの基準タイムゾーン（Mac と同じにする） */
  TIMEZONE?: string;
  /** Slack 通知に載せるダッシュボードの URL */
  APP_URL?: string;
  /** Cloudflare Access のチームドメイン（例: myteam.cloudflareaccess.com） */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access アプリケーションの Audience (AUD) タグ */
  ACCESS_AUD?: string;
  /** ローカル開発専用。"true" のとき Access の検証を省略する（.dev.vars でのみ設定） */
  DEV_ALLOW_NO_AUTH?: string;
  /** 収集スクリプトが送信時に使う共有トークン（secret） */
  INGEST_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  /** 任意。Cloudflare AI Gateway などを経由させる場合に指定 */
  ANTHROPIC_BASE_URL?: string;
  /** 省略時は claude-opus-5 */
  CLAUDE_MODEL?: string;
  SLACK_WEBHOOK_URL?: string;
}

export function timeZoneOf(env: Env): string {
  return env.TIMEZONE || "Asia/Tokyo";
}
