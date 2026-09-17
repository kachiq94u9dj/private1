# CS出勤シフトアプリ

CSチームの出勤可否入力・シフト確定・変更/交換申請・承認・Googleカレンダー連携を行うアプリ。
詳しい要件・アーキテクチャ・データモデルは [docs/DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md) を参照。

## 構成

- `worker/` — Cloudflare Workers上で動くAPI(Hono)。Google スプレッドシートをデータストアとして読み書きし、
  Google カレンダー反映・Slack通知を行う。
- `frontend/` — Cloudflare Pagesにデプロイする React(Vite) SPA。

このリポジトリの直下(`private1`)にある「Claude使用量トラッカー」アプリとは独立したプロジェクトです。

## セットアップ

### 0. 前提: Googleスプレッドシート側の準備

対象スプレッドシート(`CS出勤シフトスケジュール2026`)に以下のタブをヘッダー行付きで追加してください
(列の詳細は `docs/DEVELOPMENT_PLAN.md` の「4. データモデル」参照)。

- `Members`: id, name, email, role, status, is_admin
- `Availability`: id, member_id, date, symbol, note, updated_at
- `Shifts`: id, date, member_id, type, status, updated_by, updated_at
- `Requests`: id, type, requester_id, target_shift_id, proposed_date, reason, status, approver_id, created_at, updated_at
- `Holidays`: date, name

その後、サービスアカウントのメールアドレスをこのスプレッドシートに「編集者」として共有してください。

### 1. Worker(API)

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars   # 値を埋める
npm run dev
```

必要な環境変数・シークレットは `wrangler.toml` のコメントと `.dev.vars.example` を参照してください。

本番デプロイ:

```bash
npx wrangler kv namespace create SESSIONS   # 発行されたIDを wrangler.toml に設定
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put SLACK_WEBHOOK_URL
npm run deploy
```

### 2. フロントエンド

```bash
cd frontend
npm install
cp .env.example .env.local   # デプロイ後のWorker URLに合わせて VITE_API_BASE_URL を変更
npm run dev
```

Cloudflare Pagesへのデプロイは `npm run build` の成果物(`dist/`)をPagesプロジェクトに接続してください。

## 開発状況

現時点はPhase 0〜1相当の雛形(認証・出勤可否入力・シフト確定カレンダー・変更/交換申請・承認・祝日管理・
Googleカレンダー反映のAPI/画面一式)を実装済み。実際のGoogle Cloud/Slack認証情報は未設定のため、
上記のセットアップを行うまで動作確認はできません。フェーズ計画は `docs/DEVELOPMENT_PLAN.md` を参照してください。
