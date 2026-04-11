import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { HomePage } from "../../../views/pages/home.js";
import { extractSessionId } from "../../auth/middleware.js";
import { getSession } from "../../auth/index.js";

const homeRoutes = new Hono();
const domainSchema = z.string().min(1);

const normalizeHost = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((rawHost) => {
		const trimmed = rawHost.trim();

		if (trimmed.length === 0) {
			return "";
		}

		const withoutScheme = trimmed.replace(/^https?:\/\//i, "");
		const withoutTrailingSlash = withoutScheme.replace(/\/+$/g, "");

		return withoutTrailingSlash;
	});

const resolveRequestHost = z
	.function()
	.args(z.custom<Context>())
	.returns(z.string().min(1))
	.implement((c) => {
		const forwardedHostHeader = c.req.header("x-forwarded-host") ?? "";
		const forwardedHost = forwardedHostHeader
			.split(",")
			.map((segment) => normalizeHost(segment))
			.find((segment) => segment.length > 0);

		if (forwardedHost) {
			return forwardedHost;
		}

		const hostHeader = normalizeHost(c.req.header("host") ?? "");

		if (hostHeader.length > 0) {
			return hostHeader;
		}

		const envDomain = normalizeHost(process.env.DOMAIN ?? "");

		if (envDomain.length > 0) {
			return envDomain;
		}

		return "localhost:3000";
	});

homeRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			const domain = domainSchema.parse(resolveRequestHost(c));
			const sessionId = extractSessionId(c);
			const session = sessionId ? await getSession(sessionId) : null;
			const isLoggedIn = session !== null;

			return c.html(render(HomePage, { domain, isLoggedIn }));
		})
);

export default homeRoutes;
