import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { domains, scans } from '../db/schema.js';
import { buildScanResultHash, createPendingScanRecord, persistScanOutcome } from './scanJob.js';

const describeIfDb = process.env.RUN_DB_INTEGRATION_TESTS === '1' ? describe : describe.skip;

describeIfDb('persistScanOutcome DB integration', () => {
	let domainId = ''; // eslint-disable-line custom/no-mutable-variables
	let scanId = ''; // eslint-disable-line custom/no-mutable-variables

	beforeEach(async () => {
		domainId = randomUUID();
		scanId = randomUUID();

		await db.insert(domains).values({
			id: domainId,
			hostname: `${scanId}.example.com`,
			createdAt: new Date(),
		});

		await db.insert(scans).values({
			id: scanId,
			domainId,
			status: 'pending',
			startedAt: new Date(),
			finishedAt: null,
			discoveryMetadata: null,
		});
	});

	it('persists discovery_metadata payload to scans row', async () => {
		const result = await persistScanOutcome({
			scanId,
			pipelineResult: {
				status: 'success',
				checks: [],
				findings: [],
				discoveredSubdomains: ['a.example.com', 'b.example.com'],
				subdomainAssetCoverage: [
					{ subdomain: 'a.example.com', scannedAssetPaths: ['assets/a.js'] },
					{ subdomain: 'b.example.com', scannedAssetPaths: ['assets/b.js'] },
				],
				discoveryStats: {
					fromLinks: 2,
					fromSitemap: 1,
					totalConsidered: 9,
					totalAccepted: 2,
					truncated: false,
				},
			},
		});

		expect(result.discoveredSubdomains).toEqual(['a.example.com', 'b.example.com']);

		const rows = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.resultHash).toBe(buildScanResultHash('success', []));
		expect(rows[0]?.discoveryMetadata).toEqual({
			discoveredSubdomains: ['a.example.com', 'b.example.com'],
			stats: {
				fromLinks: 2,
				fromSitemap: 1,
				totalConsidered: 9,
				totalAccepted: 2,
				truncated: false,
			},
			subdomainAssetCoverage: [
				{ subdomain: 'a.example.com', scannedAssetPaths: ['assets/a.js'] },
				{ subdomain: 'b.example.com', scannedAssetPaths: ['assets/b.js'] },
			],
		});
	});

	it('keeps one scan row per domain and preserves the previous hash while pending', async () => {
		const firstScan = await createPendingScanRecord(domainId);
		await persistScanOutcome({
			scanId: firstScan.id,
			pipelineResult: {
				status: 'success',
				checks: [],
				findings: [],
				discoveredSubdomains: [],
				subdomainAssetCoverage: [],
				discoveryStats: {
					fromLinks: 0,
					fromSitemap: 0,
					totalConsidered: 0,
					totalAccepted: 0,
					truncated: false,
				},
			},
		});

		const secondScan = await createPendingScanRecord(domainId);

		const rows = await db.select().from(scans).where(eq(scans.domainId, domainId));
		expect(rows).toHaveLength(1);
		expect(secondScan.id).toBe(firstScan.id);
		expect(rows[0]?.status).toBe('pending');
		expect(rows[0]?.resultHash).toBe(buildScanResultHash('success', []));
	});
});
