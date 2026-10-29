"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { AttendeeStatus } from "@/lib/supabase";

export const STATUS_LABELS: Record<AttendeeStatus, string> = {
  candidate: "候補",
  invited: "招待済み",
  replied: "返事あり",
  attending: "参加",
  declined: "不参加",
  attended: "来場",
};

export const STATUS_ORDER: AttendeeStatus[] = ["candidate", "invited", "replied", "attending", "declined", "attended"];

export const STATUS_COLORS: Record<AttendeeStatus, string> = {
  candidate: "var(--text-muted)",
  invited: "var(--series-1)",
  replied: "var(--series-4)",
  attending: "var(--good)",
  declined: "var(--critical)",
  attended: "var(--series-3)",
};

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export const inputStyle: CSSProperties = {
  fontSize: 13,
  padding: "6px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--surface-1)",
  color: "var(--text-primary)",
};

export function buttonStyle(primary = false): CSSProperties {
  return {
    fontSize: 13,
    padding: "6px 12px",
    borderRadius: 6,
    cursor: "pointer",
    border: primary ? "1px solid var(--series-1)" : "1px solid var(--border)",
    background: primary ? "var(--series-1)" : "var(--surface-1)",
    color: primary ? "#ffffff" : "var(--text-primary)",
    fontWeight: primary ? 600 : 400,
  };
}

export const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "var(--text-secondary)",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

export const tdStyle: CSSProperties = { padding: "6px 8px", verticalAlign: "middle" };

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 16,
        marginBottom: 16,
      }}
    >
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {title && <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{title}</h2>}
          {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** 絞り込んだ人の @ユーザー名 の一括コピーと、プロフィールへのリンク一覧。 */
export function ExportBox({ usernames, label }: { usernames: string[]; label: string }) {
  const [copied, setCopied] = useState(false);
  const [showLinks, setShowLinks] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(usernames.map((u) => `@${u}`).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        border: "1px dashed var(--baseline)",
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {label}: <strong style={{ color: "var(--text-primary)" }}>{usernames.length}人</strong>
        </span>
        <button style={{ ...buttonStyle(), marginLeft: "auto" }} onClick={copy} disabled={usernames.length === 0}>
          {copied ? "コピーしました" : "@ユーザー名をコピー"}
        </button>
        <button style={buttonStyle()} onClick={() => setShowLinks((v) => !v)} disabled={usernames.length === 0}>
          {showLinks ? "リンクを隠す" : "プロフィールのリンク一覧"}
        </button>
      </div>
      {showLinks && (
        <ol style={{ margin: "12px 0 0", paddingLeft: 24, fontSize: 13, lineHeight: 1.8, columns: "220px" }}>
          {usernames.map((u) => (
            <li key={u}>
              <a href={profileUrl(u)} target="_blank" rel="noreferrer" style={{ color: "var(--series-1)" }}>
                @{u}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
