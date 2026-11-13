"use client";

import { useState } from "react";
import { saveImport } from "@/lib/instagram/api";
import { collectFromDrop, collectFromFiles } from "@/lib/instagram/collect";
import { parseExport, type ExportFile, type ParseResult } from "@/lib/instagram/parse";
import type { IgFriendRow } from "@/lib/supabase";
import { Modal, errorMessage } from "./ui";

export default function ImportModal({
  ownerId,
  existing,
  onClose,
  onImported,
  onSignOut,
}: {
  ownerId: string;
  existing: IgFriendRow[];
  onClose: () => void;
  onImported: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ZIP（複数に分かれていてもよい）でも、展開したフォルダでも受け付けて、1つのエクスポートとして解析する。
  async function handle(collect: () => Promise<ExportFile[]>) {
    setParsing(true);
    setResult(null);
    setMessage(null);
    setError(null);
    try {
      const parsed = parseExport(await collect());
      if (parsed.followerFiles === 0 && parsed.followingFiles === 0) {
        setError(
          "フォロワー/フォロー中のファイルが見つかりませんでした。展開したフォルダなら、いちばん上の instagram-… フォルダごと入れてください。ZIP が複数ある場合はすべて一緒に入れてください。",
        );
      } else {
        setResult(parsed);
      }
    } catch (e) {
      setError(`読み込めませんでした: ${errorMessage(e)}`);
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
          <>
            <button type="button" className="tn-btn-link tn-sp" style={{ marginRight: "auto" }} onClick={onSignOut}>
              ログアウト
            </button>
            <button type="button" className="tn-btn" onClick={onClose}>
              閉じる
            </button>
          </>
        )
      }
    >
      <ol className="tn-steps">
        <li>Instagram アプリの「設定 → アカウントセンター → あなたの情報とアクセス許可 → 個人情報をダウンロード」を開く</li>
        <li>
          形式は <strong>HTML</strong> を選び、「フォロワーとフォロー中」と「メッセージ」を含めてダウンロード
        </li>
        <li>届いた ZIP、または展開したフォルダをここに入れる（解析はこのブラウザ内で行い、DM の本文は送信しません）</li>
      </ol>

      {!result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
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
              const data = e.dataTransfer;
              void handle(() => collectFromDrop(data));
            }}
          >
            <strong style={{ display: "block", color: "var(--tn-text)", marginBottom: 4 }}>
              {parsing ? "読み込み中…" : "フォルダか ZIP をここにドラッグ"}
            </strong>
            <span style={{ fontSize: 12 }}>展開した instagram-… フォルダをそのまま入れられます</span>
          </div>
          <div className="tn-chips">
            <label className="tn-btn tn-btn-sm" aria-disabled={parsing || saving}>
              フォルダを選ぶ
              <input
                type="file"
                hidden
                disabled={parsing || saving}
                {...{ webkitdirectory: "", directory: "" }}
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (files.length > 0) void handle(() => collectFromFiles(files));
                }}
              />
            </label>
            <label className="tn-btn tn-btn-sm" aria-disabled={parsing || saving}>
              ZIP を選ぶ
              <input
                type="file"
                accept=".zip,application/zip"
                multiple
                hidden
                disabled={parsing || saving}
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  if (files.length > 0) void handle(() => collectFromFiles(files));
                }}
              />
            </label>
          </div>
        </div>
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
