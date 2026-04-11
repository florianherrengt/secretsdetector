import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { scanDomain } from "../../../pipeline/scanDomain.js";
import {
	DedupeInputPage,
	DedupeResultPage,
	dedupeInputPagePropsSchema,
	dedupeResultPagePropsSchema
} from "../../../views/pages/dedupe.js";
import { findings, scans } from "../../db/schema.js";
import { db } from "../../db/client.js";
import {
	normalizeSubmittedDomain,
	dedupeFindingsWithinScan,
	upsertDomainRecord,
	createPendingScanRecord
} from "../../scan/scanJob.js";

const dedupeRoutes = new Hono();

const dedupeFormSchema = z.object({
	domain: z.string().min(1)
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
			const domainRecord = await upsertDomainRecord(normalizedDomain);
			const scanRecord = await createPendingScanRecord(domainRecord.id);

			const pipelineResult = await scanDomain({ domain: normalizedDomain });
			const finishedAt = new Date();
			const dedupedFindings = dedupeFindingsWithinScan(pipelineResult.findings);
			const dedupedFingerprints = dedupedFindings.map((finding) => finding.fingerprint);
			const existingFingerprintRows =
				dedupedFingerprints.length > 0
					? await db
							.select({ fingerprint: findings.fingerprint, checkId: findings.checkId })
							.from(findings)
							.where(inArray(findings.fingerprint, dedupedFingerprints))
					: [];
			const existingFindingKeys = new Set(
				existingFingerprintRows.map((row) => `${row.checkId}:${row.fingerprint}`)
			);
			const newFindings = dedupedFindings.filter(
				(finding) => !existingFindingKeys.has(`${finding.checkId}:${finding.fingerprint}`)
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
