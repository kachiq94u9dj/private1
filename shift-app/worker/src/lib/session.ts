import type { Env, SessionData } from "../types";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7日
const SESSION_KEY_PREFIX = "session:";

export async function createSession(env: Env, data: SessionData): Promise<string> {
  const sessionId = crypto.randomUUID();
  await env.SESSIONS.put(SESSION_KEY_PREFIX + sessionId, JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return sessionId;
}

export async function getSession(env: Env, sessionId: string): Promise<SessionData | null> {
  const raw = await env.SESSIONS.get(SESSION_KEY_PREFIX + sessionId);
  return raw ? (JSON.parse(raw) as SessionData) : null;
}

export async function deleteSession(env: Env, sessionId: string): Promise<void> {
  await env.SESSIONS.delete(SESSION_KEY_PREFIX + sessionId);
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

export function sessionCookie(sessionId: string, secure: boolean): string {
  const attrs = [
    `sid=${sessionId}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = ["sid=", "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

const OAUTH_STATE_TTL_SECONDS = 300; // 5分。ログイン開始→Google側での操作完了までの許容時間

/** OAuthログイン開始時に発行するCSRF対策用stateを一時Cookieに保持する */
export function oauthStateCookie(state: string, secure: boolean): string {
  const attrs = [
    `oauth_state=${state}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${OAUTH_STATE_TTL_SECONDS}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function clearOauthStateCookie(secure: boolean): string {
  const attrs = ["oauth_state=", "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}
