import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { HomePage } from "../../../views/pages/home.js";
import { extractSessionId } from "../../auth/middleware.js";
import { getSession } from "../../auth/index.js";

const homeRoutes = new Hono();
const domainSchema = z.string().min(1);

homeRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			const port = Number(process.env.PORT) || 3000;
			const domain = domainSchema.parse(process.env.DOMAIN ?? `localhost:${port}`);
			const sessionId = extractSessionId(c);
			const session = sessionId ? await getSession(sessionId) : null;
			const isLoggedIn = session !== null;

			return c.html(render(HomePage, { domain, isLoggedIn }));
		})
);

export default homeRoutes;
