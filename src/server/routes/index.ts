import { Hono } from "hono";
import healthzRoutes from "./healthz/index.js";
import homeRoutes from "./home/index.js";
import sandboxWebsiteRoutes from "./sandbox/website/index.js";
import scanRoutes from "./scan/index.js";
import qualifyRoutes from "./qualify/index.js";

const app = new Hono();

app.route("/", healthzRoutes);
app.route("/", homeRoutes);
app.route("/sandbox/website", sandboxWebsiteRoutes);
app.route("/scan", scanRoutes);
app.route("/qualify", qualifyRoutes);

export default app;
