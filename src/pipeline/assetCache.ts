import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isSubdomainOf, resolveAndCheckHost } from './discovery.js';
import { assetCacheSchema, cacheEntrySchema, type AssetCache } from '../schemas/assetCache.js';

const PROBE_TIMEOUT_MS = 3_000;

// Extracts cache metadata from a full-scan fetch response. Called during
// the normal scan flow to build the cache that will be stored and used by
// the next scan's probe.
export const extractCacheEntry = z
	.function()
	.args(z.string(), z.record(z.string()))
	.returns(cacheEntrySchema)
	.implement((body, headers) => {
		return {
			etag: headers.etag ?? null,
			lastModified: headers['last-modified'] ?? null,
			bodyHash: createHash('sha256').update(body).digest('hex'),
		};
	});

type Semaphore = {
	acquire: () => Promise<void>;
	release: () => void;
};

export const probeCachedUrl = z
	.function()
	.args(z.string(), cacheEntrySchema, z.custom<Semaphore>().optional(), z.string().optional())
	.returns(
		z.promise(
			z.object({
				changed: z.boolean(),
				refreshedEntry: cacheEntrySchema,
			}),
		),
	)
	.implement(async (url, entry, semaphore, allowedFinalHost) => {
		// No cache headers means we can't send If-None-Match / If-Modified-Since.
		// Conservatively treat as changed so the full scan runs. This is the
		// main limitation of the v1 probe — origins without ETag/Last-Modified
		// always miss. The stored bodyHash exists to power a future fallback.
		if (!entry.etag && !entry.lastModified) {
			return { changed: true, refreshedEntry: entry };
		}

		const parsedUrl = new URL(url);
		const hostname = parsedUrl.hostname.toLowerCase();
		const isExplicitTarget =
			hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname) !== 0;

		if (!isExplicitTarget) {
			const isSafe = await resolveAndCheckHost(parsedUrl.hostname);
			if (!isSafe) {
				return { changed: true, refreshedEntry: entry };
			}
		}

		const headers: Record<string, string> = {};

		if (entry.etag) {
			headers['If-None-Match'] = entry.etag;
		}

		if (entry.lastModified) {
			headers['If-Modified-Since'] = entry.lastModified;
		}

		if (semaphore) await semaphore.acquire();

		let response: Response | null; // eslint-disable-line custom/no-mutable-variables

		try {
			response = await fetch(url, {
				method: 'GET',
				headers,
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
				redirect: 'follow',
			}).catch(() => null);
		} finally {
			if (semaphore) semaphore.release();
		}

		if (!response) {
			return { changed: true, refreshedEntry: entry };
		}

		if (allowedFinalHost) {
			const finalHost = new URL(response.url).hostname.toLowerCase();
			const normalizedAllowedHost = allowedFinalHost.toLowerCase();
			const hostAllowed =
				finalHost === normalizedAllowedHost || isSubdomainOf(finalHost, normalizedAllowedHost);

			if (!hostAllowed) {
				await response.body?.cancel().catch(() => {});
				return { changed: true, refreshedEntry: entry };
			}
		}

		if (response.status === 304) {
			// Resource unchanged — return the original entry as-is; its ETag
			// is still valid for the next probe.
			return { changed: false, refreshedEntry: entry };
		}

		// 200 (or other) means the resource was modified. Capture the new
		// cache headers from the response without downloading the body —
		// the full scan will fetch the body and compute bodyHash separately.
		const etag = response.headers.get('etag');
		const lastModified = response.headers.get('last-modified');

		await response.body?.cancel().catch(() => {});

		return {
			changed: true,
			refreshedEntry: {
				etag,
				lastModified,
				bodyHash: null,
			},
		};
	});

export const probeAssetCache = z
	.function()
	.args(assetCacheSchema, z.custom<Semaphore>().optional(), z.string().optional())
	.returns(
		z.promise(
			z.object({
				unchanged: z.boolean(),
				refreshedCache: assetCacheSchema,
			}),
		),
	)
	.implement(async (cache, semaphore, baseHost) => {
		const homepageResult = cache.homepage
			? await probeCachedUrl(cache.homepage.url, cache.homepage.entry, semaphore, baseHost)
			: null;

		const refreshedHomepage =
			cache.homepage && homepageResult
				? { url: cache.homepage.url, entry: homepageResult.refreshedEntry }
				: cache.homepage;

		const scriptResults = await Promise.all(
			cache.scripts.map((script) => probeCachedUrl(script.url, script.entry, semaphore, baseHost)),
		);

		const refreshedScripts = cache.scripts.map((script, index) => ({
			url: script.url,
			entry: scriptResults[index].refreshedEntry,
		}));

		const sourceMapResults = await Promise.all(
			cache.sourceMaps.map((sm) => probeCachedUrl(sm.url, sm.entry, semaphore, baseHost)),
		);

		const refreshedSourceMaps = cache.sourceMaps.map((sm, index) => ({
			url: sm.url,
			entry: sourceMapResults[index].refreshedEntry,
		}));

		const sitemapResult = cache.sitemap
			? await probeCachedUrl(cache.sitemap.url, cache.sitemap.entry, semaphore, baseHost)
			: null;

		const refreshedSitemap =
			cache.sitemap && sitemapResult
				? { url: cache.sitemap.url, entry: sitemapResult.refreshedEntry }
				: cache.sitemap;

		const allResults = [
			...(homepageResult ? [homepageResult] : []),
			...scriptResults,
			...sourceMapResults,
			...(sitemapResult ? [sitemapResult] : []),
		];

		// ALL cached URLs must report unchanged for the short-circuit to fire.
		// A single change means the findings could be different, so the full
		// scan must run. This is also why network errors and SSRF-rejected
		// hosts are treated as "changed" — we never skip on uncertainty.
		const allUnchanged = allResults.every((result) => !result.changed);

		const refreshedCache: AssetCache = {
			version: 1,
			homepage: refreshedHomepage,
			scripts: refreshedScripts,
			sourceMaps: refreshedSourceMaps,
			sitemap: refreshedSitemap,
			sitemapFound: cache.sitemapFound,
		};

		return { unchanged: allUnchanged, refreshedCache };
	});
