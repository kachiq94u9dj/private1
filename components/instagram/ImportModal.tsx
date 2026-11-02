"use client";

import { useState } from "react";
import JSZip from "jszip";
import { saveImport } from "@/lib/instagram/api";
import { isRelevantPath, parseExport, type ParseResult } from "@/lib/instagram/parse";
import type { IgFriendRow } from "@/lib/supabase";
import { Modal, errorMessage } from "./ui";

export default function ImportModal({
  ownerId,
  existing,
  onClose,
  onImported,
}: {
  ownerId: string;
  existing: IgFriendRow[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
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
          "フォロワー/フォロー中のファイルが見つかりませんでした。HTML 形式で「フォロワーとフォロー中」を含めてダウンロードした ZIP か確認してください。",
        );
      } else {
        setResult(parsed);
      }
    } catch (e) {
      setError(`ZIP を読み込めませんでした: ${errorMessage(e)}`);
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const goneCount = await saveImport(ownerId, result, existing);
      await onImported();
      setMessage(
        `${result.friends.length.toLocaleString()}人を保存しました。${goneCount > 0 ? `${goneCount}人はつながりが無くなったため更新しました。` : ""}`,
      );
      setResult(null);
    } catch (e) {
      setError(`保存に失敗しました: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const named = result?.friends.filter((f) => f.displayName).length ?? 0;

  return (
    <Modal
      title="Instagramから取り込み"
      onClose={onClose}
      footer={
        result ? (
          <>
            <button className="tn-btn" onClick={() => setResult(null)} disabled={saving}>
              やめる
            </button>
            <button className="tn-btn tn-btn-dark" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "この内容で保存する"}
            </button>
          </>
        ) : (
          <button className="tn-btn" onClick={onClose}>
            閉じる
          </button>
        )
      }
    >
      <ol className="tn-steps">
        <li>Instagram アプリの「設定 → アカウントセンター → あなたの情報とアクセス許可 → 個人情報をダウンロード」を開く</li>
        <li>
          形式は <strong>HTML</strong> を選び、「フォロワーとフォロー中」と「メッセージ」を含めてダウンロード
        </li>
        <li>届いた ZIP をここに入れる（解析はこのブラウザ内で行い、DM の本文は送信しません）</li>
      </ol>

      {!result && (
        <label
          className="tn-dropzone"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            type="file"
            accept=".zip,application/zip"
            hidden
            disabled={parsing || saving}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <strong style={{ display: "block", color: "var(--tn-text)", marginBottom: 4 }}>
            {parsing ? "解析中…" : "ZIP ファイルをドラッグ、またはクリックして選択"}
          </strong>
          <span style={{ fontSize: 12 }}>instagram-ユーザー名-日付.zip のようなファイルです</span>
        </label>
      )}

      {error && <p className="tn-error">{error}</p>}
      {message && <p className="tn-ok">{message}</p>}

      {result && (
        <>
          <div className="tn-mini-stats">
            <div>
              <strong>{result.friends.length.toLocaleString()}</strong>友達（合計）
            </div>
            <div>
              <strong>{result.friends.filter((f) => f.isFollower).length.toLocaleString()}</strong>フォロワー
            </div>
            <div>
              <strong>{result.friends.filter((f) => f.isFollowing).length.toLocaleString()}</strong>フォロー中
            </div>
            <div>
              <strong>{result.friends.filter((f) => f.isFollower && f.isFollowing).length.toLocaleString()}</strong>相互フォロー
            </div>
            <div>
              <strong>
                {result.dmThreadsMatched}/{result.dmThreads}
              </strong>
              DM（名前 {named}人分）
            </div>
          </div>
          <p className="tn-muted">
            グループ DM {result.dmThreadsGroup}件は対象外です。名前は DM の相手名から入れます（すでに名前を入れた人は上書きしません）。
          </p>
          {result.unmatchedThreads.length > 0 && (
            <details className="tn-muted">
              <summary>ユーザー名と対応付けられなかった DM {result.unmatchedThreads.length}件</summary>
              <p>
                {result.unmatchedThreads.slice(0, 50).join(", ")}
                {result.unmatchedThreads.length > 50 ? " …" : ""}
              </p>
            </details>
          )}
        </>
      )}
    </Modal>
  );
}
