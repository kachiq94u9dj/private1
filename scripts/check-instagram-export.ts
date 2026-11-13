// Instagram のエクスポート ZIP を手元で解析し、取り込める内容かを確認する。
// 使い方: npm run check:instagram -- ~/Downloads/instagram-xxxx（展開したフォルダ）
//         npm run check:instagram -- ~/Downloads/instagram-xxxx-1.zip ~/Downloads/instagram-xxxx-2.zip
// ZIP の中身はどこにも送信しない。ユーザー名や DM 本文は表示せず、件数と日付の読み取り状況だけを出す。
import { openAsBlob } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { extractDates, isRelevantPath, parseExport, type ExportFile } from "../lib/instagram/parse";
import { readExportZip } from "../lib/instagram/zip";

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("使い方: npm run check:instagram -- <展開したフォルダ または ZIP のパス> [...]");
    process.exit(1);
  }

  // ZIP の中身と展開済みフォルダの中身を、同じ「パスの一覧」として扱う。
  // ZIP は数 GB になることがあるので、丸ごと読み込まず必要な HTML だけ取り出す。
  const all: { name: string }[] = [];
  const files: ExportFile[] = [];
  for (const path of paths) {
    if ((await stat(path)).isDirectory()) {
      const walk = async (dir: string): Promise<void> => {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else {
            const name = relative(path, full);
            all.push({ name });
            if (isRelevantPath(name)) files.push({ path: name, html: await readFile(full, "utf-8") });
          }
        }
      };
      await walk(path);
    } else {
      const zip = await readExportZip(await openAsBlob(path));
      all.push(...zip.names.map((name) => ({ name })));
      files.push(...zip.files);
    }
  }
  const result = parseExport(files);

  const htmlCount = all.filter((f) => f.name.endsWith(".html")).length;
  const jsonCount = all.filter((f) => f.name.endsWith(".json")).length;
  const connectionFiles = files.filter((f) => !f.path.includes("/messages/")).map((f) => f.path);

  const friends = result.friends;
  const followers = friends.filter((f) => f.isFollower);
  const following = friends.filter((f) => f.isFollowing);
  const pct = (n: number, d: number) => (d === 0 ? "-" : `${Math.round((n / d) * 100)}%`);

  console.log("=== 入力の中身 ===");
  console.log(`入力: ${paths.length}個 / ファイル数: ${all.length}（HTML ${htmlCount} / JSON ${jsonCount}）`);
  if (jsonCount > htmlCount) console.log("※ JSON 形式のようです。HTML 形式でダウンロードし直してください。");
  console.log(`フォロワー/フォロー中のファイル: ${connectionFiles.length > 0 ? connectionFiles.join(", ") : "見つかりません"}`);

  // 読めないときの手がかり: 拡張子ごとの件数と、上から2階層ぶんのフォルダ構成（ファイル名・中身は出さない）
  if (connectionFiles.length === 0) {
    const byExt = new Map<string, number>();
    const dirs = new Map<string, number>();
    for (const f of all) {
      const ext = (f.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "(なし)").toLowerCase();
      byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
      const parts = f.name.split(/[\\/]/).slice(0, -1);
      const dir = parts.slice(0, 2).join("/") || "(いちばん上)";
      dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n: number) =>
      [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}: ${v}`).join(", ");
    console.log(`ファイルの種類: ${top(byExt, 8)}`);
    console.log(`フォルダ構成: ${top(dirs, 12)}`);
    console.log("※ 写真や動画しか入っていない場合は、分割された ZIP の一部です。ほかの ZIP（または展開したフォルダ）も一緒に指定してください。");
  }

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
