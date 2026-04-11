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

export const checkRunInputSchema = z.object({
	domain: z.string().url(),
	scripts: z.array(checkScriptSchema)
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
export type CheckRunInput = z.infer<typeof checkRunInputSchema>;
export type CheckRunOutput = z.infer<typeof checkRunOutputSchema>;
export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export type ScanCheck = CheckDefinition & {
	run: (input: CheckRunInput) => CheckRunOutput;
};
