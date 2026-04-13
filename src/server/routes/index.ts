import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
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

const app = new Hono();

app.use("/assets/*", serveStatic({ root: "./" }));

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
