import { Hono } from "hono";
import type { Env } from "../types";
import type { Vars } from "../middleware";
import { requireAuth } from "../middleware";
import { buildGoogleLoginUrl, exchangeGoogleLoginCode } from "../lib/googleAuth";
import {
  clearOauthStateCookie,
  clearSessionCookie,
  createSession,
  deleteSession,
  oauthStateCookie,
  parseCookies,
  sessionCookie,
} from "../lib/session";
import { findMemberByEmail } from "../lib/members";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

authRoutes.get("/login", async (c) => {
  const state = crypto.randomUUID();
  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", oauthStateCookie(state, secure));
  return c.redirect(buildGoogleLoginUrl(c.env, state));
});

authRoutes.get("/callback", async (c) => {
  const secure = new URL(c.req.url).protocol === "https:";
  // CSRF対策: /login発行時にCookieへ保存したstateと、Googleから返ってきたstateが
  // 一致するかを検証する(一致しなければ第三者が仕込んだ認可コードの可能性がある)。
  const cookies = parseCookies(c.req.header("Cookie") ?? null);
  const returnedState = c.req.query("state");
  c.header("Set-Cookie", clearOauthStateCookie(secure), { append: true });

  if (!returnedState || !cookies["oauth_state"] || returnedState !== cookies["oauth_state"]) {
    return c.text("ログイン処理の検証に失敗しました。もう一度お試しください。", 400);
  }

  const code = c.req.query("code");
  if (!code) return c.json({ error: "missing code" }, 400);

  const idToken = await exchangeGoogleLoginCode(c.env, code);

  if (idToken.hd !== c.env.ALLOWED_EMAIL_DOMAIN || !idToken.email_verified) {
    return c.text("このGoogleアカウントではログインできません。", 403);
  }

  const member = await findMemberByEmail(c.env, idToken.email);
  if (!member || member.status !== "active") {
    return c.text("メンバー一覧に登録されていないため利用できません。管理者に確認してください。", 403);
  }

  const sessionId = await createSession(c.env, {
    memberId: member.id,
    email: member.email,
    name: member.name,
    isAdmin: member.isAdmin,
  });

  c.header("Set-Cookie", sessionCookie(sessionId, secure), { append: true });
  return c.redirect(c.env.FRONTEND_URL);
});

authRoutes.post("/logout", async (c) => {
  const cookies = parseCookies(c.req.header("Cookie") ?? null);
  if (cookies["sid"]) await deleteSession(c.env, cookies["sid"]);
  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", clearSessionCookie(secure));
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  return c.json(c.get("user"));
});
