import { Job, Worker } from 'bullmq';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { scanDomain } from '../../pipeline/scanDomain.js';
import { scanStatusSchema } from '../../schemas/scan.js';
import { db } from '../db/client.js';
import { scans } from '../db/schema.js';
import {
	bumpScanTimestamp,
	createPendingScanRecord,
	getAssetSnapshot,
	getDomainById,
	getScanFindingsCount,
	markScanAsFailed,
	persistScanOutcome,
	scanQueueJobDataSchema,
	upsertAssetSnapshot,
	type ScanQueueJobData,
} from './scanJob.js';
import { scanQueueName } from './scanQueue.js';
import { ioredisClient } from './redis.js';

const scanWorkerResultSchema = z.object({
	scanId: z.string().uuid(),
	status: scanStatusSchema,
	findingsCount: z.number().int().nonnegative(),
	findingsChanged: z.boolean(),
});

type ScanWorkerResult = z.infer<typeof scanWorkerResultSchema>;

const getScanRecordById = z
	.function()
	.args(z.string().uuid())
	.returns(
		z.promise(
			z
				.object({
					id: z.string().uuid(),
					domainId: z.string().uuid(),
					status: scanStatusSchema,
					startedAt: z.date(),
					finishedAt: z.date().nullable(),
				})
				.nullable(),
		),
	)
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
			console.error('[scan-worker] Invalid job payload', {
				jobId: job.id,
				error: parsedPayload.error.message,
			});
			throw new Error('Invalid scan queue payload');
		}

		const { domainId } = parsedPayload.data;
		const requestedScanId =
			parsedPayload.data.scanId === null ? null : (parsedPayload.data.scanId ?? job.id ?? null);
		const domainRecord = await getDomainById(domainId);

		if (!domainRecord) {
			console.warn('[scan-worker] Domain not found, failing scan', {
				jobId: job.id,
				domainId,
			});

			if (requestedScanId !== null) {
				const scanRecord = await getScanRecordById(requestedScanId);
				if (scanRecord) {
					await markScanAsFailed(scanRecord.id);

					return scanWorkerResultSchema.parse({
						scanId: scanRecord.id,
						status: 'failed',
						findingsCount: 0,
						findingsChanged: false,
					});
				}
			}

			throw new Error(`Domain not found for job ${job.id ?? 'unknown'}`);
		}

		const domain = domainRecord.hostname;

		console.log('[scan-worker] Job started', {
			jobId: job.id,
			domainId,
			domain,
		});

		const scanRecord =
			requestedScanId === null
				? await createPendingScanRecord(domainId)
				: await getScanRecordById(requestedScanId);

		if (!scanRecord) {
			console.error('[scan-worker] Scan record not found', {
				jobId: job.id,
				domainId,
				scanId: requestedScanId,
			});
			throw new Error(`Scan record not found for job ${job.id}`);
		}

		try {
			const previousCache = await getAssetSnapshot(domainId);
			const pipelineResult = await scanDomain({
				domain,
				previousCache: previousCache ?? undefined,
			});

			// Cache hit: every probed URL returned 304. Don't call
			// persistScanOutcome — the existing findings stay in the DB
			// untouched. Just bump the scan timestamps so "last checked"
			// reflects this run, and refresh the stored cache headers
			// (ETags can rotate even when content hasn't changed).
			if (pipelineResult.assetsUnchanged && pipelineResult.assetCache) {
				await bumpScanTimestamp(scanRecord.id);
				await upsertAssetSnapshot(domainId, pipelineResult.assetCache);
				const findingsCount = await getScanFindingsCount(scanRecord.id);

				console.log('[scan-worker] Assets unchanged, skipped full scan', {
					jobId: job.id,
					domain,
					scanId: scanRecord.id,
					findingsCount,
				});

				return scanWorkerResultSchema.parse({
					scanId: scanRecord.id,
					status: 'success',
					findingsCount,
					findingsChanged: false,
				});
			}

			const persistedResult = await persistScanOutcome({
				scanId: scanRecord.id,
				pipelineResult,
			});

			// Only persist the snapshot on success. A failed scan must never
			// populate the cache — otherwise the failure would suppress the
			// next retry's full scan.
			if (pipelineResult.assetCache && pipelineResult.status === 'success') {
				await upsertAssetSnapshot(domainId, pipelineResult.assetCache);
			}

			console.log('[scan-worker] Job findings', {
				jobId: job.id,
				domain,
				scanId: persistedResult.scanId,
				findingsCount: persistedResult.findingsCount,
			});

			if (persistedResult.status === 'failed') {
				console.warn('[scan-worker] Scan pipeline reported failed status', {
					jobId: job.id,
					domain,
					scanId: persistedResult.scanId,
					error: `Scan failed for domain ${domain}`,
				});

				// Throw so BullMQ records this job as failed (not completed). The
				// scan outcome has already been handled by the persistence layer;
				// throwing here keeps the job outcome
				// consistent with the scan outcome and makes the failure visible
				// to any retry/monitoring configured on the queue.
				throw new Error(`Scan failed for domain ${domain}`);
			}

			return scanWorkerResultSchema.parse(persistedResult);
		} catch (error) {
			await markScanAsFailed(scanRecord.id);
			const normalizedError =
				error instanceof Error ? error : new Error('Unknown scan worker error');

			console.error('[scan-worker] Job failed', {
				jobId: job.id,
				domain,
				scanId: scanRecord.id,
				error: normalizedError.message,
			});

			throw normalizedError;
		}
	});

const scanWorkerRef: { current: Worker<ScanQueueJobData, ScanWorkerResult> | null } = {
	current: null,
};

export const startScanWorker = z
	.function()
	.args()
	.returns(z.custom<Worker<ScanQueueJobData, ScanWorkerResult>>())
	.implement(() => {
		if (scanWorkerRef.current) {
			return scanWorkerRef.current;
		}

		scanWorkerRef.current = new Worker<ScanQueueJobData, ScanWorkerResult>(
			scanQueueName,
			processScanQueueJob,
			{
				connection: ioredisClient,
			},
		);

		// BullMQ emits 'error' for internal worker failures (e.g. Redis issues)
		// and 'failed' when a job throws. Without listeners these go unhandled.
		// The job-level catch in processScanQueueJob already persists a failed
		// scan; these handlers make worker-level failures observable instead of
		// silently dropped, and prevent unhandled-emitter crashes.
		scanWorkerRef.current.on('error', (error) => {
			console.error('[scan-worker] Worker error', { error: error.message });
		});
		scanWorkerRef.current.on('failed', (job, error) => {
			console.error('[scan-worker] Job failed', {
				jobId: job?.id,
				error: error.message,
			});
		});

		console.log(`[scan-worker] Listening on queue ${scanQueueName}`);

		return scanWorkerRef.current;
	});
