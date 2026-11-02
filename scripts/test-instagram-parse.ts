// lib/instagram/parse.ts の簡易テスト。`npm run test:instagram` で実行する。
import assert from "node:assert/strict";
import { extractDates, parseExport } from "../lib/instagram/parse";

const followers = `<html><body><main>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/taro.yamada">taro.yamada</a></div><div>Jan 05, 2024 10:22 am</div></div></div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/hanako_s">hanako_s</a></div><div>Dec 31, 2023 11:05 pm</div></div></div></div>
</main></body></html>`;

const following = `<html><body><main>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">taro.yamada</h2><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/_u/taro.yamada">https://www.instagram.com/_u/taro.yamada</a></div><div>2024年2月1日 午後3:04</div></div></div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">cafe_tokyo</h2><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/_u/cafe_tokyo">https://www.instagram.com/_u/cafe_tokyo</a></div><div>Mar 10, 2024 9:00 am</div></div></div></div>
</main></body></html>`;

const dmTaro = `<html><head><title>Taro Yamada</title></head><body><div class="_3b0d"><h1>Taro Yamada</h1><div>Participants: Taro Yamada and Me</div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2>Taro Yamada</h2><div class="_3-95 _a6-p"><div>イベント行きたいです！</div></div><div class="_3-94 _a6-o">Apr 02, 2024 8:15 pm</div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2>Me</h2><div class="_3-95 _a6-p"><div>ありがとう</div></div><div class="_3-94 _a6-o">Apr 01, 2024 7:00 pm</div></div>
</div></body></html>`;

const dmGroup = `<html><body><div>Participants: A, B, C</div>
<div class="_3-94 _a6-o">Apr 03, 2024 8:15 pm</div></body></html>`;

const dmStranger = `<html><body><div>Participants: Someone</div>
<div class="_3-94 _a6-o">May 03, 2024 8:15 am</div></body></html>`;

const result = parseExport([
  { path: "instagram-me/connections/followers_and_following/followers_1.html", html: followers },
  { path: "instagram-me/connections/followers_and_following/following.html", html: following },
  { path: "instagram-me/your_instagram_activity/messages/inbox/taroyamada_1234567/message_1.html", html: dmTaro },
  { path: "instagram-me/your_instagram_activity/messages/inbox/groupchat_99/message_1.html", html: dmGroup },
  { path: "instagram-me/your_instagram_activity/messages/inbox/someone_55/message_1.html", html: dmStranger },
  { path: "instagram-me/connections/followers_and_following/close_friends.html", html: followers },
]);

assert.equal(result.followerFiles, 1);
assert.equal(result.followingFiles, 1);
assert.deepEqual(result.friends.map((f) => f.username), ["cafe_tokyo", "hanako_s", "taro.yamada"]);

const taro = result.friends.find((f) => f.username === "taro.yamada")!;
assert.equal(taro.isFollower, true);
assert.equal(taro.isFollowing, true);
assert.equal(taro.followedMeAt, new Date(2024, 0, 5, 10, 22).toISOString());
assert.equal(taro.iFollowedAt, new Date(2024, 1, 1, 15, 4).toISOString());
assert.equal(taro.dmCount, 2);
assert.equal(taro.lastDmAt, new Date(2024, 3, 2, 20, 15).toISOString());
assert.equal(taro.displayName, "Taro Yamada");

const hanako = result.friends.find((f) => f.username === "hanako_s")!;
assert.equal(hanako.isFollowing, false);
assert.equal(hanako.followedMeAt, new Date(2023, 11, 31, 23, 5).toISOString());

const cafe = result.friends.find((f) => f.username === "cafe_tokyo")!;
assert.equal(cafe.isFollower, false);
assert.equal(cafe.dmCount, 0);
assert.equal(cafe.displayName, null);

assert.equal(result.dmThreads, 3);
assert.equal(result.dmThreadsMatched, 1);
assert.equal(result.dmThreadsGroup, 1);
assert.deepEqual(result.unmatchedThreads, ["someone"]);

assert.deepEqual(extractDates("12月 5, 2023 12:30 午前"), [new Date(2023, 11, 5, 0, 30).toISOString()]);
assert.deepEqual(extractDates("2024年1月5日 12:10"), [new Date(2024, 0, 5, 12, 10).toISOString()]);

console.log("instagram parse: all tests passed");
