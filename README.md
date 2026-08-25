# Claude Usage Tracker

Claude Code のトークン消費量を可視化し、節約のための提案を表示するダッシュボードです。

## 仕組み

1. **ローカル収集スクリプト** (`scripts/collect-usage.ts`) が `~/.claude/projects/**/*.jsonl` を解析し、
   日別・プロジェクト別・モデル別にトークン使用量を集計して Supabase に送信します。
   このスクリプトは Claude Code を実行しているマシン上でのみ動かせます（ログがローカルにあるため）。
2. **Webダッシュボード** (Next.js, Vercelデプロイ) が Supabase からデータを読み込み、グラフと節約提案を表示します。

## セットアップ

```bash
npm install
cp .env.example .env.local
```

`.env.local` の `SUPABASE_SERVICE_ROLE_KEY` に、Supabaseダッシュボード
(Project Settings > API > service_role key) から取得したキーを設定してください。
このキーは書き込み権限を持つため、絶対にコミット・公開しないでください。

## 使い方

### 1. ログを収集してアップロード（ログがあるマシンで実行）

```bash
npm run collect
```

直近30日分のログを集計し、Supabaseへ送信します。定期的に実行したい場合は、cronやmacOSの
launchdに登録してください。例（毎日9時に実行、macOS launchd）:

```xml
<!-- ~/Library/LaunchAgents/com.claude-usage-tracker.plist -->
<key>StartCalendarInterval</key>
<dict>
  <key>Hour</key><integer>9</integer>
  <key>Minute</key><integer>0</integer>
</dict>
```

### 2. ダッシュボードを見る

ローカルで確認する場合:

```bash
npm run dev
```

`http://localhost:3000` を開きます。

本番運用する場合は Vercel にデプロイし、`NEXT_PUBLIC_SUPABASE_URL` と
`NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel の環境変数に設定してください
（`SUPABASE_SERVICE_ROLE_KEY` はデプロイ環境には設定不要・不要に公開しないこと）。

## 料金表について

`lib/pricing.ts` に Claude モデルごとの料金表（1Mトークンあたりのドル）があります。
Anthropic の価格改定があった場合はここを更新してください。キャッシュ書込/読込は
入力単価に対する倍率（書込 ×1.25、読込 ×0.1）で概算しています。

## データベース (Supabase)

Supabaseプロジェクト: `claude-usage-tracker`

`daily_usage` テーブル (date, project, model ごとにユニーク):

| カラム | 説明 |
|---|---|
| usage_date | 日付 |
| project | プロジェクト名（作業ディレクトリ名から推定） |
| model | モデルID |
| input_tokens / output_tokens | 入出力トークン数 |
| cache_creation_tokens / cache_read_tokens | キャッシュ書込/読込トークン数 |
| estimated_cost_usd | 概算コスト（USD） |
| session_count | セッション数 |

読み取りは匿名キーで誰でも可能（RLSで書き込みは service_role のみに制限）。
