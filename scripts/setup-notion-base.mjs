#!/usr/bin/env node
/**
 * Team Kazuhiro「Notion基地」自動構築スクリプト
 *
 * 指定した親ページの下に以下の2つのデータベースを作成します。
 *   1. プロジェクト＆タスク管理ボード
 *   2. チーム・ナレッジベース
 *
 * 必要な環境変数:
 *   NOTION_API_KEY : Notionインテグレーションのシークレット（ntn_... / secret_...）
 *   PAGE_ID        : 作成先となる親ページのID（URL末尾の32桁 or ページURLそのまま）
 *
 * 実行:
 *   NOTION_API_KEY=... PAGE_ID=... npm run notion:setup
 *
 * 注意: 親ページを事前にインテグレーションと共有（ページ右上「…」>「接続」）しておくこと。
 */
import notionPkg from "@notionhq/client";
const { Client } = notionPkg;

const { NOTION_API_KEY, PAGE_ID } = process.env;

if (!NOTION_API_KEY || !PAGE_ID) {
  console.error(
    "❌ 環境変数 NOTION_API_KEY と PAGE_ID を設定してください。\n" +
      "   例: NOTION_API_KEY=ntn_xxx PAGE_ID=xxxxxxxx npm run notion:setup"
  );
  process.exit(1);
}

/** ページURLが渡されても末尾の32桁IDを抽出してUUID形式に整える */
function normalizePageId(input) {
  const path = input.split(/[?#]/)[0].replace(/-/g, "");
  const m = path.match(/[0-9a-f]{32}$/i);
  if (!m) throw new Error(`PAGE_ID の形式が不正です: ${input}`);
  const h = m[0].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const opts = (names, colors) =>
  names.map((name, i) => ({ name, color: colors[i % colors.length] }));

const DATABASES = [
  {
    title: "📋 プロジェクト＆タスク管理ボード",
    icon: "📋",
    properties: {
      タスク名: { title: {} },
      ステータス: {
        select: {
          options: opts(
            [
              "Idea",
              "社長(Claude)要件定義中",
              "COダニエル実装中",
              "レオナルド(MUSE)デザイン中",
              "会長確認待ち",
              "完了",
            ],
            ["gray", "orange", "blue", "purple", "red", "green"]
          ),
        },
      },
      プロジェクト: {
        select: {
          options: opts(
            ["Webアプリ開発", "新規事業企画", "その他"],
            ["blue", "yellow", "gray"]
          ),
        },
      },
      担当AI: {
        multi_select: {
          options: opts(
            ["ジャック", "社長Claude", "COダニエル", "レオナルド"],
            ["pink", "orange", "blue", "purple"]
          ),
        },
      },
    },
  },
  {
    title: "📚 チーム・ナレッジベース",
    icon: "📚",
    properties: {
      ドキュメント名: { title: {} },
      カテゴリ: {
        select: {
          options: opts(
            ["全体ルール", "技術スタック(Next.js/Supabase等)", "プロンプト"],
            ["red", "blue", "green"]
          ),
        },
      },
    },
  },
];

async function main() {
  const notion = new Client({ auth: NOTION_API_KEY });
  const parentId = normalizePageId(PAGE_ID);

  // 親ページへのアクセス確認（未共有だとここで object_not_found になる）
  try {
    await notion.pages.retrieve({ page_id: parentId });
  } catch (err) {
    console.error(
      `❌ 親ページ(${parentId})にアクセスできません: ${err.code ?? ""} ${err.message}\n` +
        "   → 親ページの「…」>「接続」からインテグレーションを追加してください。"
    );
    process.exit(1);
  }

  console.log("🏗️  Notion基地を構築中...\n");
  for (const db of DATABASES) {
    const res = await notion.databases.create({
      parent: { type: "page_id", page_id: parentId },
      title: [{ type: "text", text: { content: db.title } }],
      icon: { type: "emoji", emoji: db.icon },
      initial_data_source: { properties: db.properties },
    });
    console.log(`✅ ${db.title}\n   ${res.url}`);
  }
  console.log("\n🎉 構築完了！");
}

main().catch((err) => {
  console.error("❌ エラー:", err.code ?? "", err.message);
  process.exit(1);
});
