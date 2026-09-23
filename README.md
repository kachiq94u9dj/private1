# Screen Time Insights

Mac（と iPhone）のスクリーンタイムと Chrome の閲覧履歴から、毎日のパソコンの使い方を分析するダッシュボードです。
Cloudflare Workers + D1 で動き、毎朝 AI（Claude）の振り返りを Slack に届けます。

- **アプリ別・Webサイト別の使用時間**（Chrome の時間はサイトごとの内訳に振り分け）
- **カテゴリ分類**（開発 / 仕事 / コミュニケーション / 学習 / SNS / エンタメ / ユーティリティ / その他）。新しいアプリやサイトは AI が自動で分類し、画面から手動で直せます
- **時間帯ヒートマップ**と直近28日の推移
- **前日比・直近7日平均比**
- **目標**（例: SNS は1日45分まで、開発は4時間以上）
- **AI の振り返り**を毎朝自動で作成し、Slack に通知

## 全体の流れ

```
Mac（launchd で1日1回・朝）
  collector/collect.ts
    ├─ スクリーンタイム DB（RMAdminStore / knowledgeC）… Mac と、同期された iPhone の使用時間
    └─ Chrome の履歴 DB                             … サイト別の閲覧時間（概算）
        │  1時間単位に集計して送信（生の URL は送らない）
        ▼
Cloudflare Worker（Cloudflare Access で本人のみ閲覧可）
  POST /api/ingest ─→ D1
  Cron（15分ごと）… 今日の分が届いていれば、前日の AI 振り返りを作成 → Slack
  ダッシュボード（React）
```

| ディレクトリ | 内容 |
|---|---|
| `collector/` | Mac で動かす収集スクリプト（Node.js、依存パッケージなし） |
| `src/worker/` | Cloudflare Worker（API・AI・Slack・定期実行） |
| `src/client/` | ダッシュボード（React） |
| `src/shared/` | カテゴリ定義・集計ロジック（Worker と画面で共通） |
| `migrations/` | D1 のスキーマ |

## 1. Cloudflare の準備（初回のみ）

GitHub Actions が `main` への push ごとにマイグレーションとデプロイを行います。最初に次の準備をしてください。

1. **D1 データベースを作成**: Cloudflare ダッシュボード → Storage & Databases → D1 → 「Create」→ 名前を `screen-time-insights` にする。
   表示された **Database ID** を控えます。
2. **API トークンを作成**: My Profile → API Tokens → 「Create Token」→「Edit Cloudflare Workers」テンプレートを使い、
   権限に **Account / D1 / Edit** を追加します。
3. **GitHub に登録**（リポジトリの Settings → Secrets and variables → Actions）

   | 種類 | 名前 | 値 |
   |---|---|---|
   | Secret | `CLOUDFLARE_API_TOKEN` | 2 で作ったトークン |
   | Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare のアカウント ID |
   | Secret | `INGEST_TOKEN` | 収集スクリプト用の合言葉。`openssl rand -hex 32` などで生成 |
   | Secret | `ANTHROPIC_API_KEY` | Claude API キー（[console.anthropic.com](https://console.anthropic.com/)） |
   | Secret | `SLACK_WEBHOOK_URL` | Slack の Incoming Webhook URL（下記） |
   | Variable | `D1_DATABASE_ID` | 1 で控えた Database ID |
   | Variable | `APP_URL` | ダッシュボードの URL（Slack のリンクに使用。デプロイ後に設定） |
   | Variable | `ACCESS_TEAM_DOMAIN` | 例: `yourteam.cloudflareaccess.com`（手順 3 で確認） |
   | Variable | `ACCESS_AUD` | Access アプリの Audience タグ（手順 3 で確認） |

   Secret と Variable はデプロイ時に Worker へ同期されます。
4. `main` に push（またはこの PR をマージ）すると Actions がデプロイします。URL は `https://screen-time-insights.<サブドメイン>.workers.dev` です。

タイムゾーンは `wrangler.jsonc` の `TIMEZONE`（既定 `Asia/Tokyo`）で変えられます。Mac と同じにしてください。

### Slack の Incoming Webhook

[Slack API](https://api.slack.com/apps) →「Create New App」→ From scratch → Incoming Webhooks を On →
「Add New Webhook to Workspace」で通知先のチャンネル（自分宛ての DM でも可）を選び、URL をコピーします。

## 2. Cloudflare Access で閲覧を自分だけに制限する

使用履歴は個人情報なので、**Access を設定するまでダッシュボードの API は 403 を返します**（設定し忘れても外部から見えないようになっています）。

1. Workers & Pages → `screen-time-insights` → Settings → Domains & Routes → `workers.dev` の「Enable Cloudflare Access」をオンにします
   （独自ドメインを使う場合は Zero Trust → Access → Applications で Self-hosted アプリを作成）。
2. Zero Trust → Access → Applications でそのアプリを開き、ポリシーを **Include: Emails = 自分のメールアドレス** にします。
3. アプリの **Application Audience (AUD) Tag** と、Zero Trust → Settings の **Team domain** を GitHub の Variables
   （`ACCESS_AUD` / `ACCESS_TEAM_DOMAIN`）に登録して再デプロイします。
4. 収集スクリプトが Access を通れるようにします。Zero Trust → Access → Service Auth → 「Create Service Token」でトークンを作り、
   アプリに **Action: Service Auth / Include: Service Token = 作ったトークン** のポリシーを追加します。
   Client ID と Client Secret は Mac 側の設定（次の手順）に使います。

## 3. Mac 側のセットアップ

必要なもの: **Node.js 22.18 以上**（`node -v` で確認。`brew install node` など）。追加のパッケージは不要です。

```bash
git clone <このリポジトリ> ~/screen-time-insights
cd ~/screen-time-insights
./collector/install.sh
```

1. 作成された `~/.screen-time-insights/config.env` を編集します。

   ```
   STI_URL=https://screen-time-insights.xxxx.workers.dev
   STI_INGEST_TOKEN=（GitHub の INGEST_TOKEN と同じ値）
   CF_ACCESS_CLIENT_ID=（サービストークンの Client ID）
   CF_ACCESS_CLIENT_SECRET=（サービストークンの Client Secret）
   ```

2. **フルディスクアクセスを許可**します。スクリーンタイムの DB は保護されているためです。
   システム設定 → プライバシーとセキュリティ → フルディスクアクセス →「+」で、`install.sh` が表示した `node` の実体
   （例: `/opt/homebrew/Cellar/node/22.x/bin/node`）を追加します。手動で試すときはターミナルアプリにも許可が必要です。
3. 動作確認:

   ```bash
   node collector/collect.ts --diagnose   # 何が読めるか確認（送信しない）
   node collector/collect.ts --force      # 送信（初回は残っている全期間）
   ```

以降は launchd が30分ごとに起動し、**1日1回（朝4時以降に最初に Mac を使ったとき）** 直近7日ぶんを送り直します。
スリープ中に過ぎた分は復帰時に実行されます。ログは `~/.screen-time-insights/collector.log` です。
解除するときは `./collector/install.sh uninstall` を実行します。

### iPhone のデータ

iPhone の 設定 → スクリーンタイム →「デバイス間で共有」をオンにすると、同じ Apple ID の Mac のスクリーンタイム DB に iPhone の使用時間が同期され、
ダッシュボードで「📱 iPhone」を選べるようになります（持ち上げ回数・通知数も取れる場合があります）。
同期が遅れることがありますが、毎回直近7日を送り直すので後から反映されます（その日の AI 振り返りには間に合わないことがあります）。

家族の端末など集計したくない端末は、`config.env` の `STI_EXCLUDE_DEVICES` に端末名をカンマ区切りで書きます。

### データの取り方と注意点

- **スクリーンタイム**: `RMAdminStore-Local.sqlite`（macOS のスクリーンタイム本体）を優先して読み、読めない場合は `knowledgeC.db` を使います。
  どちらも Apple の非公開形式なので、macOS のアップデートで読めなくなる可能性があります。
  その場合は `--diagnose` の出力を添えて Issue にしてください。
- **Chrome**: 閲覧履歴の「訪問時刻」と「滞在時間」から概算します。重複タブの二重計上を防ぐため、各訪問は次の訪問までかつ最大30分として数え、
  さらにスクリーンタイム上の Chrome の前面時間を超えないよう按分します。すべてのプロファイル（Default / Profile N）が対象です。
- 送信するのは **1時間ごとの「アプリ ID / ドメイン」と秒数だけ**です。URL のパスやページタイトルは送りません。
- AI にはその日の集計値（カテゴリ別時間・上位アプリ/サイト・時間帯別の分数など）だけを渡します。

## AI について

- モデルは `claude-opus-5`（`CLAUDE_MODEL` で変更可）。安全分類器で拒否された場合はサーバー側で推奨モデルに自動で切り替わる
  `fallbacks: "default"` を有効にしています。
- 新しいアプリ/サイトの分類は15分ごとに最大120件まで、1件につき最大3回試みます。画面の「カテゴリ分類」から手動で変えたものは上書きしません。
- 振り返りは、Mac から「今日の日付の収集」が届いた後に前日分を作成します。ダッシュボードの「作り直す」ボタンで再生成もできます。
- `ANTHROPIC_BASE_URL` を設定すると Cloudflare AI Gateway などを経由できます。

## ローカル開発

```bash
npm install
cp .dev.vars.example .dev.vars      # DEV_ALLOW_NO_AUTH=true で Access を省略
npm run db:migrate:local
npm run dev                          # http://localhost:5173
node scripts/seed-demo.ts            # 別ターミナルで。ダミーデータを投入
```

| コマンド | 内容 |
|---|---|
| `npm test` | テスト（収集処理は疑似 DB を作って検証するため `sqlite3` コマンドが必要） |
| `npm run typecheck` | 型チェック |
| `npm run deploy` | 手元から直接デプロイ（通常は GitHub Actions） |

Cron の動作は `curl "http://localhost:5173/cdn-cgi/handler/scheduled"` で試せます。
