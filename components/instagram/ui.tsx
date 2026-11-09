"use client";

import { useEffect, useState, type ReactNode } from "react";
import { avatarLabel, displayName, profileUrl, tagColor } from "@/lib/instagram/selectors";
import type { IgFriendRow, IgTagRow } from "@/lib/supabase";

// ---- icons ----

function Svg({ children, size = 18, width = 2 }: { children: ReactNode; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const peoplePaths = (
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14.5c2.4.2 4 1.8 4.5 4.5" />
  </>
);

export const Icon = {
  people: <Svg size={22}>{peoplePaths}</Svg>,
  peopleNav: <Svg size={24}>{peoplePaths}</Svg>,
  calendar: (
    <Svg size={24}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  ),
  refresh: (
    <Svg size={18}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
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
  plus: (
    <Svg size={20} width={2.5}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
};

// ---- small parts ----

export function Avatar({ friend, color, small }: { friend: IgFriendRow; color?: IgTagRow; small?: boolean }) {
  const c = tagColor(color);
  return (
    <span className={`tn-avatar${small ? " tn-avatar-sm" : ""}`} style={{ background: c.bg, color: c.fg }} aria-hidden>
      {avatarLabel(friend)}
    </span>
  );
}

export function PersonName({ friend }: { friend: IgFriendRow }) {
  return (
    <div className="tn-person">
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

/** コミュニティタグで色付けする、押し込み式のチップ（選択中はタグの色になる）。 */
export function CommunityChip({
  tag,
  active,
  onClick,
  children,
  className = "",
}: {
  tag: IgTagRow;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  const c = tagColor(tag);
  return (
    <button
      type="button"
      className={`tn-chip ${className}`}
      aria-pressed={active}
      onClick={onClick}
      style={active ? { background: c.bg, borderColor: c.fg, color: c.fg } : undefined}
    >
      {children}
    </button>
  );
}

export function SelectBox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      className="tn-check"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <span>{checked && Icon.check}</span>
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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tn-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tn-modal" role="dialog" aria-modal="true" aria-label={title}>
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
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
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
      <p className="tn-muted" style={{ margin: 0 }}>
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
export function ExportButtons({ usernames, label }: { usernames: string[]; label: string }) {
  const [copied, copy] = useCopy();
  const [showLinks, setShowLinks] = useState(false);
  return (
    <>
      <button className="tn-btn tn-btn-sm" disabled={usernames.length === 0} onClick={() => copy(usernamesText(usernames))}>
        {copied ? "コピーしました" : "@ユーザー名をコピー"}
      </button>
      <button className="tn-btn tn-btn-sm" disabled={usernames.length === 0} onClick={() => setShowLinks(true)}>
        プロフィールのリンク一覧
      </button>
      {showLinks && <LinksModal title={label} usernames={usernames} onClose={() => setShowLinks(false)} />}
    </>
  );
}
