import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { requireBasicAuth } from "../../auth/basicAuth.js";
import { render } from "../../../lib/response.js";
import { AdminPage } from "../../../views/pages/admin.js";
import adminQueueRoutes from "./queues/index.js";

const adminRoutes = new Hono();

adminRoutes.use("*", requireBasicAuth);

adminRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			return c.html(render(AdminPage, {}));
		})
);

adminRoutes.route("/queues", adminQueueRoutes);

export default adminRoutes;
