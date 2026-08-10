import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetCache } from '../schemas/assetCache.js';
import { extractCacheEntry, probeAssetCache, probeCachedUrl } from './assetCache.js';

const makeCacheEntry = (
	overrides: Partial<{ etag: string; lastModified: string; bodyHash: string }> = {},
) => ({
	etag: overrides.etag ?? null,
	lastModified: overrides.lastModified ?? null,
	bodyHash: overrides.bodyHash ?? null,
});

const make304Response = (): Response => new Response(null, { status: 304 });

const make200Response = (body: string, headers: Record<string, string> = {}): Response =>
	new Response(body, { status: 200, headers });

describe('extractCacheEntry', () => {
	it('extracts etag, lastModified, and bodyHash from body + headers', () => {
		const entry = extractCacheEntry('hello world', {
			etag: '"abc"',
			'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
		});

		expect(entry.etag).toBe('"abc"');
		expect(entry.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
		expect(entry.bodyHash).toBe(createHash('sha256').update('hello world').digest('hex'));
	});

	it('returns null for missing headers', () => {
		const entry = extractCacheEntry('hello', {});

		expect(entry.etag).toBeNull();
		expect(entry.lastModified).toBeNull();
		expect(entry.bodyHash).not.toBeNull();
	});
});

describe('probeCachedUrl', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns changed=false on 304', async () => {
		const entry = makeCacheEntry({ etag: '"v1"' });

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => make304Response()),
		);

		const result = await probeCachedUrl(
			'http://localhost:3000/test.js',
			entry,
			undefined,
			undefined,
		);

		expect(result.changed).toBe(false);
		expect(result.refreshedEntry).toEqual(entry);
	});

	it('returns changed=true on 200 with refreshed cache headers', async () => {
		const entry = makeCacheEntry({ etag: '"v1"' });

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => make200Response('new content', { etag: '"v2"' })),
		);

		const result = await probeCachedUrl(
			'http://localhost:3000/test.js',
			entry,
			undefined,
			undefined,
		);

		expect(result.changed).toBe(true);
		expect(result.refreshedEntry.etag).toBe('"v2"');
		expect(result.refreshedEntry.bodyHash).toBeNull();
	});

	it('returns changed=true without fetching when entry has no cache headers', async () => {
		const entry = makeCacheEntry({ bodyHash: 'abc' });
		const mockFetch = vi.fn();

		vi.stubGlobal('fetch', mockFetch);

		const result = await probeCachedUrl(
			'http://localhost:3000/test.js',
			entry,
			undefined,
			undefined,
		);

		expect(result.changed).toBe(true);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('returns changed=true on network error', async () => {
		const entry = makeCacheEntry({ etag: '"v1"' });

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('network error');
			}),
		);

		const result = await probeCachedUrl(
			'http://localhost:3000/test.js',
			entry,
			undefined,
			undefined,
		);

		expect(result.changed).toBe(true);
	});

	it('sends If-None-Match header from cache entry', async () => {
		const entry = makeCacheEntry({ etag: '"v1"', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT' });
		const mockFetch = vi.fn(async (_input: string | URL, _init?: RequestInit) => make304Response());

		vi.stubGlobal('fetch', mockFetch);

		await probeCachedUrl('http://localhost:3000/test.js', entry, undefined, undefined);

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const fetchInit = mockFetch.mock.calls[0][1] as RequestInit;
		const headers = fetchInit.headers as Record<string, string>;

		expect(headers['If-None-Match']).toBe('"v1"');
		expect(headers['If-Modified-Since']).toBe('Wed, 01 Jan 2025 00:00:00 GMT');
	});
});

describe('probeAssetCache', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const makeFullCache = (): AssetCache => ({
		version: 1,
		homepage: {
			url: 'http://localhost:3000/',
			entry: makeCacheEntry({ etag: '"h1"', bodyHash: 'h1hash' }),
		},
		scripts: [
			{
				url: 'http://localhost:3000/a.js',
				entry: makeCacheEntry({ etag: '"a1"', bodyHash: 'a1hash' }),
			},
		],
		sourceMaps: [
			{
				url: 'http://localhost:3000/a.js.map',
				entry: makeCacheEntry({ etag: '"m1"', bodyHash: 'm1hash' }),
			},
		],
		sitemap: {
			url: 'http://localhost:3000/sitemap.xml',
			entry: makeCacheEntry({ etag: '"s1"', bodyHash: 's1hash' }),
		},
		sitemapFound: true,
	});

	it('returns unchanged=true when all URLs return 304', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => make304Response()),
		);

		const result = await probeAssetCache(makeFullCache(), undefined, undefined);

		expect(result.unchanged).toBe(true);
		expect(result.refreshedCache.version).toBe(1);
	});

	it('returns unchanged=false when any URL returns 200', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				if (String(input).includes('a.js')) {
					return make200Response('changed content', { etag: '"a2"' });
				}

				return make304Response();
			}),
		);

		const result = await probeAssetCache(makeFullCache(), undefined, undefined);

		expect(result.unchanged).toBe(false);
	});

	it('returns unchanged=false when homepage has no cache headers', async () => {
		const cache = makeFullCache();
		cache.homepage = {
			url: 'http://localhost:3000/',
			entry: makeCacheEntry({ bodyHash: 'h1hash' }),
		};

		const mockFetch = vi.fn(async () => make304Response());

		vi.stubGlobal('fetch', mockFetch);

		const result = await probeAssetCache(cache, undefined, undefined);

		expect(result.unchanged).toBe(false);
	});

	it('returns unchanged=true with empty scripts and sourceMaps', async () => {
		const cache: AssetCache = {
			version: 1,
			homepage: {
				url: 'http://localhost:3000/',
				entry: makeCacheEntry({ etag: '"h1"', bodyHash: 'h1hash' }),
			},
			scripts: [],
			sourceMaps: [],
			sitemap: null,
			sitemapFound: false,
		};

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => make304Response()),
		);

		const result = await probeAssetCache(cache, undefined, undefined);

		expect(result.unchanged).toBe(true);
	});
});
