"use client";

import { useState } from "react";
import JSZip from "jszip";
import { isRelevantPath, parseExport, type ParseResult } from "@/lib/instagram/parse";
import { getBrowserClient, type IgFriendRow } from "@/lib/supabase";
import { Card, StatTile, buttonStyle } from "./ui";

const CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default function ImportPanel({
  ownerId,
  existing,
  onImported,
}: {
  ownerId: string;
  existing: IgFriendRow[];
  onImported: () => Promise<void>;
}) {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setParsing(true);
    setResult(null);
    setMessage(null);
    setError(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir && isRelevantPath(f.name));
      const files = await Promise.all(entries.map(async (f) => ({ path: f.name, html: await f.async("string") })));
      const parsed = parseExport(files);
      if (parsed.followerFiles === 0 && parsed.followingFiles === 0) {
        setError(
          "フォロワー/フォロー中のファイルが見つかりませんでした。「情報をダウンロード」で HTML 形式を選び、「フォロワーとフォロー中」を含めてダウンロードした ZIP か確認してください。",
        );
      } else {
        setResult(parsed);
      }
    } catch (e) {
      setError(`ZIP を読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setError(null);
    const supabase = getBrowserClient();
    try {
      const now = new Date().toISOString();
      const rows = result.friends.map((f) => ({
        owner_id: ownerId,
        username: f.username,
        is_follower: f.isFollower,
        is_following: f.isFollowing,
        followed_me_at: f.followedMeAt,
        i_followed_at: f.iFollowedAt,
        dm_count: f.dmCount,
        last_dm_at: f.lastDmAt,
        imported_at: now,
      }));
      for (const batch of chunks(rows, CHUNK)) {
        const { error } = await supabase.from("ig_friends").upsert(batch, { onConflict: "owner_id,username" });
        if (error) throw error;
      }

      // 今回のデータに出てこない人は、メモやイベント履歴を残したまま「つながりなし」にする。
      const present = new Set(result.friends.map((f) => f.username));
      const gone = existing.filter((f) => !present.has(f.username) && (f.is_follower || f.is_following));
      for (const batch of chunks(gone.map((f) => f.id), CHUNK)) {
        const { error } = await supabase
          .from("ig_friends")
          .update({ is_follower: false, is_following: false, imported_at: now })
          .in("id", batch);
        if (error) throw error;
      }

      await onImported();
      setMessage(`${rows.length}人を保存しました。${gone.length > 0 ? `${gone.length}人はつながりが無くなったため更新しました。` : ""}`);
      setResult(null);
    } catch (e) {
      setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const mutual = result?.friends.filter((f) => f.isFollower && f.isFollowing).length ?? 0;

  return (
    <Card title="Instagram のデータを取り込む">
      <ol style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.8, margin: "0 0 12px", paddingLeft: 20 }}>
        <li>Instagram アプリの「設定 → アカウントセンター → あなたの情報とアクセス許可 → 個人情報をダウンロード」を開く</li>
        <li>形式は <strong>HTML</strong> を選び、「フォロワーとフォロー中」と「メッセージ」を含めてダウンロード</li>
        <li>届いた ZIP ファイルをここで選択（解析はこのブラウザ内で行い、DM の本文は送信しません）</li>
      </ol>

      <input
        type="file"
        accept=".zip,application/zip"
        disabled={parsing || saving}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      {parsing && <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>解析中…</p>}
      {error && <p style={{ fontSize: 13, color: "var(--critical)" }}>{error}</p>}
      {message && <p style={{ fontSize: 13, color: "var(--good)" }}>{message}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <StatTile label="友達（合計）" value={result.friends.length.toLocaleString()} />
            <StatTile label="フォロワー" value={result.friends.filter((f) => f.isFollower).length.toLocaleString()} />
            <StatTile label="フォロー中" value={result.friends.filter((f) => f.isFollowing).length.toLocaleString()} />
            <StatTile label="相互フォロー" value={mutual.toLocaleString()} />
            <StatTile
              label="DM スレッド"
              value={`${result.dmThreadsMatched} / ${result.dmThreads}`}
              sub={`対応付け済み / 全体（グループ ${result.dmThreadsGroup} 件は対象外）`}
            />
          </div>
          {result.unmatchedThreads.length > 0 && (
            <details style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
              <summary>ユーザー名と対応付けられなかった DM スレッド {result.unmatchedThreads.length} 件</summary>
              <p style={{ margin: "8px 0 0" }}>
                フォロー関係のない相手か、フォルダ名からユーザー名を判別できなかった相手です:{" "}
                {result.unmatchedThreads.slice(0, 50).join(", ")}
                {result.unmatchedThreads.length > 50 ? " …" : ""}
              </p>
            </details>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button style={buttonStyle(true)} onClick={save} disabled={saving}>
              {saving ? "保存中…" : "この内容で保存する"}
            </button>
            <button style={buttonStyle()} onClick={() => setResult(null)} disabled={saving}>
              やめる
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
