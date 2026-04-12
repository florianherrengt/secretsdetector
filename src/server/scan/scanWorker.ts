import { Job, Worker } from "bullmq";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { scanDomain } from "../../pipeline/scanDomain.js";
import { scanStatusSchema } from "../../schemas/scan.js";
import { db } from "../db/client.js";
import { scans } from "../db/schema.js";
import {
	getDomainById,
	markScanAsFailed,
	persistScanOutcome,
	scanQueueJobDataSchema,
	type ScanQueueJobData
} from "./scanJob.js";
import { scanQueueName } from "./scanQueue.js";
import { ioredisClient } from "./redis.js";

const scanWorkerResultSchema = z.object({
	scanId: z.string().uuid(),
	status: scanStatusSchema,
	findingsCount: z.number().int().nonnegative(),
	insertedFindingsCount: z.number().int().nonnegative()
});

type ScanWorkerResult = z.infer<typeof scanWorkerResultSchema>;

const getScanRecordById = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.object({
		id: z.string().uuid(),
		domainId: z.string().uuid(),
		status: scanStatusSchema,
		startedAt: z.date(),
		finishedAt: z.date().nullable()
	}).nullable()))
	.implement(async (scanId) => {
		const rows = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);

		if (!rows[0]) {
			return null;
		}

		return rows[0];
	});

const processScanQueueJob = z
	.function()
	.args(z.custom<Job<ScanQueueJobData>>())
	.returns(z.promise(scanWorkerResultSchema))
	.implement(async (job) => {
		const parsedPayload = scanQueueJobDataSchema.safeParse(job.data);

		if (!parsedPayload.success) {
			console.error("[scan-worker] Invalid job payload", {
				jobId: job.id,
				error: parsedPayload.error.message
			});
			throw new Error("Invalid scan queue payload");
		}

		const { domainId } = parsedPayload.data;
		const domainRecord = await getDomainById(domainId);

		if (!domainRecord) {
			console.warn("[scan-worker] Domain not found, failing scan", {
				jobId: job.id,
				domainId
			});

			const scanRecord = await getScanRecordById(job.id ?? "");
			if (scanRecord) {
				await markScanAsFailed(scanRecord.id);
			}

			return scanWorkerResultSchema.parse({
				scanId: scanRecord?.id ?? "",
				status: "failed",
				findingsCount: 0,
				insertedFindingsCount: 0
			});
		}

		const domain = domainRecord.hostname;

		console.log("[scan-worker] Job started", {
			jobId: job.id,
			domainId,
			domain
		});

		const scanRecord = await getScanRecordById(job.id ?? "");

		if (!scanRecord) {
			console.error("[scan-worker] Scan record not found", {
				jobId: job.id,
				domainId
			});
			throw new Error(`Scan record not found for job ${job.id}`);
		}

		try {
			const pipelineResult = await scanDomain({ domain });
			const persistedResult = await persistScanOutcome({
				scanId: scanRecord.id,
				pipelineResult
			});

			console.log("[scan-worker] Job findings", {
				jobId: job.id,
				domain,
				scanId: scanRecord.id,
				findingsCount: persistedResult.findingsCount
			});

			if (persistedResult.status === "failed") {
				const failure = new Error(`Scan failed for domain ${domain}`);
				console.error("[scan-worker] Scan pipeline reported failed status", {
					jobId: job.id,
					domain,
					scanId: scanRecord.id,
					error: failure.message
				});
				throw failure;
			}

			return scanWorkerResultSchema.parse(persistedResult);
		} catch (error) {
			await markScanAsFailed(scanRecord.id);
			const normalizedError = error instanceof Error ? error : new Error("Unknown scan worker error");

			console.error("[scan-worker] Job failed", {
				jobId: job.id,
				domain,
				scanId: scanRecord.id,
				error: normalizedError.message
			});

			throw normalizedError;
		}
	});

let scanWorker: Worker<ScanQueueJobData, ScanWorkerResult> | null = null; // eslint-disable-line custom/no-mutable-variables

export const startScanWorker = z
	.function()
	.args()
	.returns(z.custom<Worker<ScanQueueJobData, ScanWorkerResult>>())
	.implement(() => {
		if (scanWorker) {
			return scanWorker;
		}

		scanWorker = new Worker<ScanQueueJobData, ScanWorkerResult>(scanQueueName, processScanQueueJob, {
			connection: ioredisClient
		});

		console.log(`[scan-worker] Listening on queue ${scanQueueName}`);

		return scanWorker;
	});
