import { Queue } from "bullmq";
import { z } from "zod";
import { scanQueueJobDataSchema, type ScanQueueJobData } from "./scanJob.js";
import { ioredisClient } from "./redis.js";

export const scanQueueName = "scanQueue";
export const scanQueue = new Queue<ScanQueueJobData>(scanQueueName, {
	connection: ioredisClient
});

export const enqueueScanJob = z
	.function()
	.args(z.string().uuid(), scanQueueJobDataSchema)
	.returns(z.promise(z.void()))
	.implement(async (scanId, jobData) => {
		const payload = scanQueueJobDataSchema.parse(jobData);

		await scanQueue.add("scanDomain", payload, {
			jobId: scanId
		});
	});
