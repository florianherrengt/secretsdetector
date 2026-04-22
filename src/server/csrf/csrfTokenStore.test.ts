import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const store = new Map<string, string>();
const setCalls: { key: string; value: string; args: unknown[] }[] = [];

vi.mock('../scan/redis.js', () => ({
	ioredisClient: {
		set: (key: string, value: string, ...args: unknown[]) => {
			setCalls.push({ key, value, args });
			const hasNx = args.includes('NX');
			if (hasNx) {
				if (store.has(key)) {
					return Promise.resolve(null);
				}
				store.set(key, value);
				return Promise.resolve('OK');
			}
			store.set(key, value);
			return Promise.resolve('OK');
		},
		get: (key: string) => Promise.resolve(store.get(key) ?? null),
		del: (...keys: string[]) => {
			keys.forEach((k) => store.delete(k));
			return Promise.resolve(keys.length);
		},
		keys: (pattern: string) => {
			const prefix = pattern.replace('*', '');
			return Promise.resolve([...store.keys()].filter((k) => k.startsWith(prefix)));
		},
	},
}));

import { csrfTokenStore, clearCsrfTokens } from './csrfTokenStore.js';

describe('csrfTokenStore', () => {
	afterEach(async () => {
		await clearCsrfTokens();
		setCalls.length = 0;
	});

	it('stores and retrieves a token for a session', async () => {
		const sessionId = randomUUID();
		const token = 'test-csrf-token-' + randomUUID();

		await csrfTokenStore.set(sessionId, token, 3600);
		const result = await csrfTokenStore.get(sessionId);

		expect(result).toBe(token);
	});

	it('returns null for a non-existent session', async () => {
		const sessionId = randomUUID();
		const result = await csrfTokenStore.get(sessionId);

		expect(result).toBeNull();
	});

	it('removes a token when del is called', async () => {
		const sessionId = randomUUID();
		const token = 'test-csrf-token-' + randomUUID();

		await csrfTokenStore.set(sessionId, token, 3600);
		await csrfTokenStore.del(sessionId);
		const result = await csrfTokenStore.get(sessionId);

		expect(result).toBeNull();
	});

	it('overwrites an existing token', async () => {
		const sessionId = randomUUID();
		const token1 = 'token-1-' + randomUUID();
		const token2 = 'token-2-' + randomUUID();

		await csrfTokenStore.set(sessionId, token1, 3600);
		await csrfTokenStore.set(sessionId, token2, 3600);
		const result = await csrfTokenStore.get(sessionId);

		expect(result).toBe(token2);
	});

	describe('createIfMissing', () => {
		it('returns the token when key does not exist', async () => {
			const sessionId = randomUUID();
			const token = 'new-token-' + randomUUID();

			const result = await csrfTokenStore.createIfMissing(sessionId, token, 3600);

			expect(result).toBe(token);
		});

		it('returns null when key already exists', async () => {
			const sessionId = randomUUID();
			const existingToken = 'existing-' + randomUUID();
			const newToken = 'new-' + randomUUID();

			await csrfTokenStore.set(sessionId, existingToken, 3600);
			const result = await csrfTokenStore.createIfMissing(sessionId, newToken, 3600);

			expect(result).toBeNull();
		});

		it('creates a token that is retrievable via get', async () => {
			const sessionId = randomUUID();
			const token = 'retrievable-' + randomUUID();

			await csrfTokenStore.createIfMissing(sessionId, token, 3600);
			const result = await csrfTokenStore.get(sessionId);

			expect(result).toBe(token);
		});

		it('passes TTL to Redis SET command', async () => {
			const sessionId = randomUUID();
			const token = 'ttl-test-' + randomUUID();
			const ttl = 7200;

			await csrfTokenStore.createIfMissing(sessionId, token, ttl);

			const call = setCalls.find((c) => c.args.includes('NX'));
			expect(call).toBeDefined();
			expect(call!.args).toContain('EX');
			expect(call!.args).toContain(ttl);
		});

		it('does not overwrite an existing token', async () => {
			const sessionId = randomUUID();
			const existingToken = 'keep-' + randomUUID();
			const newToken = 'overwrite-' + randomUUID();

			await csrfTokenStore.set(sessionId, existingToken, 3600);
			await csrfTokenStore.createIfMissing(sessionId, newToken, 3600);
			const result = await csrfTokenStore.get(sessionId);

			expect(result).toBe(existingToken);
		});
	});
});
