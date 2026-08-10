import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../scan/scanJob.js', () => ({
	enqueueBackgroundScanForDomainId: vi.fn(),
	scanQueueJobDataSchema: z.object({ domainId: z.string().uuid() }),
}));

vi.mock('../db/client.js', () => ({
	db: {
		select: vi.fn(),
	},
}));

import { enqueueBackgroundScanForDomainId } from '../scan/scanJob.js';
import { dispatchScans } from './dispatchScans.js';
import { db } from '../db/client.js';

const defaultMocks = z
	.function()
	.args()
	.returns(z.void())
	.implement(() => {
		vi.mocked(enqueueBackgroundScanForDomainId).mockResolvedValue({
			jobId: '10000000-0000-4000-8000-000000000001',
		});
	});

describe('dispatchScans', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		defaultMocks();
	});

	it('calls createScanForDomainId zero times when there are no domains', async () => {
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue([]),
			}),
		});

		await dispatchScans();

		expect(enqueueBackgroundScanForDomainId).not.toHaveBeenCalled();
	});

	it('calls enqueueBackgroundScanForDomainId exactly once per domain', async () => {
		const domainIds = [
			{ id: '00000000-0000-4000-8000-aaaaaaaaaaaa' },
			{ id: '00000000-0000-4000-8000-bbbbbbbbbbbb' },
			{ id: '00000000-0000-4000-8000-cccccccccccc' },
		];
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(domainIds),
			}),
		});

		await dispatchScans();

		expect(enqueueBackgroundScanForDomainId).toHaveBeenCalledTimes(3);
		expect(enqueueBackgroundScanForDomainId).toHaveBeenCalledWith(
			'00000000-0000-4000-8000-aaaaaaaaaaaa',
		);
		expect(enqueueBackgroundScanForDomainId).toHaveBeenCalledWith(
			'00000000-0000-4000-8000-bbbbbbbbbbbb',
		);
		expect(enqueueBackgroundScanForDomainId).toHaveBeenCalledWith(
			'00000000-0000-4000-8000-cccccccccccc',
		);
	});

	it('continues dispatching remaining domains when one fails', async () => {
		const domainIds = [
			{ id: '00000000-0000-4000-8000-aaaaaaaaaaaa' },
			{ id: '00000000-0000-4000-8000-bbbbbbbbbbbb' },
		];
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(domainIds),
			}),
		});
		vi.mocked(enqueueBackgroundScanForDomainId)
			.mockRejectedValueOnce(new Error('DB error'))
			.mockResolvedValueOnce({ jobId: '10000000-0000-4000-8000-000000000001' });

		await dispatchScans();

		expect(enqueueBackgroundScanForDomainId).toHaveBeenCalledTimes(2);
	});
});
