import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { render } from "../../../lib/response.js";
import { scanDomain } from "../../../pipeline/scanDomain.js";
import { domainSchema } from "../../../schemas/domain.js";
import { scanSchema } from "../../../schemas/scan.js";
import {
	DedupeInputPage,
	DedupeResultPage,
	dedupeInputPagePropsSchema,
	dedupeResultPagePropsSchema
} from "../../../views/pages/dedupe.js";
import { domains, findings, scans } from "../../db/schema.js";

const dedupeRoutes = new Hono();

const DATABASE_URL_FALLBACK =
	"postgresql://secret_detector:secret_detector@localhost:5432/secret_detector";
const databaseUrlSchema = z.string().min(1);
const db = drizzle(
	new Pool({
		connectionString: databaseUrlSchema.parse(process.env.DATABASE_URL ?? DATABASE_URL_FALLBACK)
	})
);

const dedupeFormSchema = z.object({
	domain: z.string().min(1)
});

const normalizeSubmittedDomain = z
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

const dedupeFindingsWithinScan = z
	.function()
	.args(
		z.array(
			z.object({
				type: z.literal("secret"),
				file: z.string(),
				snippet: z.string(),
				fingerprint: z.string()
			})
		)
	)
	.returns(
		z.array(
			z.object({
				type: z.literal("secret"),
				file: z.string(),
				snippet: z.string(),
				fingerprint: z.string()
			})
		)
	)
	.implement((rawFindings) => {
		const seenFingerprints = new Set<string>();
		const dedupedFindings: typeof rawFindings = [];

		for (const finding of rawFindings) {
			if (seenFingerprints.has(finding.fingerprint)) {
				continue;
			}

			seenFingerprints.add(finding.fingerprint);
			dedupedFindings.push(finding);
		}

		return dedupedFindings;
	});

dedupeRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const viewProps = dedupeInputPagePropsSchema.parse({});
			return c.html(render(DedupeInputPage, viewProps));
		})
);

dedupeRoutes.post(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const body = await c.req.parseBody();
			const parsedForm = dedupeFormSchema.safeParse({
				domain: typeof body.domain === "string" ? body.domain : ""
			});

			if (!parsedForm.success) {
				const viewProps = dedupeInputPagePropsSchema.parse({
					errorMessage: "Invalid domain input.",
					defaultDomain: typeof body.domain === "string" ? body.domain : ""
				});

				return c.html(render(DedupeInputPage, viewProps), 400);
			}

			const normalizedDomain = normalizeSubmittedDomain(parsedForm.data.domain);
			const now = new Date();

			const existingDomains = await db
				.select()
				.from(domains)
				.where(eq(domains.hostname, normalizedDomain))
				.limit(1);
			const existingDomain = existingDomains[0] ? domainSchema.parse(existingDomains[0]) : null;

			const domainRecord =
				existingDomain ??
				(
					domainSchema.parse(
						(
							await db
								.insert(domains)
								.values({
									id: randomUUID(),
									hostname: normalizedDomain,
									createdAt: now
								})
								.returning()
						)[0]
					)
				);

			const scanRecord = scanSchema.parse(
				(
					await db
						.insert(scans)
						.values({
							id: randomUUID(),
							domainId: domainRecord.id,
							status: "pending",
							startedAt: now,
							finishedAt: null
						})
						.returning()
				)[0]
			);

			const pipelineResult = await scanDomain({ domain: normalizedDomain });
			const finishedAt = new Date();
			const dedupedFindings = dedupeFindingsWithinScan(pipelineResult.findings);
			const dedupedFingerprints = dedupedFindings.map((finding) => finding.fingerprint);
			const existingFingerprintRows =
				dedupedFingerprints.length > 0
					? await db
							.select({ fingerprint: findings.fingerprint })
							.from(findings)
							.where(inArray(findings.fingerprint, dedupedFingerprints))
					: [];
			const existingFingerprints = new Set(
				existingFingerprintRows.map((row) => row.fingerprint)
			);
			const newFindings = dedupedFindings.filter(
				(finding) => !existingFingerprints.has(finding.fingerprint)
			);

			await db
				.update(scans)
				.set({
					status: pipelineResult.status,
					finishedAt
				})
				.where(eq(scans.id, scanRecord.id));

			if (newFindings.length > 0) {
				await db.insert(findings).values(
					newFindings.map((finding) => {
						return {
							id: randomUUID(),
							scanId: scanRecord.id,
							type: finding.type,
							file: finding.file,
							snippet: finding.snippet,
							fingerprint: finding.fingerprint,
							createdAt: finishedAt
						};
					})
				);
			}

			const viewProps = dedupeResultPagePropsSchema.parse({
				domain: normalizedDomain,
				rawFindingsCount: pipelineResult.findings.length,
				afterInternalDedupeCount: dedupedFindings.length,
				newFindingsInsertedCount: newFindings.length,
				skippedExistingCount: dedupedFindings.length - newFindings.length
			});

			return c.html(render(DedupeResultPage, viewProps));
		})
);

export default dedupeRoutes;
