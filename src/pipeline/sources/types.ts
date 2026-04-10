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

export const debugTransformationSchema = z.object({
	input: z.string(),
	output: z.string().nullable(),
	status: z.enum(["ok", "failed", "filtered"]),
	reason: z.string().optional()
});

export type DebugTransformation = z.infer<typeof debugTransformationSchema>;

export const sourceDebugResultSchema = z.object({
	sourceKey: z.string(),
	fetchError: z.string().optional(),
	fetchedEntries: z.number().int(),
	rawDomains: z.number().int(),
	normalizedDomains: z.number().int(),
	skippedDomains: z.number().int(),
	domains: z.array(z.string()),
	transformations: z.array(debugTransformationSchema),
	metadata: z.object({
		timing: z.object({
			fetchMs: z.number(),
			normalizeMs: z.number(),
			totalMs: z.number()
		}),
		skips: z.array(z.object({
			domain: z.string(),
			reason: z.string()
		})),
		sampleRaw: z.array(z.any()).optional()
	})
});

export type SourceDebugResult = z.infer<typeof sourceDebugResultSchema>;

export type DomainSourceDefinition = {
	readonly key: string;
	readonly label: string;
	readonly description: string;
	readonly inputSchema: z.ZodTypeAny;
	readonly fetch: (input: Record<string, unknown>) => Promise<SourceFetchResult>;
	readonly normalizeDomain: (domain: string) => string | null;
	readonly debug?: (input: Record<string, unknown>) => Promise<SourceDebugResult>;
};
