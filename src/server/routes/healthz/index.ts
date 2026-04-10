import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";

const healthzRoutes = new Hono();

healthzRoutes.get(
	"/healthz",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.instanceof(Response))
		.implement((c) => {
			return c.json({ status: "ok" });
		})
);

export default healthzRoutes;
