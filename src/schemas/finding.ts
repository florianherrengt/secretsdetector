import { z } from "zod";

export const findingTypeSchema = z.enum(["secret"]);

export const findingSchema = z.object({
	id: z.string().uuid(),
	scanId: z.string().uuid(),
	type: findingTypeSchema,
	file: z.string().url(),
	snippet: z.string(),
	fingerprint: z.string(),
	createdAt: z.date()
});

export type FindingType = z.infer<typeof findingTypeSchema>;
export type Finding = z.infer<typeof findingSchema>;
