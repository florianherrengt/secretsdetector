import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { HomePage } from "../../../views/pages/home.js";

const homeRoutes = new Hono();

homeRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.html(render(HomePage, {}));
		})
);

export default homeRoutes;
