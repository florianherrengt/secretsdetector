import { z } from "zod";
import type {
	DomainSourceDefinition,
	SourceDebugResult,
	SourceFetchResult
} from "./types.js";
import { sourceDebugResultSchema } from "./types.js";

const PRODUCT_HUNT_API_URL = "https://api.producthunt.com/v2/api/graphql";
const SOURCE_KEY = "producthunt";
const MAX_RUNTIME_MS = 5_000;
const RESOLUTION_CONCURRENCY = 4;
const MAX_RATE_LIMIT_RETRIES = 3;

const blockedDomains = new Set([
	"producthunt.com",
	"twitter.com",
	"github.com",
	"facebook.com",
	"linkedin.com",
	"instagram.com",
	"youtube.com",
	"reddit.com"
]);

const productHuntInputSchema = z.object({
	maxPages: z.coerce.number().int().min(1).max(20).default(10)
});

export type ProductHuntInput = z.infer<typeof productHuntInputSchema>;

export { productHuntInputSchema };

const productHuntPostSchema = z.object({
	website: z.string().nullable().optional(),
	createdAt: z.string()
});

const productHuntGraphqlResponseSchema = z.object({
	data: z
		.object({
			posts: z.object({
				edges: z.array(
					z.object({
						node: productHuntPostSchema
					})
				),
				pageInfo: z.object({
					hasNextPage: z.boolean(),
					endCursor: z.string().nullable()
				})
			})
		})
		.optional(),
	errors: z
		.array(
			z.object({
				message: z.string()
			})
		)
		.optional()
});

type ProductHuntPost = z.infer<typeof productHuntPostSchema>;

type ResolveTrace = {
	readonly input: string;
	readonly output: string | null;
	readonly status: "ok" | "failed" | "filtered";
	readonly reason?: string;
};

type SourcingRun = {
	readonly fetchedEntries: number;
	readonly rawDomains: number;
	readonly domains: string[];
	readonly transformations: ResolveTrace[];
	readonly skips: Array<{ domain: string; reason: string }>;
	readonly sampleRaw: ProductHuntPost[];
	readonly timing: {
		readonly fetchMs: number;
		readonly normalizeMs: number;
		readonly totalMs: number;
	};
};

const isHttpUrl = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
		try {
			const url = new URL(value);
			return url.protocol === "http:" || url.protocol === "https:";
		} catch {
			return false;
		}
	});

const normalizeHostname = z
	.function()
	.args(z.string())
	.returns(z.string().nullable())
	.implement((value) => {
		const raw = value.trim().toLowerCase();

		if (raw.length === 0) {
			return null;
		}

		const parsed = (() => {
			try {
				if (raw.includes("://")) {
					return new URL(raw);
				}
				return new URL(`https://${raw}`);
			} catch {
				return null;
			}
		})();

		if (parsed === null) {
			return null;
		}

		let hostname = parsed.hostname.toLowerCase();

		if (hostname.startsWith("www.")) {
			hostname = hostname.slice(4);
		}

		if (hostname.length === 0 || hostname === "localhost") {
			return null;
		}

		const labels = hostname.split(".");

		if (labels.length < 2) {
			return null;
		}

		if (labels.some((label) => label.length === 0)) {
			return null;
		}

		return hostname;
	});

const fetchProductHuntPage = z
	.function()
	.args(z.object({ token: z.string(), cursor: z.string().nullable() }))
	.returns(
		z.promise(
			z.discriminatedUnion("ok", [
				z.object({
					ok: z.literal(true),
					posts: z.array(productHuntPostSchema),
					hasNextPage: z.boolean(),
					endCursor: z.string().nullable()
				}),
				z.object({
					ok: z.literal(false),
					error: z.string(),
					rateLimited: z.boolean().optional(),
					retryAfterMs: z.number().int().nonnegative().optional()
				})
			])
		)
	)
	.implement(async ({ token, cursor }) => {
		const parseRetryAfterMs = (response: Response): number | null => {
			const value = response.headers.get("retry-after");

			if (value === null) {
				return null;
			}

			const numeric = Number(value);

			if (Number.isFinite(numeric) && numeric >= 0) {
				return Math.floor(numeric * 1000);
			}

			const retryDate = Date.parse(value);

			if (!Number.isNaN(retryDate)) {
				return Math.max(0, retryDate - Date.now());
			}

			return null;
		};

		try {
			const response = await fetch(PRODUCT_HUNT_API_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					query:
						"query($first: Int!, $after: String) { posts(first: $first, after: $after) { edges { node { website createdAt } } pageInfo { hasNextPage endCursor } } }",
					variables: {
						first: 50,
						after: cursor
					}
				}),
				signal: AbortSignal.timeout(4_000)
			});

			if (!response.ok) {
				if (response.status === 429) {
					return {
						ok: false,
						error: "HTTP 429",
						rateLimited: true,
						retryAfterMs: parseRetryAfterMs(response) ?? undefined
					};
				}

				return { ok: false, error: `HTTP ${response.status}` };
			}

			const json = await response.json();
			const parsed = productHuntGraphqlResponseSchema.safeParse(json);

			if (!parsed.success) {
				return { ok: false, error: "Invalid response structure" };
			}

			if (parsed.data.errors !== undefined && parsed.data.errors.length > 0) {
				return { ok: false, error: parsed.data.errors[0]?.message ?? "GraphQL error" };
			}

			if (parsed.data.data === undefined) {
				return { ok: false, error: "Missing GraphQL data" };
			}

			return {
				ok: true,
				posts: parsed.data.data.posts.edges.map((edge) => edge.node),
				hasNextPage: parsed.data.data.posts.pageInfo.hasNextPage,
				endCursor: parsed.data.data.posts.pageInfo.endCursor
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return { ok: false, error: message };
		}
	});

const resolveProductHuntUrl = z
	.function()
	.args(z.string())
	.returns(
		z.promise(
			z.object({
				resolvedUrl: z.string().nullable(),
				error: z.string().optional()
			})
		)
	)
	.implement(async (url) => {
		const resolveFromManualResponse = (response: Response): string | null => {
			if (response.status >= 300 && response.status < 400) {
				const location = response.headers.get("location");

				if (location === null) {
					return null;
				}

				try {
					return new URL(location, url).toString();
				} catch {
					return null;
				}
			}

			return null;
		};

		try {
			const head = await fetch(url, {
				method: "HEAD",
				redirect: "manual",
				signal: AbortSignal.timeout(1_500)
			});

			const manualHeadTarget = resolveFromManualResponse(head);

			if (manualHeadTarget !== null) {
				return { resolvedUrl: manualHeadTarget };
			}
		} catch {
			// Fall through to GET attempts.
		}

		try {
			const getManual = await fetch(url, {
				method: "GET",
				redirect: "manual",
				signal: AbortSignal.timeout(2_500)
			});

			const manualGetTarget = resolveFromManualResponse(getManual);

			if (manualGetTarget !== null) {
				return { resolvedUrl: manualGetTarget };
			}
		} catch {
			// Fall through to follow attempt.
		}

		try {
			const getFollow = await fetch(url, {
				method: "GET",
				redirect: "follow",
				signal: AbortSignal.timeout(2_500)
			});

			if (!getFollow.ok) {
				return { resolvedUrl: null, error: `HTTP ${getFollow.status}` };
			}

			if (getFollow.url === url) {
				return { resolvedUrl: null, error: "No redirect target discovered" };
			}

			return { resolvedUrl: getFollow.url };
		} catch (error) {
			const message = error instanceof Error ? error.message : "Resolution failed";
			return { resolvedUrl: null, error: message };
		}
	});

const runProductHuntSourcing = z
	.function()
	.args(productHuntInputSchema)
	.returns(
		z.promise(
			z.discriminatedUnion("ok", [
				z.object({ ok: z.literal(true), result: z.custom<SourcingRun>() }),
				z.object({ ok: z.literal(false), error: z.string() })
			])
		)
	)
	.implement(async (input) => {
		const token = process.env.PRODUCT_HUNT_TOKEN;

		if (token === undefined || token.trim().length === 0) {
			return { ok: false, error: "PRODUCT_HUNT_TOKEN not configured" };
		}

		const totalStart = Date.now();
		const deadline = totalStart + MAX_RUNTIME_MS;

		const fetchStart = Date.now();
		const posts: ProductHuntPost[] = [];
		let cursor: string | null = null;

		for (let page = 0; page < input.maxPages; page++) {
			if (Date.now() >= deadline) {
				break;
			}

			let pageResult = await fetchProductHuntPage({ token, cursor });

			for (let attempt = 0; !pageResult.ok && pageResult.rateLimited === true && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
				const fallbackBackoffMs = Math.min(4_000, 500 * (2 ** attempt));
				const waitMs = Math.max(250, pageResult.retryAfterMs ?? fallbackBackoffMs);
				const remainingMs = deadline - Date.now();

				if (remainingMs <= waitMs) {
					const retrySeconds = Math.max(1, Math.ceil(waitMs / 1000));
					return {
						ok: false,
						error: `Rate limited by Product Hunt (HTTP 429). Retry after about ${retrySeconds}s.`
					};
				}

				await new Promise<void>((resolve) => {
					setTimeout(resolve, waitMs);
				});

				pageResult = await fetchProductHuntPage({ token, cursor });
			}

			if (!pageResult.ok) {
				if (pageResult.rateLimited === true) {
					const retrySeconds = Math.max(1, Math.ceil((pageResult.retryAfterMs ?? 1000) / 1000));
					return {
						ok: false,
						error: `Rate limited by Product Hunt (HTTP 429). Retry after about ${retrySeconds}s.`
					};
				}

				return { ok: false, error: pageResult.error };
			}

			posts.push(...pageResult.posts);

			if (!pageResult.hasNextPage || pageResult.endCursor === null) {
				break;
			}

			cursor = pageResult.endCursor;
		}

		const fetchMs = Date.now() - fetchStart;

		const normalizeStart = Date.now();
		const transformations: ResolveTrace[] = [];
		const skips: Array<{ domain: string; reason: string }> = [];
		const candidates: string[] = [];

		for (const post of posts) {
			if (post.website === undefined || post.website === null || post.website.trim().length === 0) {
				skips.push({ domain: "", reason: "Missing website URL" });
				continue;
			}

			if (!isHttpUrl(post.website)) {
				skips.push({ domain: post.website, reason: "Invalid website URL" });
				transformations.push({
					input: post.website,
					output: null,
					status: "failed",
					reason: "Invalid website URL"
				});
				continue;
			}

			candidates.push(post.website);
		}

		const domains = new Set<string>();
		let cursorIndex = 0;

		const worker = async () => {
			while (true) {
				if (Date.now() >= deadline) {
					return;
				}

				if (cursorIndex >= candidates.length) {
					return;
				}

				const currentIndex = cursorIndex;
				cursorIndex++;
				const productHuntUrl = candidates[currentIndex];

				const resolved = await resolveProductHuntUrl(productHuntUrl);

				if (resolved.resolvedUrl === null) {
					skips.push({
						domain: productHuntUrl,
						reason: resolved.error ?? "Redirect resolution failed"
					});
					transformations.push({
						input: productHuntUrl,
						output: null,
						status: "failed",
						reason: resolved.error ?? "Redirect resolution failed"
					});
					continue;
				}

				const normalized = normalizeHostname(resolved.resolvedUrl);

				if (normalized === null) {
					skips.push({ domain: productHuntUrl, reason: "Resolved URL has invalid hostname" });
					transformations.push({
						input: productHuntUrl,
						output: null,
						status: "failed",
						reason: `Resolved URL: ${resolved.resolvedUrl}`
					});
					continue;
				}

				if (blockedDomains.has(normalized)) {
					skips.push({ domain: normalized, reason: "Filtered aggregator domain" });
					transformations.push({
						input: productHuntUrl,
						output: normalized,
						status: "filtered",
						reason: `Resolved URL: ${resolved.resolvedUrl}`
					});
					continue;
				}

				domains.add(normalized);
				transformations.push({
					input: productHuntUrl,
					output: normalized,
					status: "ok",
					reason: `Resolved URL: ${resolved.resolvedUrl}`
				});
			}
		};

		await Promise.all(Array.from({ length: RESOLUTION_CONCURRENCY }, () => worker()));

		if (Date.now() >= deadline && cursorIndex < candidates.length) {
			skips.push({
				domain: "",
				reason: `Stopped after ${MAX_RUNTIME_MS}ms runtime limit`
			});
		}

		const normalizeMs = Date.now() - normalizeStart;
		const totalMs = Date.now() - totalStart;

		const sortedDomains = Array.from(domains).sort((a, b) => a.localeCompare(b));
		const sortedTransformations = transformations.sort((a, b) => a.input.localeCompare(b.input));

		return {
			ok: true,
			result: {
				fetchedEntries: posts.length,
				rawDomains: candidates.length,
				domains: sortedDomains,
				transformations: sortedTransformations,
				skips,
				sampleRaw: posts.slice(0, 5),
				timing: {
					fetchMs,
					normalizeMs,
					totalMs
				}
			}
		};
	});

const productHuntFetch = z
	.function()
	.args(productHuntInputSchema)
	.returns(z.promise(z.custom<SourceFetchResult>()))
	.implement(async (input): Promise<SourceFetchResult> => {
		const run = await runProductHuntSourcing(input);

		if (!run.ok) {
			return { ok: false, error: run.error };
		}

		return {
			ok: true,
			fetchedEntries: run.result.fetchedEntries,
			domains: run.result.domains
		};
	});

const productHuntDebug = z
	.function()
	.args(productHuntInputSchema)
	.returns(z.promise(sourceDebugResultSchema))
	.implement(async (input): Promise<SourceDebugResult> => {
		const run = await runProductHuntSourcing(input);

		if (!run.ok) {
			return sourceDebugResultSchema.parse({
				sourceKey: SOURCE_KEY,
				fetchError: run.error,
				fetchedEntries: 0,
				rawDomains: 0,
				normalizedDomains: 0,
				skippedDomains: 0,
				domains: [],
				transformations: [],
				metadata: {
					timing: { fetchMs: 0, normalizeMs: 0, totalMs: 0 },
					skips: [],
					sampleRaw: []
				}
			});
		}

		return sourceDebugResultSchema.parse({
			sourceKey: SOURCE_KEY,
			fetchedEntries: run.result.fetchedEntries,
			rawDomains: run.result.rawDomains,
			normalizedDomains: run.result.domains.length,
			skippedDomains: run.result.skips.length,
			domains: run.result.domains,
			transformations: run.result.transformations,
			metadata: {
				timing: run.result.timing,
				skips: run.result.skips,
				sampleRaw: run.result.sampleRaw
			}
		});
	});

const productHuntSourceFetch = z
	.function()
	.args(z.record(z.unknown()))
	.returns(z.promise(z.custom<SourceFetchResult>()))
	.implement((input) => productHuntFetch(productHuntInputSchema.parse(input)));

const productHuntSourceNormalize = z
	.function()
	.args(z.string())
	.returns(z.string().nullable())
	.implement((domain) => normalizeHostname(domain));

const productHuntSourceDebug = z
	.function()
	.args(z.record(z.unknown()))
	.returns(z.promise(sourceDebugResultSchema))
	.implement((input) => productHuntDebug(productHuntInputSchema.parse(input)));

export const productHuntSource: DomainSourceDefinition = {
	key: SOURCE_KEY,
	label: "Product Hunt",
	description: "Newly launched products from Product Hunt",
	inputSchema: productHuntInputSchema,
	fetch: productHuntSourceFetch,
	normalizeDomain: productHuntSourceNormalize,
	debug: productHuntSourceDebug
};
