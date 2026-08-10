import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const selectResults: unknown[][] = [];
	const nextSelectResult = () => Promise.resolve(selectResults.shift() ?? []);
	const createExecutableSelect = () => ({
		limit: vi.fn(() => nextSelectResult()),
		orderBy: vi.fn(() => ({ limit: vi.fn(() => nextSelectResult()) })),
		for: vi.fn(() => nextSelectResult()),
		then: (
			onFulfilled?: ((value: unknown[]) => unknown) | null,
			onRejected?: ((reason: unknown) => unknown) | null,
		) => nextSelectResult().then(onFulfilled, onRejected),
	});
	const selectWhereMock = vi.fn(() => createExecutableSelect());
	const selectFromMock = vi.fn(() => ({
		where: selectWhereMock,
		orderBy: vi.fn(() => ({ limit: vi.fn(() => nextSelectResult()) })),
	}));
	const selectMock = vi.fn(() => ({ from: selectFromMock }));

	const updateWhereMock = vi.fn();
	const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	const updateMock = vi.fn(() => ({ set: updateSetMock }));

	const insertValuesMock = vi.fn();
	const insertMock = vi.fn(() => ({ values: insertValuesMock }));

	const deleteWhereMock = vi.fn();
	const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

	const transactionMock = vi.fn(async (callback) =>
		callback({
			select: selectMock,
			delete: deleteMock,
			insert: insertMock,
			update: updateMock,
		}),
	);

	return {
		selectResults,
		selectWhereMock,
		selectFromMock,
		selectMock,
		updateWhereMock,
		updateSetMock,
		updateMock,
		insertValuesMock,
		insertMock,
		deleteWhereMock,
		deleteMock,
		transactionMock,
	};
});

vi.mock('../db/client.js', () => ({
	db: {
		select: mocks.selectMock,
		update: mocks.updateMock,
		insert: mocks.insertMock,
		delete: mocks.deleteMock,
		transaction: mocks.transactionMock,
	},
}));

const {
	selectResults,
	selectMock,
	updateWhereMock,
	updateSetMock,
	updateMock,
	insertValuesMock,
	insertMock,
	deleteWhereMock,
	deleteMock,
	transactionMock,
} = mocks;

import { buildScanResultHash, persistScanOutcome } from './scanJob.js';

const buildPipelineResult = (
	findings: {
		checkId: string;
		type: 'secret';
		file: string;
		snippet: string;
		fingerprint: string;
	}[] = [],
) => ({
	status: 'success' as const,
	checks: [],
	findings,
	discoveredSubdomains: ['a.example.com', 'b.example.com'],
	subdomainAssetCoverage: [
		{ subdomain: 'a.example.com', scannedAssetPaths: ['assets/a.js'] },
		{ subdomain: 'b.example.com', scannedAssetPaths: ['assets/b.js'] },
	],
	discoveryStats: {
		fromLinks: 2,
		fromSitemap: 1,
		totalConsidered: 8,
		totalAccepted: 2,
		truncated: false,
	},
});

describe('persistScanOutcome discovery metadata persistence', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		selectResults.length = 0;
		updateWhereMock.mockResolvedValue([]);
		insertValuesMock.mockResolvedValue([]);
		deleteWhereMock.mockResolvedValue([]);
		transactionMock.mockImplementation(async (callback) =>
			callback({
				select: selectMock,
				delete: deleteMock,
				insert: insertMock,
				update: updateMock,
			}),
		);
		selectResults.push([{ resultHash: null }]);
	});

	it('writes discoveredSubdomains and discoveryStats to scans.discoveryMetadata', async () => {
		const scanId = '11111111-1111-4111-8111-111111111111';
		const pipelineResult = buildPipelineResult();

		const result = await persistScanOutcome({ scanId, pipelineResult });

		expect(transactionMock).toHaveBeenCalledTimes(1);
		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(insertMock).not.toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'success',
				resultHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
				discoveryMetadata: {
					discoveredSubdomains: ['a.example.com', 'b.example.com'],
					stats: {
						fromLinks: 2,
						fromSitemap: 1,
						totalConsidered: 8,
						totalAccepted: 2,
						truncated: false,
					},
					subdomainAssetCoverage: [
						{ subdomain: 'a.example.com', scannedAssetPaths: ['assets/a.js'] },
						{ subdomain: 'b.example.com', scannedAssetPaths: ['assets/b.js'] },
					],
				},
			}),
		);

		expect(result.discoveredSubdomains).toEqual(['a.example.com', 'b.example.com']);
		expect(result.discoveryStats).toEqual({
			fromLinks: 2,
			fromSitemap: 1,
			totalConsidered: 8,
			totalAccepted: 2,
			truncated: false,
		});
		expect(result.subdomainAssetCoverage).toEqual([
			{ subdomain: 'a.example.com', scannedAssetPaths: ['assets/a.js'] },
			{ subdomain: 'b.example.com', scannedAssetPaths: ['assets/b.js'] },
		]);
		expect(result.findingsChanged).toBe(true);
	});

	it('replaces existing findings with the current deduped findings', async () => {
		const scanId = '11111111-1111-4111-8111-111111111111';
		const existingFinding = {
			checkId: 'env-var-key',
			type: 'secret' as const,
			file: 'https://example.com/assets/app.js',
			snippet: 'API_KEY=redacted',
			fingerprint: 'fingerprint-1',
		};
		const newFinding = {
			checkId: 'pem-key',
			type: 'secret' as const,
			file: 'https://example.com/assets/app.js',
			snippet: 'BEGIN PRIVATE KEY redacted',
			fingerprint: 'fingerprint-2',
		};

		const result = await persistScanOutcome({
			scanId,
			pipelineResult: buildPipelineResult([existingFinding, existingFinding, newFinding]),
		});

		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(insertValuesMock).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					checkId: existingFinding.checkId,
					fingerprint: existingFinding.fingerprint,
				}),
				expect.objectContaining({
					checkId: newFinding.checkId,
					fingerprint: newFinding.fingerprint,
				}),
			]),
		);
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				resultHash: buildScanResultHash('success', [existingFinding, newFinding]),
			}),
		);
		expect(result.findingsCount).toBe(2);
		expect(result.findingsChanged).toBe(true);
	});

	it('does not rewrite findings when the scan result hash is unchanged', async () => {
		const scanId = '11111111-1111-4111-8111-111111111111';
		const finding = {
			checkId: 'env-var-key',
			type: 'secret' as const,
			file: 'https://example.com/assets/app.js',
			snippet: 'API_KEY=redacted',
			fingerprint: 'fingerprint-1',
		};
		const pipelineResult = buildPipelineResult([finding]);
		selectResults.length = 0;
		selectResults.push([{ resultHash: buildScanResultHash('success', [finding]) }]);

		const result = await persistScanOutcome({
			scanId,
			pipelineResult,
		});

		expect(deleteMock).not.toHaveBeenCalled();
		expect(insertMock).not.toHaveBeenCalled();
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				resultHash: buildScanResultHash('success', [finding]),
			}),
		);
		expect(result.findingsCount).toBe(1);
		expect(result.findingsChanged).toBe(false);
	});
});
