import { z } from 'zod';
import { Hono } from 'hono';
import { etag } from 'hono/etag';
import { serve } from '@hono/node-server';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../server/routes/index.js';
import { scanDomain } from './scanDomain.js';
import type { AssetCache } from '../schemas/assetCache.js';

const TEST_PORT = 3311;
type TestServer = ReturnType<typeof serve>;

const etaggedApp = new Hono();
etaggedApp.use('*', etag());
etaggedApp.route('/', app);

const waitForServer = z
	.function()
	.args(z.number().int().positive())
	.returns(z.promise(z.void()))
	.implement(async (timeoutMs) => {
		const startedAt = Date.now();

		while (true) {
			const isHealthy = await fetch(`http://localhost:${TEST_PORT}/healthz`)
				.then((r) => r.ok)
				.catch(() => false);

			if (isHealthy) {
				return;
			}

			if (Date.now() - startedAt > timeoutMs) {
				throw new Error('Local test server did not start in time');
			}

			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
		}
	});

const closeServer = z
	.function()
	.args(z.custom<TestServer>())
	.returns(z.promise(z.void()))
	.implement(async (server) => {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	});

describe('scanDomain asset cache integration', () => {
	let server: TestServer; // eslint-disable-line custom/no-mutable-variables

	beforeAll(async () => {
		server = serve({ fetch: etaggedApp.fetch, port: TEST_PORT });
		await waitForServer(5_000);
	});

	afterAll(async () => {
		await closeServer(server);
	});

	it('full-scans on first call, then skips on second call with unchanged assets', async () => {
		const first = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/demo` });

		expect(first.status).toBe('success');
		expect(first.findings.length).toBeGreaterThan(0);
		expect(first.assetCache).toBeDefined();

		const cache = first.assetCache as AssetCache;

		expect(cache.version).toBe(1);
		expect(cache.homepage).not.toBeNull();
		expect(cache.homepage?.entry.etag).not.toBeNull();
		expect(cache.scripts.length).toBeGreaterThan(0);

		for (const script of cache.scripts) {
			expect(script.entry.etag).not.toBeNull();
		}

		const second = await scanDomain({
			domain: `localhost:${TEST_PORT}/sandbox/demo`,
			previousCache: cache,
		});

		expect(second.assetsUnchanged).toBe(true);
		expect(second.assetCache).toBeDefined();
		expect(second.findings).toHaveLength(0);
		expect(second.checks).toHaveLength(0);
	});

	it('full-scans when an asset etag no longer matches', async () => {
		const first = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/demo` });
		const cache = first.assetCache as AssetCache;

		expect(cache.homepage).not.toBeNull();
		cache.homepage = {
			url: cache.homepage!.url,
			entry: {
				...cache.homepage!.entry,
				etag: '"stale-etag-that-will-not-match"',
			},
		};

		const second = await scanDomain({
			domain: `localhost:${TEST_PORT}/sandbox/demo`,
			previousCache: cache,
		});

		expect(second.assetsUnchanged).toBeUndefined();
		expect(second.status).toBe('success');
		expect(second.findings.length).toBeGreaterThan(0);
		expect(second.assetCache).toBeDefined();
		expect(second.assetCache?.homepage?.entry.etag).not.toBeNull();
	});

	it('produces the same findings across two full scans (deterministic)', async () => {
		const first = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/demo` });
		const second = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/demo` });

		expect(second.findings.length).toBe(first.findings.length);

		const firstFingerprints = first.findings.map((f) => f.fingerprint).sort();
		const secondFingerprints = second.findings.map((f) => f.fingerprint).sort();

		expect(secondFingerprints).toEqual(firstFingerprints);
	});
});
