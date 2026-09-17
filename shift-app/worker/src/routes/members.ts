import { Hono } from "hono";
import type { Env } from "../types";
import type { Vars } from "../middleware";
import { requireAuth } from "../middleware";
import { getMembers } from "../lib/members";

export const memberRoutes = new Hono<{ Bindings: Env; Variables: Vars }>();

memberRoutes.get("/", requireAuth, async (c) => {
  const members = await getMembers(c.env);
  return c.json(members);
});
