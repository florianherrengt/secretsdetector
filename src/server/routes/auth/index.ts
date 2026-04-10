import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { requestMagicLink, verifyMagicLink, logout, getSession } from "../../auth/index.js";
import { extractSessionId } from "../../auth/middleware.js";

const app = new Hono();

app.post(
  "/auth/request-link",
  z
    .function()
    .args(z.custom<Context>())
    .returns(z.promise(z.instanceof(Response)))
    .implement(async (c) => {
      const body = await c.req.json();
      if (!body?.email || typeof body.email !== "string") {
        return c.json({ error: "Email is required" }, 400);
      }
      await requestMagicLink(body.email);
      return c.json({ success: true });
    })
);

app.get(
  "/auth/verify",
  z
    .function()
    .args(z.custom<Context>())
    .returns(z.promise(z.instanceof(Response)))
    .implement(async (c) => {
      const token = c.req.query("token");

      if (!token) {
        return c.html("<h1>Invalid request</h1>", 400);
      }

      try {
        const { sessionId } = await verifyMagicLink(token);
        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

        return new Response(null, {
          status: 302,
          headers: {
            "Location": "/",
            "Set-Cookie": `session_id=${sessionId}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`
          }
        });
      } catch {
        return c.html("<h1>Invalid or expired login link</h1><p><a href='/'>Try again</a></p>", 401);
      }
    })
);

app.post(
  "/auth/logout",
  z
    .function()
    .args(z.custom<Context>())
    .returns(z.promise(z.instanceof(Response)))
    .implement(async (c) => {
      const sessionId = extractSessionId(c);

      if (sessionId) {
        await logout(sessionId);
      }

      return c.json({ success: true }, {
        headers: {
          "Set-Cookie": "session_id=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
        }
      });
    })
);

app.get(
  "/auth/whoami",
  z
    .function()
    .args(z.custom<Context>())
    .returns(z.promise(z.instanceof(Response)))
    .implement(async (c) => {
      const sessionId = extractSessionId(c);

      if (!sessionId) {
        return c.json({ error: "Not authenticated" }, 401);
      }

      const user = await getSession(sessionId);

      if (!user) {
        return c.json({ error: "Invalid session" }, 401);
      }

      return c.json({ userId: user.userId, email: user.email });
    })
);

export default app;
