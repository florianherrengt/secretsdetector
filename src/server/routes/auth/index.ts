import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { requestMagicLink, verifyMagicLink, logout, getSession } from "../../auth/index.js";
import { extractSessionId } from "../../auth/middleware.js";
import { render } from "../../../lib/response.js";
import { AuthRequestPage } from "../../../views/pages/authRequest.js";

const app = new Hono();

app.get(
	"/auth/sign-in",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			return c.html(render(AuthRequestPage, { mode: "sign-in" as const }));
		})
);

app.get(
	"/auth/sign-up",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			return c.html(render(AuthRequestPage, { mode: "sign-up" as const }));
		})
);

app.post(
  "/auth/request-link",
  z
    .function()
    .args(z.custom<Context>())
    .returns(z.promise(z.instanceof(Response)))
    .implement(async (c) => {
      const contentType = c.req.header("content-type") || "";
      const body = contentType.includes("application/json")
        ? await c.req.json()
        : await c.req.parseBody();
      const email = typeof body?.email === "string" ? body.email.trim() : "";

      if (!email) {
        return c.json({ error: "Email is required" }, 400);
      }

      await requestMagicLink(email);

      if (contentType.includes("application/json")) {
        return c.json({ success: true });
      }

      const mode = body?.mode === "sign-up" ? "sign-up" : "sign-in";
      return c.html(
        render(AuthRequestPage, {
          mode,
          message: "Check your email for a sign-in link."
        })
      );
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
            "Location": "/domains",
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
