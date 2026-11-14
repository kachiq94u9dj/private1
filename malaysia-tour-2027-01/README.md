# マレーシアツアー 第7回 旅のしおり（2027年1月）

2027年1月9日（土）〜11日（月・祝）の2泊3日、クアラルンプール。参加者は合計5人。
第6回（2026年9月）のしおり（`kachiq94u9dj/malaysia-tour-september-site`）をコピーして作り直したもの。

## ファイル構成

```
malaysia-tour-2027-01/
├── wrangler.jsonc     # Cloudflare の設定（public/ をそのまま公開する）
└── public/
    ├── index.html     # サイト本体（編集するのはここ）
    └── photos/        # 過去ツアーの写真（第1〜5回）
```

ビルドは不要。`public/` の中身がそのまま公開される。

## Cloudflare で公開する（GitHub と連携して自動で公開）

`main` に変更が入るたびに自動で公開されるようにする。ともだちノートと同じ「Workers Builds」を使う。

設定手順（Cloudflare ダッシュボード）:

1. **Workers & Pages → Create → Import a repository** で `kachiq94u9dj/private1` を選ぶ
2. 次のように設定して **Deploy**
   - Project name: `malaysia-tour-2027-01`（`wrangler.jsonc` の name と同じにする）
   - Production branch: `main`
   - Root directory（Advanced settings 内）: `malaysia-tour-2027-01`
   - Build command: 空のまま
   - Deploy command: `npx wrangler deploy`
3. 公開 URL は `https://malaysia-tour-2027-01.<アカウントのサブドメイン>.workers.dev`

同じリポジトリのともだちノート（`tomodachi-note`）は別の Worker なので影響しない。
お互いの変更で無駄なビルドが走らないようにしたいときは、それぞれの Worker の
**Settings → Builds → Build watch paths** で、自分のフォルダだけを対象にする
（例：この Worker は `malaysia-tour-2027-01/*`、ともだちノートは `malaysia-tour-2027-01/*` を除外）。

## 手元から直接公開する場合

```bash
cd malaysia-tour-2027-01
npx wrangler login
npx wrangler deploy
```

## まだ決まっていないこと

- スケジュールは第6回のプランをもとにした仮のもの（ボートツアーなどは未予約）
- 参加者紹介は、かっちゃん・はるごろう・しげちゃんの3人分。残り2人は決まり次第追加する
- はるごろう・しげちゃんの紹介文

