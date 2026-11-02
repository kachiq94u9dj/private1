"use client";

import { useEffect, useState, type ReactNode } from "react";
import { avatarLabel, displayName, profileUrl, tagColor } from "@/lib/instagram/selectors";
import type { IgFriendRow, IgTagRow } from "@/lib/supabase";

// ---- icons ----

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const Icon = {
  people: (
    <Svg size={22}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9" />
    </Svg>
  ),
  refresh: (
    <Svg size={16}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </Svg>
  ),
  search: (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  close: (
    <Svg>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  check: (
    <Svg size={16}>
      <path d="m5 12 5 5 9-10" />
    </Svg>
  ),
};

// ---- small parts ----

export function Avatar({ friend, color, small }: { friend: IgFriendRow; color?: IgTagRow; small?: boolean }) {
  const c = tagColor(color);
  return (
    <span className={`tn-avatar${small ? " tn-avatar-sm" : ""}`} style={{ background: c.bg, color: c.fg }}>
      {avatarLabel(friend)}
    </span>
  );
}

export function PersonName({ friend }: { friend: IgFriendRow }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p className="tn-name">{displayName(friend)}</p>
      <a className="tn-handle" href={profileUrl(friend.username)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        @{friend.username}
      </a>
    </div>
  );
}

export function TagChip({ tag }: { tag: IgTagRow }) {
  if (tag.kind === "attribute") return <span className="tn-tag tn-tag-outline">{tag.name}</span>;
  const c = tagColor(tag);
  return (
    <span className="tn-tag" style={{ background: c.bg, color: c.fg }}>
      {tag.name}
    </span>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="tn-check"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      {checked && Icon.check}
    </button>
  );
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---- modal ----

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tn-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`tn-modal${wide ? " tn-modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="tn-modal-head">
          <h2 className="tn-modal-title">{title}</h2>
          <button className="tn-icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="閉じる">
            {Icon.close}
          </button>
        </div>
        <div className="tn-modal-body">{children}</div>
        {footer && <div className="tn-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---- export (copy usernames / profile links) ----

export function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return [copied, copy];
}

export function usernamesText(usernames: string[]): string {
  return usernames.map((u) => `@${u}`).join("\n");
}

export function LinksModal({
  title,
  usernames,
  onClose,
  children,
}: {
  title: string;
  usernames: string[];
  onClose: () => void;
  children?: ReactNode;
}) {
  const [copied, copy] = useCopy();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button className="tn-btn" onClick={() => copy(usernamesText(usernames))}>
          {copied ? "コピーしました" : "@ユーザー名をコピー"}
        </button>
      }
    >
      {children}
      <p className="tn-muted" style={{ marginTop: 0 }}>
        {usernames.length}人。クリックすると Instagram のプロフィールが開きます。
      </p>
      <ol className="tn-links">
        {usernames.map((u) => (
          <li key={u}>
            <a href={profileUrl(u)} target="_blank" rel="noreferrer">
              @{u}
            </a>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

/** 「@ユーザー名をコピー」「プロフィールのリンク一覧」の2つのボタン。 */
export function ExportButtons({ usernames, label, small }: { usernames: string[]; label: string; small?: boolean }) {
  const [copied, copy] = useCopy();
  const [showLinks, setShowLinks] = useState(false);
  const cls = `tn-btn${small ? " tn-btn-sm" : ""}`;
  return (
    <>
      <button className={cls} disabled={usernames.length === 0} onClick={() => copy(usernamesText(usernames))}>
        {copied ? "コピーしました" : "@ユーザー名をコピー"}
      </button>
      <button className={cls} disabled={usernames.length === 0} onClick={() => setShowLinks(true)}>
        プロフィールのリンク一覧
      </button>
      {showLinks && <LinksModal title={label} usernames={usernames} onClose={() => setShowLinks(false)} />}
    </>
  );
}
