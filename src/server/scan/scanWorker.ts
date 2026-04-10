import { Job, Worker } from "bullmq";
import { z } from "zod";
import { scanDomain } from "../../pipeline/scanDomain.js";
import { scanStatusSchema } from "../../schemas/scan.js";
import {
	markScanAsFailed,
	persistScanOutcome,
	resolveScanRecordForJob,
	scanQueueJobDataSchema,
	upsertDomainRecord,
	type ScanQueueJobData
} from "./scanJob.js";
import { redisConnection, scanQueueName } from "./scanQueue.js";

const scanWorkerResultSchema = z.object({
	scanId: z.string().uuid(),
	status: scanStatusSchema,
	findingsCount: z.number().int().nonnegative(),
	insertedFindingsCount: z.number().int().nonnegative()
});

type ScanWorkerResult = z.infer<typeof scanWorkerResultSchema>;

const parseScanIdFromJobId = z
	.function()
	.args(z.union([z.string(), z.undefined()]))
	.returns(z.string().uuid().nullable())
	.implement((jobId) => {
		if (!jobId) {
			return null;
		}

		const parsedScanId = z.string().uuid().safeParse(jobId);

		if (!parsedScanId.success) {
			return null;
		}

		return parsedScanId.data;
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

		const domain = parsedPayload.data.domain;
		const scanIdFromJob = parseScanIdFromJobId(job.id);

		console.log("[scan-worker] Job started", {
			jobId: job.id,
			domain
		});
		console.log("[scan-worker] Qualification result", {
			jobId: job.id,
			result: "not-used"
		});

		const domainRecord = await upsertDomainRecord(domain);
		const scanRecord = await resolveScanRecordForJob({
			domainId: domainRecord.id,
			scanId: scanIdFromJob
		});

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
			connection: redisConnection
		});

		console.log(`[scan-worker] Listening on queue ${scanQueueName}`);

		return scanWorker;
	});
