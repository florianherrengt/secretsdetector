import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import { dispatchScans } from './dispatchScans.js';
import { ioredisClient } from '../scan/redis.js';

export const schedulerQueueName = 'schedulerQueue';

export const registerHourlyScheduler = z
	.function()
	.args()
	.returns(z.promise(z.void()))
	.implement(async () => {
		const schedulerQueue = new Queue(schedulerQueueName, {
			connection: ioredisClient,
		});

		await schedulerQueue.upsertJobScheduler('hourly-scan-dispatch', {
			pattern: '0 * * * *',
		});

		console.log('[scheduler] Registered hourly job scheduler');
	});

const schedulerWorkerRef: { current: Worker | null } = { current: null };

export const startSchedulerWorker = z
	.function()
	.args()
	.returns(z.custom<Worker>())
	.implement(() => {
		if (schedulerWorkerRef.current) {
			return schedulerWorkerRef.current;
		}

		schedulerWorkerRef.current = new Worker(
			schedulerQueueName,
			z
				.function()
				.args()
				.returns(z.promise(z.void()))
				.implement(async () => {
					await dispatchScans();
				}),
			{ connection: ioredisClient },
		);

		// Make worker-level failures observable and prevent unhandled-emitter
		// crashes. dispatchScans already catches per-domain errors; these
		// handlers cover worker/Redis-level failures.
		schedulerWorkerRef.current.on('error', (error) => {
			console.error('[scheduler] Worker error', { error: error.message });
		});
		schedulerWorkerRef.current.on('failed', (job, error) => {
			console.error('[scheduler] Job failed', { jobId: job?.id, error: error.message });
		});

		console.log(`[scheduler] Worker listening on queue ${schedulerQueueName}`);

		return schedulerWorkerRef.current;
	});
