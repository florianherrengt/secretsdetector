import { z } from 'zod';
import { createRedisStore } from '../db/redisStore.js';

const CSRF_TOKEN_KEY_PREFIX = 'csrf_token:';

export const CSRF_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const store = createRedisStore(CSRF_TOKEN_KEY_PREFIX, {});

export const csrfTokenStore = {
	set: z
		.function()
		.args(z.string(), z.string(), z.number().int().positive())
		.returns(z.promise(z.void()))
		.implement(async (sessionId, token, ttlSeconds) => {
			await store.set(sessionId, token, ttlSeconds);
		}),

	get: z
		.function()
		.args(z.string())
		.returns(z.promise(z.nullable(z.string())))
		.implement(async (sessionId) => {
			const result = await store.get(sessionId);
			return result as string | null;
		}),

	del: z
		.function()
		.args(z.string())
		.returns(z.promise(z.void()))
		.implement(async (sessionId) => {
			await store.del(sessionId);
		}),
};

export const clearCsrfTokens = store.clearAll;
