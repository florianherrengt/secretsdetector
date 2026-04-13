import { z } from "zod";

export const checkFindingSchema = z.object({
	type: z.literal("secret"),
	file: z.string().url(),
	snippet: z.string(),
	fingerprint: z.string()
});

export const checkScriptSchema = z.object({
	file: z.string().url(),
	content: z.string()
});

export const sourceMapDiscoveryMethodSchema = z.enum([
	"sourcemap-header",
	"x-sourcemap-header",
	"inline-comment",
	"legacy-inline-comment"
]);

export const sourceMapProbeSchema = z.object({
	scriptUrl: z.string().url(),
	mapUrl: z.string().url(),
	discoveryMethod: sourceMapDiscoveryMethodSchema,
	isAccessible: z.boolean(),
	httpStatus: z.number().int().nullable(),
	hasSourcesContent: z.boolean().nullable()
});

export const checkRunInputSchema = z.object({
	domain: z.string().url(),
	scripts: z.array(checkScriptSchema),
	sourceMaps: z.array(sourceMapProbeSchema).optional().default([]),
	sitemapFound: z.boolean().optional().default(true)
});

export const checkRunOutputSchema = z.object({
	findings: z.array(checkFindingSchema)
});

export const checkDefinitionSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().min(1)
});

export const checkResultSchema = checkDefinitionSchema.extend({
	findings: z.array(checkFindingSchema)
});

export type CheckFinding = z.infer<typeof checkFindingSchema>;
export type SourceMapDiscoveryMethod = z.infer<typeof sourceMapDiscoveryMethodSchema>;
export type SourceMapProbe = z.infer<typeof sourceMapProbeSchema>;
export type CheckRunInput = z.infer<typeof checkRunInputSchema>;
export type CheckRunOutput = z.infer<typeof checkRunOutputSchema>;
export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export type ScanCheck = CheckDefinition & {
	run: (input: CheckRunInput) => CheckRunOutput;
};
