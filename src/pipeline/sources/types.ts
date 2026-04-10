import { z } from "zod";

export const sourceFetchResultSchema = z.discriminatedUnion("ok", [
	z.object({ ok: z.literal(true), fetchedEntries: z.number().int(), domains: z.array(z.string()) }),
	z.object({ ok: z.literal(false), error: z.string() })
]);

export type SourceFetchResult = z.infer<typeof sourceFetchResultSchema>;

export const qualificationResultSchema = z.object({
	domain: z.string(),
	isQualified: z.boolean(),
	reasons: z.array(z.string())
});

export type QualificationResult = z.infer<typeof qualificationResultSchema>;

export const sourcePipelineResultSchema = z.object({
	sourceKey: z.string(),
	fetchError: z.string().optional(),
	fetchedEntries: z.number().int(),
	rawDomains: z.number().int(),
	normalizedDomains: z.number().int(),
	alreadyKnown: z.number().int(),
	newDomains: z.number().int(),
	qualificationResults: z.array(qualificationResultSchema),
	enqueued: z.number().int(),
	enqueueErrors: z.array(z.object({ domain: z.string(), error: z.string() }))
});

export type SourcePipelineResult = z.infer<typeof sourcePipelineResultSchema>;

export const sourcePreviewResultSchema = z.object({
	sourceKey: z.string(),
	fetchError: z.string().optional(),
	fetchedEntries: z.number().int(),
	domains: z.array(z.string())
});

export type SourcePreviewResult = z.infer<typeof sourcePreviewResultSchema>;

export type DomainSourceDefinition = {
	readonly key: string;
	readonly label: string;
	readonly description: string;
	readonly inputSchema: z.ZodTypeAny;
	readonly fetch: (input: Record<string, unknown>) => Promise<SourceFetchResult>;
	readonly normalizeDomain: (domain: string) => string | null;
};
