import { z } from "zod";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { render } from "../../../lib/response.js";
import { domainSchema } from "../../../schemas/domain.js";
import { findingSchema } from "../../../schemas/finding.js";
import { scanSchema } from "../../../schemas/scan.js";
import { scanResultPagePropsSchema, ScanResultPage } from "../../../views/pages/scanResult.js";
import { db } from "../../db/client.js";
import { domains, findings, scans } from "../../db/schema.js";
import {
	createPendingScanRecord,
	markScanAsFailed,
	normalizeSubmittedDomain,
	scanQueueJobDataSchema,
	upsertDomainRecord
} from "../../scan/scanJob.js";
import { enqueueScanJob } from "../../scan/scanQueue.js";
import { ioredisClient } from "../../scan/redis.js";

const scanRoutes = new Hono();

const scanWindowSeconds = Math.round(Number(process.env.SCAN_RATE_LIMIT_WINDOW_MS ?? "60000") / 1000);
const scanMaxRequestsPerWindow = Number(process.env.SCAN_RATE_LIMIT_MAX_REQUESTS ?? "10");
const scanMaxConcurrentRequests = Number(process.env.SCAN_MAX_CONCURRENT_REQUESTS ?? "20");

const scanRateLimiter = new RateLimiterRedis({
	storeClient: ioredisClient,
	keyPrefix: "scan_rl",
	points: scanMaxRequestsPerWindow,
	duration: scanWindowSeconds
});

const scanRequestState = {
	inFlightRequests: 0
};

const scanFormSchema = z.object({
	domain: z.string().trim().min(1).max(2048)
});

const scanParamsSchema = z.object({
	scanId: z.string().uuid()
});

const getClientIp = z
	.function()
	.args(z.custom<Context>())
	.returns(z.string().min(1))
	.implement((c) => {
		const cfConnectingIp = c.req.header("cf-connecting-ip");

		if (cfConnectingIp && cfConnectingIp.trim().length > 0) {
			return cfConnectingIp.trim();
		}

		const xForwardedFor = c.req.header("x-forwarded-for");

		if (!xForwardedFor) {
			return "unknown";
		}

		const firstForwardedIp = xForwardedFor
			.split(",")
			.map((segment) => segment.trim())
			.find((segment) => segment.length > 0);

		return firstForwardedIp ?? "unknown";
	});

const checkRateLimit = z
	.function()
	.args(z.string().min(1))
	.returns(z.promise(z.boolean()))
	.implement(async (clientIp) => {
		try {
			await scanRateLimiter.consume(clientIp);
			return true;
		} catch {
			return false;
		}
	});

scanRoutes.post(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const clientIp = getClientIp(c);

			if (!(await checkRateLimit(clientIp))) {
				return c.html("<h1>Too Many Requests</h1><p>Please wait before starting another scan.</p>", 429);
			}

			if (scanRequestState.inFlightRequests >= scanMaxConcurrentRequests) {
				return c.html("<h1>Busy</h1><p>The scanner is at capacity. Try again in a moment.</p>", 503);
			}

			scanRequestState.inFlightRequests += 1;

			try {
				const body = await c.req.parseBody();
				const parsedForm = scanFormSchema.safeParse({
					domain: typeof body.domain === "string" ? body.domain : ""
				});

				if (!parsedForm.success) {
					return c.html("<h1>Bad Request</h1><p>Invalid domain input.</p>", 400);
				}

				const normalizedDomain = normalizeSubmittedDomain(parsedForm.data.domain);
				const jobPayload = scanQueueJobDataSchema.parse({
					domain: normalizedDomain
				});
				const domainRecord = await upsertDomainRecord(normalizedDomain);
				const scanRecord = await createPendingScanRecord(domainRecord.id);

				try {
					await enqueueScanJob(scanRecord.id, jobPayload);
				} catch (error) {
					await markScanAsFailed(scanRecord.id);
					const normalizedError =
						error instanceof Error ? error : new Error("Failed to enqueue scan job");

					console.error("[scan-route] Failed to enqueue scan job", {
						scanId: scanRecord.id,
						domain: normalizedDomain,
						error: normalizedError.message
					});
				}

				return c.redirect(`/scan/${scanRecord.id}`, 302);
			} finally {
				scanRequestState.inFlightRequests = Math.max(0, scanRequestState.inFlightRequests - 1);
			}
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
			const findingRows = await db.select().from(findings).where(eq(findings.scanId, scanRecord.id));
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
