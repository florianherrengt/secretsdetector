import { z } from 'zod';

// Per-URL cache metadata used to detect whether a remote asset has changed
// since the last scan. etag + lastModified drive HTTP conditional requests
// (If-None-Match / If-Modified-Since → 304). bodyHash is a sha256 of the
// response body captured during the full scan; it is stored for a future
// hash-comparison fallback for origins that don't send cache headers, but
// is not yet used by the probe.
export const cacheEntrySchema = z.object({
	etag: z.string().nullable(),
	lastModified: z.string().nullable(),
	bodyHash: z.string().nullable(),
});

export const cachedUrlSchema = z.object({
	url: z.string(),
	entry: cacheEntrySchema,
});

// Full snapshot of every asset a scan examined. Stored 1:1 with the domain
// in asset_snapshots. Only written on status==='success' so a failed scan
// can never populate a cache that suppresses a later retry.
export const assetCacheSchema = z.object({
	version: z.literal(1),
	homepage: cachedUrlSchema.nullable(),
	scripts: z.array(cachedUrlSchema),
	// Only accessible source maps are cached — inaccessible ones (404, wrong
	// host, etc.) have no ETag to compare and would always force a full scan.
	sourceMaps: z.array(cachedUrlSchema),
	sitemap: cachedUrlSchema.nullable(),
	sitemapFound: z.boolean(),
});

export type CacheEntry = z.infer<typeof cacheEntrySchema>;
export type CachedUrl = z.infer<typeof cachedUrlSchema>;
export type AssetCache = z.infer<typeof assetCacheSchema>;
