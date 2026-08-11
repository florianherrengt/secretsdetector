import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ScanDomainOutput } from '../../pipeline/scanDomain.js';
import { assetCacheSchema } from '../../schemas/assetCache.js';
import { domainSchema } from '../../schemas/domain.js';
import { scanSchema, scanStatusSchema } from '../../schemas/scan.js';
import { db } from '../db/client.js';
import { assetSnapshots, domains, findings, scans } from '../db/schema.js';

export const scanQueueJobDataSchema = z.object({
	domainId: z.string().uuid(),
	scanId: z.string().uuid().nullable().optional(),
});

export type ScanQueueJobData = z.infer<typeof scanQueueJobDataSchema>;

export const normalizeSubmittedDomain = z
	.function()
	.args(z.string())
	.returns(z.string().min(1))
	.implement((rawDomain) => {
		const trimmed = rawDomain.trim();

		if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
			const parsedUrl = (() => {
				try {
					return new URL(trimmed);
				} catch {
					return null;
				}
			})();

			if (!parsedUrl) {
				return trimmed.replace(/^https?:\/\//i, '');
			}

			const normalizedPath = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
			return `${parsedUrl.host}${normalizedPath}${parsedUrl.search}`;
		}

		return trimmed;
	});

const scanFindingSchema = z.object({
	checkId: z.string().min(1),
	type: z.literal('secret'),
	file: z.string(),
	snippet: z.string(),
	fingerprint: z.string(),
});

export const dedupeFindingsWithinScan = z
	.function()
	.args(z.array(scanFindingSchema))
	.returns(z.array(scanFindingSchema))
	.implement((rawFindings) => {
		const seenFindingKeys = new Set<string>();
		const dedupedFindings: typeof rawFindings = [];

		for (const finding of rawFindings) {
			const findingKey = `${finding.checkId}:${finding.fingerprint}`;

			if (seenFindingKeys.has(findingKey)) {
				continue;
			}

			seenFindingKeys.add(findingKey);
			dedupedFindings.push(finding);
		}

		return dedupedFindings;
	});

const buildFindingResultRows = z
	.function()
	.args(z.array(scanFindingSchema))
	.returns(z.array(scanFindingSchema))
	.implement((findingRows) => {
		return findingRows
			.map((finding) => ({
				checkId: finding.checkId,
				type: finding.type,
				file: finding.file,
				snippet: finding.snippet,
				fingerprint: finding.fingerprint,
			}))
			.sort((left, right) => {
				return JSON.stringify(left).localeCompare(JSON.stringify(right));
			});
	});

export const buildScanResultHash = z
	.function()
	.args(scanStatusSchema, z.array(scanFindingSchema))
	.returns(z.string())
	.implement((status, findingRows) => {
		const hashInput = JSON.stringify({
			version: 1,
			status,
			findings: buildFindingResultRows(dedupeFindingsWithinScan(findingRows)),
		});

		return createHash('sha256').update(hashInput).digest('hex');
	});

export const upsertDomainRecord = z
	.function()
	.args(z.string().min(1))
	.returns(z.promise(domainSchema))
	.implement(async (hostname) => {
		const insertResult = await db
			.insert(domains)
			.values({
				id: randomUUID(),
				hostname,
				createdAt: new Date(),
			})
			.onConflictDoNothing({ target: domains.hostname })
			.returning();

		if (insertResult[0]) {
			return domainSchema.parse(insertResult[0]);
		}

		const existingDomainRows = await db
			.select()
			.from(domains)
			.where(eq(domains.hostname, hostname))
			.limit(1);

		return domainSchema.parse(existingDomainRows[0]);
	});

export const createPendingScanRecord = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(scanSchema))
	.implement(async (domainId) => {
		const now = new Date();

		return scanSchema.parse(
			(
				await db
					.insert(scans)
					.values({
						id: randomUUID(),
						domainId,
						status: 'pending',
						startedAt: now,
						finishedAt: null,
						resultHash: null,
					})
					.onConflictDoUpdate({
						target: scans.domainId,
						set: {
							status: 'pending',
							startedAt: now,
							finishedAt: null,
						},
					})
					.returning()
			)[0],
		);
	});

export const scanPersistenceResultSchema = z.object({
	scanId: z.string().uuid(),
	status: scanStatusSchema,
	findingsCount: z.number().int().nonnegative(),
	findingsChanged: z.boolean(),
	discoveredSubdomains: z.array(z.string()),
	discoveryStats: z.object({
		fromLinks: z.number().int().nonnegative(),
		fromSitemap: z.number().int().nonnegative(),
		totalConsidered: z.number().int().nonnegative(),
		totalAccepted: z.number().int().nonnegative(),
		truncated: z.boolean(),
	}),
	subdomainAssetCoverage: z.array(
		z.object({
			subdomain: z.string(),
			scannedAssetPaths: z.array(z.string()),
		}),
	),
});

export type ScanPersistenceResult = z.infer<typeof scanPersistenceResultSchema>;

const buildDiscoveryMetadata = z
	.function()
	.args(ScanDomainOutput)
	.returns(
		z.object({
			discoveredSubdomains: z.array(z.string()),
			stats: scanPersistenceResultSchema.shape.discoveryStats,
			subdomainAssetCoverage: scanPersistenceResultSchema.shape.subdomainAssetCoverage,
		}),
	)
	.implement((pipelineResult) => {
		return {
			discoveredSubdomains: pipelineResult.discoveredSubdomains,
			stats: pipelineResult.discoveryStats,
			subdomainAssetCoverage: pipelineResult.subdomainAssetCoverage,
		};
	});

export const persistScanOutcome = z
	.function()
	.args(
		z.object({
			scanId: z.string().uuid(),
			pipelineResult: ScanDomainOutput,
		}),
	)
	.returns(z.promise(scanPersistenceResultSchema))
	.implement(async ({ scanId, pipelineResult }) => {
		const finishedAt = new Date();
		const dedupedFindings = dedupeFindingsWithinScan(pipelineResult.findings);
		const resultHash = buildScanResultHash(pipelineResult.status, dedupedFindings);

		const findingsChanged = await db.transaction(async (tx) => {
			const [currentScan] = await tx
				.select({ resultHash: scans.resultHash })
				.from(scans)
				.where(eq(scans.id, scanId))
				.for('update');

			if (!currentScan) {
				throw new Error(`Scan ${scanId} does not exist`);
			}

			const shouldReplaceFindings = currentScan.resultHash !== resultHash;

			if (shouldReplaceFindings) {
				await tx.delete(findings).where(eq(findings.scanId, scanId));

				if (dedupedFindings.length > 0) {
					await tx.insert(findings).values(
						dedupedFindings.map((finding) => {
							return {
								id: randomUUID(),
								scanId,
								checkId: finding.checkId,
								type: finding.type,
								file: finding.file,
								snippet: finding.snippet,
								fingerprint: finding.fingerprint,
								createdAt: finishedAt,
							};
						}),
					);
				}
			}

			await tx
				.update(scans)
				.set({
					status: pipelineResult.status,
					finishedAt,
					resultHash,
					discoveryMetadata: buildDiscoveryMetadata(pipelineResult),
				})
				.where(eq(scans.id, scanId));

			return shouldReplaceFindings;
		});

		return scanPersistenceResultSchema.parse({
			scanId,
			status: pipelineResult.status,
			findingsCount: dedupedFindings.length,
			findingsChanged,
			discoveredSubdomains: pipelineResult.discoveredSubdomains,
			discoveryStats: pipelineResult.discoveryStats,
			subdomainAssetCoverage: pipelineResult.subdomainAssetCoverage,
		});
	});

export const markScanAsFailed = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.void()))
	.implement(async (scanId) => {
		await db.transaction(async (tx) => {
			const failedHash = buildScanResultHash('failed', []);
			const [currentScan] = await tx
				.select({ resultHash: scans.resultHash })
				.from(scans)
				.where(eq(scans.id, scanId))
				.for('update');

			if (!currentScan) {
				throw new Error(`Scan ${scanId} does not exist`);
			}

			if (currentScan.resultHash !== failedHash) {
				await tx.delete(findings).where(eq(findings.scanId, scanId));
			}

			await tx
				.update(scans)
				.set({
					status: 'failed',
					finishedAt: new Date(),
					resultHash: failedHash,
				})
				.where(eq(scans.id, scanId));
		});
	});

export const getDomainById = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(domainSchema.nullable()))
	.implement(async (domainId) => {
		const rows = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);

		if (!rows[0]) {
			return null;
		}

		return domainSchema.parse(rows[0]);
	});

export const getAssetSnapshot = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(assetCacheSchema.nullable()))
	.implement(async (domainId) => {
		const rows = await db
			.select({ cache: assetSnapshots.cache })
			.from(assetSnapshots)
			.where(eq(assetSnapshots.domainId, domainId))
			.limit(1);

		if (!rows[0]) {
			return null;
		}

		return assetCacheSchema.parse(rows[0].cache);
	});

export const upsertAssetSnapshot = z
	.function()
	.args(z.string().uuid(), assetCacheSchema)
	.returns(z.promise(z.void()))
	.implement(async (domainId, cache) => {
		const now = new Date();

		await db
			.insert(assetSnapshots)
			.values({
				id: randomUUID(),
				domainId,
				cache,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: assetSnapshots.domainId,
				set: {
					cache,
					updatedAt: now,
				},
			});
	});

export const bumpScanTimestamp = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.void()))
	.implement(async (scanId) => {
		const now = new Date();

		// On a cache hit we don't touch status, resultHash, findings, or
		// discovery_metadata — only the timestamps, so "last checked"
		// reflects when the probe ran.
		await db
			.update(scans)
			.set({
				startedAt: now,
				finishedAt: now,
			})
			.where(eq(scans.id, scanId));
	});

export const getScanFindingsCount = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.number().int().nonnegative()))
	.implement(async (scanId) => {
		const rows = await db
			.select({ id: findings.id })
			.from(findings)
			.where(eq(findings.scanId, scanId));

		return rows.length;
	});

export const createScanResultSchema = z.object({
	scanId: z.string().uuid(),
});

export const enqueueBackgroundScanResultSchema = z.object({
	jobId: z.string().uuid(),
});

export const createScanForDomainId = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(createScanResultSchema))
	.implement(async (domainId) => {
		const scanRecord = await createPendingScanRecord(domainId);
		const jobPayload = scanQueueJobDataSchema.parse({ domainId, scanId: scanRecord.id });

		const { enqueueScanJob } = await import('./scanQueue.js');

		try {
			await enqueueScanJob(randomUUID(), jobPayload);
		} catch (error) {
			await markScanAsFailed(scanRecord.id);
			const normalizedError = error instanceof Error ? error : new Error('Unknown enqueue error');

			console.error('[create-scan] Failed to enqueue scan job', {
				scanId: scanRecord.id,
				domainId,
				error: normalizedError.message,
			});

			// Re-throw so the caller knows submission failed instead of silently
			// returning a scanId that points at a failed scan. The scan row has
			// already been marked failed; the route surfaces a real error page.
			throw normalizedError;
		}

		return createScanResultSchema.parse({ scanId: scanRecord.id });
	});

export const enqueueBackgroundScanForDomainId = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(enqueueBackgroundScanResultSchema))
	.implement(async (domainId) => {
		const jobId = randomUUID();
		const jobPayload = scanQueueJobDataSchema.parse({ domainId, scanId: null });

		const { enqueueScanJob } = await import('./scanQueue.js');

		await enqueueScanJob(jobId, jobPayload);

		return enqueueBackgroundScanResultSchema.parse({ jobId });
	});
