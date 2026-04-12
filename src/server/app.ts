import "dotenv/config";
import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { serve } from "@hono/node-server";
import indexRoutes from "./routes/index.js";
import { startScanWorker } from "./scan/scanWorker.js";
import { registerHourlyScheduler, startSchedulerWorker } from "./scheduler/schedulerQueue.js";

const app = new Hono();

if (process.env.NODE_ENV !== "test") {
	startScanWorker();
	startSchedulerWorker();
	void registerHourlyScheduler();
}

app.route("/", indexRoutes);

app.onError(
	z
		.function()
		.args(z.instanceof(Error), z.custom<Context>())
		.returns(z.instanceof(Response))
		.implement((err, c) => {
			console.error("Unhandled error:", err);
			return c.html("<h1>500 Internal Server Error</h1>", 500);
		})
);

const port = Number(process.env.PORT) || 3000;
const domain = z.string().min(1).parse(process.env.DOMAIN ?? `localhost:${port}`);

serve(
	{ fetch: app.fetch, port },
	z
		.function()
		.args()
		.returns(z.void())
		.implement(() => {
			console.log(`Server running on http://${domain}`);
		})
);
