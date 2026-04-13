import { z } from "zod";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { render } from "../../../lib/response.js";
import { builtinChecks } from "../../../pipeline/checks.js";
import { domainSchema } from "../../../schemas/domain.js";
import { findingSchema } from "../../../schemas/finding.js";
import { scanSchema } from "../../../schemas/scan.js";
import { ErrorPage } from "../../../views/pages/error.js";
import { scanResultPagePropsSchema, ScanResultPage } from "../../../views/pages/scanResult.js";
import { db } from "../../db/client.js";
import { domains, findings, scans } from "../../db/schema.js";
import {
	createScanForDomainId,
	normalizeSubmittedDomain,
	upsertDomainRecord
} from "../../scan/scanJob.js";
import { ioredisClient } from "../../scan/redis.js";
import { extractSessionId } from "../../auth/middleware.js";
import { getSession } from "../../auth/index.js";

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

const REACHABILITY_TIMEOUT_MS = 30_000;

const checkDomainReachability = z
	.function()
	.args(z.string().min(1))
	.returns(z.promise(z.boolean()))
	.implement(async (domain) => {
		const url = domain.startsWith("http://") || domain.startsWith("https://")
			? domain
			: `http://${domain}`;

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);

			const response = await fetch(url, {
				method: "HEAD",
				signal: controller.signal,
				redirect: "follow"
			});

			clearTimeout(timeout);
			return response.status < 500;
		} catch {
			return false;
		}
	});

const scanCheckViewSchema = z.object({
	checkId: z.string(),
	checkName: z.string(),
	status: z.enum(["pass", "fail"]),
	classification: z.string().nullable(),
	sourceTimestamp: z.string().nullable(),
	findings: z.array(
		z.object({
			findingId: z.string(),
			title: z.string(),
			description: z.string().nullable(),
			severity: z.enum(["critical", "high", "medium", "low", "info"]).nullable(),
			filePath: z.string().nullable(),
			snippet: z.string().nullable(),
			detectedAt: z.string().nullable()
		})
	)
});

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

export const buildScanChecksView = z
	.function()
	.args(findingSchema.array())
	.returns(z.array(scanCheckViewSchema))
	.implement((findingRecords) => {
		const knownChecks = builtinChecks.map((check) => {
			const checkFindings = findingRecords
				.filter((finding) => finding.checkId === check.id)
				.map((finding) => {
					return {
						findingId: finding.id,
						title: "Issue detected",
						description: null,
						severity: null,
						filePath: finding.file,
						snippet: finding.snippet,
						detectedAt: finding.createdAt.toISOString()
					};
				});

			return {
				checkId: check.id,
				checkName: check.name,
				status: checkFindings.length > 0 ? ("fail" as const) : ("pass" as const),
				classification: null,
				sourceTimestamp: checkFindings.length > 0 ? checkFindings[0]?.detectedAt ?? null : null,
				findings: checkFindings
			};
		});

		const knownCheckIds = new Set(builtinChecks.map((check) => check.id));
		const unknownFindings = findingRecords.filter((finding) => !knownCheckIds.has(finding.checkId));
		const unknownCheckIds = [...new Set(unknownFindings.map((finding) => finding.checkId))];
		const unknownChecks = unknownCheckIds.map((checkId) => {
			const checkFindings = unknownFindings
				.filter((finding) => finding.checkId === checkId)
				.map((finding) => {
					return {
						findingId: finding.id,
						title: "Issue detected",
						description: "Findings from a check that is not registered in the current build.",
						severity: null,
						filePath: finding.file,
						snippet: finding.snippet,
						detectedAt: finding.createdAt.toISOString()
					};
				});

			return {
				checkId,
				checkName: `Unknown check (${checkId})`,
				status: "fail" as const,
				classification: null,
				sourceTimestamp: checkFindings[0]?.detectedAt ?? null,
				findings: checkFindings
			};
		});

		return [...knownChecks, ...unknownChecks];
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
					return c.html(render(ErrorPage, { title: "Bad Request", message: "Invalid domain input." }), 400);
				}

				const normalizedDomain = normalizeSubmittedDomain(parsedForm.data.domain);

				const isReachable = await checkDomainReachability(normalizedDomain);

				if (!isReachable) {
					return c.html(
						render(ErrorPage, {
							title: "Unreachable Domain",
							message: `Could not reach "${normalizedDomain}". Make sure the domain is correct and accessible.`
						}),
						400
					);
				}
				const domainRecord = await upsertDomainRecord(normalizedDomain);
				const { scanId } = await createScanForDomainId(domainRecord.id);

				return c.redirect(`/scan/${scanId}`, 302);
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
			const sessionId = extractSessionId(c);
			const session = sessionId ? await getSession(sessionId) : null;
			const topNavMode = session ? "app" : "auth";

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
			const checks = buildScanChecksView(findingRecords);
			const durationMs = scanRecord.finishedAt
				? Math.max(0, scanRecord.finishedAt.getTime() - scanRecord.startedAt.getTime())
				: 0;

			const discoveryMetadata = scanRecord.discoveryMetadata;
			const viewProps = scanResultPagePropsSchema.parse({
				scanId: scanRecord.id,
				targetUrl: domainRecord.hostname,
				topNavMode,
				status: scanRecord.status,
				startedAtIso: scanRecord.startedAt.toISOString(),
				finishedAtIso: scanRecord.finishedAt ? scanRecord.finishedAt.toISOString() : null,
				durationMs,
				checks,
				discoveredSubdomains: discoveryMetadata?.discoveredSubdomains ?? [],
				subdomainAssetCoverage: discoveryMetadata?.subdomainAssetCoverage ?? [],
				discoveryStats: discoveryMetadata?.stats ?? {
					fromLinks: 0,
					fromSitemap: 0,
					totalConsidered: 0,
					totalAccepted: 0,
					truncated: false
				}
			});

			return c.html(render(ScanResultPage, viewProps));
		})
);

export default scanRoutes;
