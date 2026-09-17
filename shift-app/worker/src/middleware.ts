import type { Context, Next } from "hono";
import type { Env, SessionData } from "./types";
import { getSession, parseCookies } from "./lib/session";

export type Vars = { user: SessionData };

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  next: Next
) {
  const cookies = parseCookies(c.req.header("Cookie") ?? null);
  const sid = cookies["sid"];
  const session = sid ? await getSession(c.env, sid) : null;
  if (!session) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", session);
  await next();
}

export async function requireAdmin(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  next: Next
) {
  const user = c.get("user");
  if (!user?.isAdmin) {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
}
