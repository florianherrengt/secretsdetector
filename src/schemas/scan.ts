import { z } from "zod";

export const scanStatusSchema = z.enum(["pending", "success", "failed"]);

export const scanSchema = z.object({
	id: z.string().uuid(),
	domainId: z.string().uuid(),
	status: scanStatusSchema,
	startedAt: z.date(),
	finishedAt: z.date().nullable()
});

export type ScanStatus = z.infer<typeof scanStatusSchema>;
export type Scan = z.infer<typeof scanSchema>;
