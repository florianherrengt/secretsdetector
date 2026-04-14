import { Hono } from "hono";
import type { Context } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { z } from "zod";
import healthzRoutes from "./healthz/index.js";
import authRoutes from "./auth/index.js";
import homeRoutes from "./home/index.js";
import sandboxDemoRoutes from "./sandbox/demo/index.js";
import scanRoutes from "./scan/index.js";
import qualifyRoutes from "./qualify/index.js";
import dedupeRoutes from "./dedupe/index.js";
import sourceRoutes from "./source/index.js";
import adminRoutes from "./admin/index.js";
import debugRoutes from "./debug/index.js";
import domainRoutes from "./domains/index.js";
import settingsRoutes from "./settings/index.js";
import { ioredisClient } from "../scan/redis.js";
import { getClientIp } from "../http/clientIp.js";
import { extractSessionId } from "../auth/middleware.js";
import { getSession } from "../auth/index.js";

const app = new Hono();

const endpointRateLimitWindowSeconds = Math.round(
	Number(process.env.ENDPOINT_RATE_LIMIT_WINDOW_MS ?? "60000") / 1000
);
const endpointRateLimitMaxRequests = Number(process.env.ENDPOINT_RATE_LIMIT_MAX_REQUESTS ?? "120");

const endpointRateLimiter = new RateLimiterRedis({
	storeClient: ioredisClient,
	keyPrefix: "endpoint_rl",
	points: endpointRateLimitMaxRequests,
	duration: endpointRateLimitWindowSeconds
});

app.use("/assets/*", serveStatic({ root: "./" }));
app.use(
	"*",
	z
		.function()
		.args(z.custom<Context>(), z.custom<() => Promise<void>>())
		.returns(z.custom<Promise<Response | void>>())
		.implement(async (c, next) => {
			const clientIp = getClientIp(c);
			const sessionId = extractSessionId(c);
			const session = sessionId ? await getSession(sessionId) : null;
			const rateLimitKey = session ? `user:${session.userId}` : `ip:${clientIp}`;

			try {
				await endpointRateLimiter.consume(rateLimitKey);
			} catch {
				return c.text("Too Many Requests", 429);
			}

			await next();
		})
);

app.route("/", healthzRoutes);
app.route("/", authRoutes);
app.route("/", homeRoutes);
app.route("/sandbox/demo", sandboxDemoRoutes);
app.route("/domains", domainRoutes);
app.route("/settings", settingsRoutes);
app.route("/scan", scanRoutes);
app.route("/qualify", qualifyRoutes);
app.route("/dedupe", dedupeRoutes);
app.route("/source", sourceRoutes);
app.route("/admin", adminRoutes);

if (process.env.NODE_ENV !== "production") {
	app.route("/debug", debugRoutes);
}

export default app;
