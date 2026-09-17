import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import type { Vars } from "./middleware";
import { authRoutes } from "./routes/auth";
import { memberRoutes } from "./routes/members";
import { availabilityRoutes } from "./routes/availability";
import { shiftRoutes } from "./routes/shifts";
import { requestRoutes } from "./routes/requests";
import { holidayRoutes } from "./routes/holidays";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use("*", async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.FRONTEND_URL,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

app.get("/", (c) => c.json({ ok: true, service: "shift-app-api" }));

app.route("/api/auth", authRoutes);
app.route("/api/members", memberRoutes);
app.route("/api/availability", availabilityRoutes);
app.route("/api/shifts", shiftRoutes);
app.route("/api/requests", requestRoutes);
app.route("/api/holidays", holidayRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal_error", message: err.message }, 500);
});

export default app;
