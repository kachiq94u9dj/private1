import { Hono } from "hono";
import type { Env } from "../types";
import type { Vars } from "../middleware";
import { requireAuth } from "../middleware";
import { buildGoogleLoginUrl, exchangeGoogleLoginCode } from "../lib/googleAuth";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  parseCookies,
  sessionCookie,
} from "../lib/session";
import { findMemberByEmail } from "../lib/members";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

authRoutes.get("/login", async (c) => {
  const state = crypto.randomUUID();
  const url = buildGoogleLoginUrl(c.env, state);
  return c.redirect(url);
});

authRoutes.get("/callback", async (c) => {
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

  const secure = new URL(c.req.url).protocol === "https:";
  c.header("Set-Cookie", sessionCookie(sessionId, secure));
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
