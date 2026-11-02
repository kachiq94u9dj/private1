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

---

# ともだちノート (`/instagram`)

Instagram の友達を整理し、イベントごとに「誘った・返事・出席・支払い」を管理するページです。
要件は [`docs/instagram-requirements.md`](docs/instagram-requirements.md)、デザインは
[`design/instagram/`](design/instagram/) を参照してください。

## 使い方

1. `/instagram` を開き、メールアドレス宛のログインリンクでログインする
2. 右上の「Instagramから取り込み」で、Instagram の「個人情報をダウンロード」（**HTML 形式**）の ZIP を入れる
   - 解析はブラウザ内で行い、Supabase に送るのはユーザー名・フォロー日時・DM の件数と最終日時・DM の相手名だけです（DM の本文は送りません）
   - 再取り込みしても、名前・メモ・タグ・イベントの記録は残ります
3. **友達一覧**: カードをクリックして名前・出会い・最後に会った日・タグ（コミュニティ／属性）を編集。
   左のタグで絞り込み、チェックした人を下のバーからイベントの招待リストに追加
4. **イベント**: 招待リストの各セルをクリックして「誘った／返事／出席／支払い」を切り替え。
   `@ユーザー名` の一括コピー、プロフィールのリンク一覧、未払いの人へのリマインド文面を用意できます
   （DM の自動送信は Instagram の規約違反になるため行いません）

## セットアップ時の注意

- テーブル定義は `supabase/migrations/` の SQL を日付順に適用します
  （`ig_friends` / `ig_tags` / `ig_friend_tags` / `ig_events` / `ig_event_attendees`）。
  RLS により、ログインした本人の行しか読み書きできません（匿名キーでは何も読めません）。
- Supabase ダッシュボードの Authentication > URL Configuration で、Redirect URLs に
  利用する URL（例: `http://localhost:3000/instagram`、Vercel の URL）を追加してください。
- 自分のアカウントで一度ログインした後は、Authentication > Sign In / Providers で
  「Allow new users to sign up」をオフにすると、他人がアカウントを作れなくなります。
- パーサーのテスト: `npm run test:instagram`
