import { z } from "zod";
import { inArray } from "drizzle-orm";
import { db } from "../../server/db/client.js";
import { domains } from "../../server/db/schema.js";
import {
	createScanForDomainId,
	upsertDomainRecord
} from "../../server/scan/scanJob.js";
import { qualifyDomain } from "../qualifyDomain.js";
import { crtshSource } from "./crtsh.js";
import { productHuntSource } from "./producthunt.js";
import type {
	DomainSourceDefinition,
	QualificationResult,
	SourcePipelineResult,
	SourcePreviewResult
} from "./types.js";
import {
	qualificationResultSchema,
	sourcePipelineResultSchema,
	sourcePreviewResultSchema,
	sourceDebugResultSchema,
	debugTransformationSchema
} from "./types.js";

const sourceRegistry = new Map<string, DomainSourceDefinition>();

export const registerSource = z
	.function()
	.args(z.custom<DomainSourceDefinition>())
	.returns(z.void())
	.implement((source) => {
		sourceRegistry.set(source.key, source);
	});

export const getSource = z
	.function()
	.args(z.string())
	.returns(z.custom<DomainSourceDefinition>().optional())
	.implement((key) => {
		return sourceRegistry.get(key);
	});

export const listSources = z
	.function()
	.returns(z.array(z.custom<DomainSourceDefinition>()))
	.implement(() => {
		return Array.from(sourceRegistry.values());
	});

registerSource(crtshSource);
registerSource(productHuntSource);

export const previewSource = z
	.function()
	.args(z.object({ sourceKey: z.string(), input: z.record(z.unknown()) }))
	.returns(z.promise(sourcePreviewResultSchema))
	.implement(async ({ sourceKey, input }) => {
		const source = sourceRegistry.get(sourceKey);

		if (source === undefined) {
			return sourcePreviewResultSchema.parse({
				sourceKey,
				fetchError: `Unknown source: ${sourceKey}`,
				fetchedEntries: 0,
				domains: []
			});
		}

		const parsedInput = source.inputSchema.safeParse(input);

		if (!parsedInput.success) {
			return sourcePreviewResultSchema.parse({
				sourceKey,
				fetchError: `Invalid input: ${parsedInput.error.issues[0]?.message ?? "unknown"}`,
				fetchedEntries: 0,
				domains: []
			});
		}

		const fetchResult = await source.fetch(parsedInput.data);

		if (!fetchResult.ok) {
			return sourcePreviewResultSchema.parse({
				sourceKey,
				fetchError: fetchResult.error,
				fetchedEntries: 0,
				domains: []
			});
		}

		return sourcePreviewResultSchema.parse({
			sourceKey,
			fetchedEntries: fetchResult.fetchedEntries,
			domains: fetchResult.domains
		});
	});

export const runSourcePipeline = z
	.function()
	.args(z.object({ sourceKey: z.string(), input: z.record(z.unknown()) }))
	.returns(z.promise(sourcePipelineResultSchema))
	.implement(async ({ sourceKey, input }) => {
		const source = sourceRegistry.get(sourceKey);

		if (source === undefined) {
			return sourcePipelineResultSchema.parse({
				sourceKey,
				fetchError: `Unknown source: ${sourceKey}`,
				fetchedEntries: 0,
				rawDomains: 0,
				normalizedDomains: 0,
				alreadyKnown: 0,
				newDomains: 0,
				qualificationResults: [],
				enqueued: 0,
				enqueueErrors: []
			});
		}

		const parsedInput = source.inputSchema.safeParse(input);

		if (!parsedInput.success) {
			return sourcePipelineResultSchema.parse({
				sourceKey,
				fetchError: `Invalid input: ${parsedInput.error.issues[0]?.message ?? "unknown"}`,
				fetchedEntries: 0,
				rawDomains: 0,
				normalizedDomains: 0,
				alreadyKnown: 0,
				newDomains: 0,
				qualificationResults: [],
				enqueued: 0,
				enqueueErrors: []
			});
		}

		const fetchResult = await source.fetch(parsedInput.data);

		if (!fetchResult.ok) {
			return sourcePipelineResultSchema.parse({
				sourceKey,
				fetchError: fetchResult.error,
				fetchedEntries: 0,
				rawDomains: 0,
				normalizedDomains: 0,
				alreadyKnown: 0,
				newDomains: 0,
				qualificationResults: [],
				enqueued: 0,
				enqueueErrors: []
			});
		}

		const rawDomains = fetchResult.domains;

		const normalizedSet = new Set<string>();

		for (const raw of rawDomains) {
			const base = source.normalizeDomain(raw);

			if (base !== null) {
				normalizedSet.add(base);
			}
		}

		const normalizedList = Array.from(normalizedSet);

		const existingRows: { hostname: string }[] =
			normalizedList.length > 0
				? await db.select({ hostname: domains.hostname }).from(domains).where(inArray(domains.hostname, normalizedList))
				: [];

		const knownHostnames = new Set(existingRows.map((r) => r.hostname));
		const newDomains = normalizedList.filter((d) => !knownHostnames.has(d));

		const qualificationResults: QualificationResult[] = [];

		for (const domain of newDomains) {
			const result = await qualifyDomain({ domain });
			qualificationResults.push({
				domain,
				isQualified: result.isQualified,
				reasons: result.reasons
			});
		}

		const qualified = qualificationResults.filter((r) => r.isQualified);
		const enqueuedDomains: string[] = [];
		const enqueueErrors: { domain: string; error: string }[] = [];

		for (const q of qualified) {
			try {
				const domainRecord = await upsertDomainRecord(q.domain);
				await createScanForDomainId(domainRecord.id);
				enqueuedDomains.push(q.domain);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown enqueue error";
				enqueueErrors.push({ domain: q.domain, error: message });
			}
		}

		return sourcePipelineResultSchema.parse({
			sourceKey,
			fetchedEntries: fetchResult.fetchedEntries,
			rawDomains: rawDomains.length,
			normalizedDomains: normalizedList.length,
			alreadyKnown: knownHostnames.size,
			newDomains: newDomains.length,
			qualificationResults,
			enqueued: enqueuedDomains.length,
			enqueueErrors
		});
	});

export const debugSource = z
	.function()
	.args(z.object({ sourceKey: z.string(), input: z.record(z.unknown()) }))
	.returns(z.promise(sourceDebugResultSchema))
	.implement(async ({ sourceKey, input }) => {
		const source = sourceRegistry.get(sourceKey);

		if (source === undefined) {
			return sourceDebugResultSchema.parse({
				sourceKey,
				fetchError: `Unknown source: ${sourceKey}`,
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

		const parsedInput = source.inputSchema.safeParse(input);

		if (!parsedInput.success) {
			return sourceDebugResultSchema.parse({
				sourceKey,
				fetchError: `Invalid input: ${parsedInput.error.issues[0]?.message ?? "unknown"}`,
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

		if (source.debug !== undefined) {
			return source.debug(parsedInput.data);
		}

		const totalStart = Date.now();
		const fetchStart = Date.now();
		const fetchResult = await source.fetch(parsedInput.data);
		const fetchEnd = Date.now();

		if (!fetchResult.ok) {
			return sourceDebugResultSchema.parse({
				sourceKey,
				fetchError: fetchResult.error,
				fetchedEntries: 0,
				rawDomains: 0,
				normalizedDomains: 0,
				skippedDomains: 0,
				domains: [],
				transformations: [],
				metadata: {
					timing: {
						fetchMs: fetchEnd - fetchStart,
						normalizeMs: 0,
						totalMs: Date.now() - totalStart
					},
					skips: [],
					sampleRaw: []
				}
			});
		}

		const rawDomains = fetchResult.domains;
		const normalizeStart = Date.now();

		const transformations: typeof debugTransformationSchema._type[] = [];
		const domainSet = new Set<string>();
		const skips: { domain: string; reason: string }[] = [];

		for (const raw of rawDomains) {
			const normalized = source.normalizeDomain(raw);

			if (normalized === null) {
				skips.push({ domain: raw, reason: "Invalid domain" });
				transformations.push({
					input: raw,
					output: null,
					status: "failed",
					reason: "Invalid domain"
				});
			} else {
				if (domainSet.has(normalized)) {
					transformations.push({
						input: raw,
						output: normalized,
						status: "ok",
						reason: "Duplicate (deduplicated)"
					});
				} else {
					domainSet.add(normalized);
					transformations.push({
						input: raw,
						output: normalized,
						status: "ok"
					});
				}
			}
		}

		const normalizeEnd = Date.now();
		const normalizedList = Array.from(domainSet).sort();

		const sampleRaw = rawDomains.slice(0, 5);

		return sourceDebugResultSchema.parse({
			sourceKey,
			fetchedEntries: fetchResult.fetchedEntries,
			rawDomains: rawDomains.length,
			normalizedDomains: normalizedList.length,
			skippedDomains: skips.length,
			domains: normalizedList,
			transformations,
			metadata: {
				timing: {
					fetchMs: fetchEnd - fetchStart,
					normalizeMs: normalizeEnd - normalizeStart,
					totalMs: Date.now() - totalStart
				},
				skips,
				sampleRaw
			}
		});
	});

export type {
	DomainSourceDefinition,
	QualificationResult,
	SourcePipelineResult,
	SourcePreviewResult
};
export {
	qualificationResultSchema,
	sourcePipelineResultSchema,
	sourcePreviewResultSchema,
	sourceDebugResultSchema
};
