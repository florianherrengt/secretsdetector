import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { render } from "../../../lib/response.js";
import { scanDomain } from "../../../pipeline/scanDomain.js";
import { domainSchema } from "../../../schemas/domain.js";
import { findingSchema } from "../../../schemas/finding.js";
import { scanSchema } from "../../../schemas/scan.js";
import { ScanResultPage, scanResultPagePropsSchema } from "../../../views/pages/scanResult.js";
import { domains, findings, scans } from "../../db/schema.js";

const scanRoutes = new Hono();

const DATABASE_URL_FALLBACK =
	"postgresql://secret_detector:secret_detector@localhost:5432/secret_detector";
const databaseUrlSchema = z.string().min(1);
const db = drizzle(
	new Pool({
		connectionString: databaseUrlSchema.parse(process.env.DATABASE_URL ?? DATABASE_URL_FALLBACK)
	})
);

const scanFormSchema = z.object({
	domain: z.string().min(1)
});

const scanParamsSchema = z.object({
	scanId: z.string().uuid()
});

const normalizeSubmittedDomain = z
	.function()
	.args(z.string())
	.returns(z.string().min(1))
	.implement((rawDomain) => {
		const trimmed = rawDomain.trim();

		if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
			let parsedUrl: URL;

			try {
				parsedUrl = new URL(trimmed);
			} catch {
				return trimmed.replace(/^https?:\/\//i, "");
			}

			const normalizedPath = parsedUrl.pathname === "/" ? "" : parsedUrl.pathname;
			return `${parsedUrl.host}${normalizedPath}${parsedUrl.search}`;
		}

		return trimmed;
	});

scanRoutes.post(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const body = await c.req.parseBody();
			const parsedForm = scanFormSchema.safeParse({
				domain: typeof body.domain === "string" ? body.domain : ""
			});

			if (!parsedForm.success) {
				return c.html("<h1>Bad Request</h1><p>Invalid domain input.</p>", 400);
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

			await db
				.update(scans)
				.set({
					status: pipelineResult.status,
					finishedAt
				})
				.where(eq(scans.id, scanRecord.id));

			if (pipelineResult.findings.length > 0) {
				await db.insert(findings).values(
					pipelineResult.findings.map((finding) => {
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

			return c.redirect(`/scan/${scanRecord.id}`, 302);
		})
);

scanRoutes.get(
	"/:scanId",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const params = scanParamsSchema.safeParse(c.req.param());

			if (!params.success) {
				return c.text("Not found", 404);
			}

			const scanRows = await db.select().from(scans).where(eq(scans.id, params.data.scanId)).limit(1);

			if (scanRows.length === 0) {
				return c.text("Not found", 404);
			}

			const scanRecord = scanSchema.parse(scanRows[0]);
			const domainRows = await db
				.select()
				.from(domains)
				.where(eq(domains.id, scanRecord.domainId))
				.limit(1);

			if (domainRows.length === 0) {
				return c.text("Not found", 404);
			}

			const domainRecord = domainSchema.parse(domainRows[0]);
			const findingRows = await db
				.select()
				.from(findings)
				.where(eq(findings.scanId, scanRecord.id));
			const findingRecords = findingSchema.array().parse(findingRows);

			const viewProps = scanResultPagePropsSchema.parse({
				domain: domainRecord.hostname,
				status: scanRecord.status,
				startedAtIso: scanRecord.startedAt.toISOString(),
				finishedAtIso: scanRecord.finishedAt ? scanRecord.finishedAt.toISOString() : null,
				findings: findingRecords.map((finding) => {
					return {
						file: finding.file,
						snippet: finding.snippet
					};
				})
			});

			return c.html(render(ScanResultPage, viewProps));
		})
);

export default scanRoutes;
