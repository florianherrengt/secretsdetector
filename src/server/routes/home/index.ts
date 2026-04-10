import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { HomePage } from "../../../views/pages/home.js";

const homeRoutes = new Hono();
const domainSchema = z.string().min(1);

homeRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const port = Number(process.env.PORT) || 3000;
			const domain = domainSchema.parse(process.env.DOMAIN ?? `localhost:${port}`);

			return c.html(render(HomePage, { domain }));
		})
);

export default homeRoutes;
