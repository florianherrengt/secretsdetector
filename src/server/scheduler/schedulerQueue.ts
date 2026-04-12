import { Queue, Worker } from "bullmq";
import { z } from "zod";
import { dispatchScans } from "./dispatchScans.js";
import { ioredisClient } from "../scan/redis.js";

export const schedulerQueueName = "schedulerQueue";

export const registerHourlyScheduler = z
	.function()
	.args()
	.returns(z.promise(z.void()))
	.implement(async () => {
		const schedulerQueue = new Queue(schedulerQueueName, {
			connection: ioredisClient
		});

		await schedulerQueue.upsertJobScheduler("hourly-scan-dispatch", {
			pattern: "0 * * * *"
		});

		console.log("[scheduler] Registered hourly job scheduler");
	});

let schedulerWorker: Worker | null = null; // eslint-disable-line custom/no-mutable-variables

export const startSchedulerWorker = z
	.function()
	.args()
	.returns(z.custom<Worker>())
	.implement(() => {
		if (schedulerWorker) {
			return schedulerWorker;
		}

		schedulerWorker = new Worker(
			schedulerQueueName,
			z
				.function()
				.args()
				.returns(z.promise(z.void()))
				.implement(async () => {
					await dispatchScans();
				}),
			{ connection: ioredisClient }
		);

		console.log(`[scheduler] Worker listening on queue ${schedulerQueueName}`);

		return schedulerWorker;
	});
