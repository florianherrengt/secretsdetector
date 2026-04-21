import { z } from 'zod';
import { createRedisStore } from './redisStore.js';

export const CONFIRM_TOKEN_TTL_SECONDS = 10 * 60;
const CONFIRM_TOKEN_KEY_PREFIX = 'confirm-tokens:';

const store = createRedisStore(CONFIRM_TOKEN_KEY_PREFIX, { serialize: true });

export const confirmTokenKey = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((token) => `${CONFIRM_TOKEN_KEY_PREFIX}${token}`);

export const confirmTokenStore = {
	set: z
		.function()
		.args(z.string(), z.record(z.string(), z.unknown()), z.number().int().positive())
		.returns(z.promise(z.void()))
		.implement(async (token, value, ttlSeconds) => {
			await store.set(token, value, ttlSeconds);
		}),

	get: z
		.function()
		.args(z.string())
		.returns(z.promise(z.nullable(z.record(z.string(), z.unknown()))))
		.implement(async (token) => {
			const result = await store.get(token);
			return result as Record<string, unknown> | null;
		}),

	del: z
		.function()
		.args(z.string())
		.returns(z.promise(z.void()))
		.implement(async (token) => {
			await store.del(token);
		}),
};

export const clearConfirmTokens = store.clearAll;
