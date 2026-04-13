import { z } from "zod";

export const scanStatusSchema = z.enum(["pending", "success", "failed"]);

export const discoveryStatsSchema = z.object({
	fromLinks: z.number().int().nonnegative(),
	fromSitemap: z.number().int().nonnegative(),
	totalConsidered: z.number().int().nonnegative(),
	totalAccepted: z.number().int().nonnegative(),
	truncated: z.boolean()
});

export const scanSchema = z.object({
	id: z.string().uuid(),
	domainId: z.string().uuid(),
	status: scanStatusSchema,
	startedAt: z.date(),
	finishedAt: z.date().nullable(),
	discoveryMetadata: z.object({
		discoveredSubdomains: z.array(z.string()),
		stats: discoveryStatsSchema,
		subdomainAssetCoverage: z.array(
			z.object({
				subdomain: z.string(),
				scannedAssetPaths: z.array(z.string())
			})
		)
	}).nullable()
});

export type ScanStatus = z.infer<typeof scanStatusSchema>;
export type Scan = z.infer<typeof scanSchema>;
