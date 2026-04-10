import { z } from "zod";

export const domainSchema = z.object({
	id: z.string().uuid(),
	hostname: z.string(),
	createdAt: z.date()
});

export type Domain = z.infer<typeof domainSchema>;
