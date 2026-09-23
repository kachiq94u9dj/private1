import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Cloudflare Access が付与する JWT (Cf-Access-Jwt-Assertion) を検証する。
 * Access の設定漏れ（workers.dev 経由のアクセスなど）があってもデータが見えないよう、
 * 設定がない場合は拒否する（fail closed）。
 */
export async function verifyAccess(request: Request, env: Env): Promise<{ ok: true; email: string | null } | { ok: false; reason: string }> {
  if (env.DEV_ALLOW_NO_AUTH === "true") return { ok: true, email: null };

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!teamDomain || !env.ACCESS_AUD) {
    return { ok: false, reason: "Cloudflare Access が未設定です（ACCESS_TEAM_DOMAIN / ACCESS_AUD）" };
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, reason: "Cloudflare Access の認証情報がありません" };

  const issuer = `https://${teamDomain}`;
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    return { ok: true, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    return { ok: false, reason: "Cloudflare Access のトークンが無効です" };
  }
}

/** 収集スクリプト用の Bearer トークンを定数時間で比較する */
export async function verifyIngestToken(request: Request, env: Env): Promise<boolean> {
  const expected = env.INGEST_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("Authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}
