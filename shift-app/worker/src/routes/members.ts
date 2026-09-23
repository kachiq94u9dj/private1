import { Hono } from "hono";
import type { Env } from "../types";
import type { Vars } from "../middleware";
import { requireAuth } from "../middleware";
import { getMembers } from "../lib/members";

export const memberRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

memberRoutes.get("/", requireAuth, async (c) => {
  const members = await getMembers(c.env);
  // メールアドレスはPIIかつフロント側では未使用のため、一覧APIには含めない
  // (カレンダー連携等のメール利用は全てサーバー内部のgetMembers()呼び出しで完結させる)。
  const publicMembers = members.map(({ id, name, role, status, isAdmin }) => ({
    id,
    name,
    role,
    status,
    isAdmin,
  }));
  return c.json(publicMembers);
});
