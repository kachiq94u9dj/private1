// Instagram のエクスポート ZIP を手元で解析し、取り込める内容かを確認する。
// 使い方: npm run check:instagram -- ~/Downloads/instagram-xxxx.zip
// ZIP の中身はどこにも送信しない。ユーザー名や DM 本文は表示せず、件数と日付の読み取り状況だけを出す。
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { extractDates, isRelevantPath, parseExport } from "../lib/instagram/parse";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("使い方: npm run check:instagram -- <ZIPファイルのパス>");
    process.exit(1);
  }

  const zip = await JSZip.loadAsync(await readFile(path));
  const all = Object.values(zip.files).filter((f) => !f.dir);
  const relevant = all.filter((f) => isRelevantPath(f.name));
  const files = await Promise.all(relevant.map(async (f) => ({ path: f.name, html: await f.async("string") })));
  const result = parseExport(files);

  const htmlCount = all.filter((f) => f.name.endsWith(".html")).length;
  const jsonCount = all.filter((f) => f.name.endsWith(".json")).length;
  const connectionFiles = files.filter((f) => !f.path.includes("/messages/")).map((f) => f.path);

  const friends = result.friends;
  const followers = friends.filter((f) => f.isFollower);
  const following = friends.filter((f) => f.isFollowing);
  const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((n / d) * 100)}%`);

  console.log("=== ZIP の中身 ===");
  console.log(`ファイル数: ${all.length}（HTML ${htmlCount} / JSON ${jsonCount}）`);
  if (jsonCount > htmlCount) console.log("※ JSON 形式のようです。HTML 形式でダウンロードし直してください。");
  console.log(`フォロワー/フォロー中のファイル: ${connectionFiles.length > 0 ? connectionFiles.join(", ") : "見つかりません"}`);

  console.log("\n=== 解析結果 ===");
  console.log(`友達（合計）: ${friends.length}`);
  console.log(`フォロワー: ${followers.length}（日付を読めた割合 ${pct(followers.filter((f) => f.followedMeAt).length, followers.length)}）`);
  console.log(`フォロー中: ${following.length}（日付を読めた割合 ${pct(following.filter((f) => f.iFollowedAt).length, following.length)}）`);
  console.log(`相互フォロー: ${friends.filter((f) => f.isFollower && f.isFollowing).length}`);
  console.log(
    `DM スレッド: ${result.dmThreads}（対応付け ${result.dmThreadsMatched} / グループ ${result.dmThreadsGroup} / 対応付けできず ${result.unmatchedThreads.length}）`,
  );
  console.log(`名前を取れた人: ${friends.filter((f) => f.displayName).length}`);

  // 日付が読めない場合に、どんな書式かを確認するための手がかり（ユーザー名は出さない）。
  const sample = files.find((f) => !f.path.includes("/messages/"));
  if (sample && extractDates(sample.html).length === 0) {
    const text = sample.html.replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim());
    const dateLike = text.filter((s) => /\d/.test(s) && !/instagram\.com/.test(s) && s.length < 40).slice(0, 3);
    console.log("\n※ 日付を読み取れませんでした。日付らしき文字列の例:", dateLike);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
