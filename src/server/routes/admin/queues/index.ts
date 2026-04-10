import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { scanQueue } from "../../../scan/scanQueue.js";
import { requireAuth } from "../../../auth/middleware.js";

const adminQueueRoutes = new Hono();

const bullBoardServerAdapter = new HonoAdapter(serveStatic);
bullBoardServerAdapter.setBasePath("/admin/queues");

createBullBoard({
	queues: [new BullMQAdapter(scanQueue)],
	serverAdapter: bullBoardServerAdapter
});

adminQueueRoutes.use("*", requireAuth);
adminQueueRoutes.route("/", bullBoardServerAdapter.registerPlugin());

export default adminQueueRoutes;
