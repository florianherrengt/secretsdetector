import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { ScanDomainOutput } from "../../pipeline/scanDomain.js";
import { domainSchema } from "../../schemas/domain.js";
import { scanSchema, scanStatusSchema } from "../../schemas/scan.js";
import { db } from "../db/client.js";
import { domains, findings, scans } from "../db/schema.js";

export const scanQueueJobDataSchema = z.object({
	domain: z.string().min(1)
});

export type ScanQueueJobData = z.infer<typeof scanQueueJobDataSchema>;

export const normalizeSubmittedDomain = z
	.function()
	.args(z.string())
	.returns(z.string().min(1))
	.implement((rawDomain) => {
		const trimmed = rawDomain.trim();

		if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
			const parsedUrl = (() => {
				try {
					return new URL(trimmed);
				} catch {
					return null;
				}
			})();

			if (!parsedUrl) {
				return trimmed.replace(/^https?:\/\//i, "");
			}

			const normalizedPath = parsedUrl.pathname === "/" ? "" : parsedUrl.pathname;
			return `${parsedUrl.host}${normalizedPath}${parsedUrl.search}`;
		}

		return trimmed;
	});

const scanFindingSchema = z.object({
	checkId: z.string().min(1),
	type: z.literal("secret"),
	file: z.string(),
	snippet: z.string(),
	fingerprint: z.string()
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
				createdAt: new Date()
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
						status: "pending",
						startedAt: now,
						finishedAt: null
					})
					.returning()
			)[0]
		);
	});

export const getScanRecordById = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(scanSchema.nullable()))
	.implement(async (scanId) => {
		const scanRows = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);

		if (!scanRows[0]) {
			return null;
		}

		return scanSchema.parse(scanRows[0]);
	});

export const findOldestPendingScanRecord = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(scanSchema.nullable()))
	.implement(async (domainId) => {
		const pendingScanRows = await db
			.select()
			.from(scans)
			.where(and(eq(scans.domainId, domainId), eq(scans.status, "pending"), isNull(scans.finishedAt)))
			.orderBy(asc(scans.startedAt))
			.limit(1);

		if (!pendingScanRows[0]) {
			return null;
		}

		return scanSchema.parse(pendingScanRows[0]);
	});

export const resolveScanRecordForJob = z
	.function()
	.args(
		z.object({
			domainId: z.string().uuid(),
			scanId: z.string().uuid().nullable()
		})
	)
	.returns(z.promise(scanSchema))
	.implement(async ({ domainId, scanId }) => {
		if (scanId !== null) {
			const existingScan = await getScanRecordById(scanId);

			if (existingScan) {
				return existingScan;
			}
		}

		const pendingScan = await findOldestPendingScanRecord(domainId);

		if (pendingScan) {
			return pendingScan;
		}

		return createPendingScanRecord(domainId);
	});

const scanPersistenceResultSchema = z.object({
	scanId: z.string().uuid(),
	status: scanStatusSchema,
	findingsCount: z.number().int().nonnegative(),
	insertedFindingsCount: z.number().int().nonnegative()
});

export type ScanPersistenceResult = z.infer<typeof scanPersistenceResultSchema>;

export const persistScanOutcome = z
	.function()
	.args(
		z.object({
			scanId: z.string().uuid(),
			pipelineResult: ScanDomainOutput
		})
	)
	.returns(z.promise(scanPersistenceResultSchema))
	.implement(async ({ scanId, pipelineResult }) => {
		const finishedAt = new Date();
		const dedupedFindings = dedupeFindingsWithinScan(pipelineResult.findings);
		const existingScanFindingRows = await db
			.select({ id: findings.id })
			.from(findings)
			.where(eq(findings.scanId, scanId))
			.limit(1);
		const hasFindingsForScan = existingScanFindingRows.length > 0;
		const newFindings = hasFindingsForScan ? [] : dedupedFindings;

		if (newFindings.length > 0) {
			await db.insert(findings).values(
				newFindings.map((finding) => {
					return {
						id: randomUUID(),
						scanId,
						checkId: finding.checkId,
						type: finding.type,
						file: finding.file,
						snippet: finding.snippet,
						fingerprint: finding.fingerprint,
						createdAt: finishedAt
					};
				})
			);
		}

		await db
			.update(scans)
			.set({
				status: pipelineResult.status,
				finishedAt
			})
			.where(eq(scans.id, scanId));

		return scanPersistenceResultSchema.parse({
			scanId,
			status: pipelineResult.status,
			findingsCount: dedupedFindings.length,
			insertedFindingsCount: newFindings.length
		});
	});

export const markScanAsFailed = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.void()))
	.implement(async (scanId) => {
		await db
			.update(scans)
			.set({
				status: "failed",
				finishedAt: new Date()
			})
			.where(eq(scans.id, scanId));
	});
