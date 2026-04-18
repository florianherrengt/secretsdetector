import { z } from "zod";
import { ioredisClient } from "../scan/redis.js";

export const CONFIRM_TOKEN_TTL_SECONDS = 10 * 60;
const CONFIRM_TOKEN_KEY_PREFIX = "confirm-tokens:";

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
			await ioredisClient.set(confirmTokenKey(token), JSON.stringify(value), "EX", ttlSeconds);
		}),

	get: z
		.function()
		.args(z.string())
		.returns(z.promise(z.nullable(z.record(z.string(), z.unknown()))))
		.implement(async (token) => {
			const raw = await ioredisClient.get(confirmTokenKey(token));
			if (raw === null) return null;
			return JSON.parse(raw);
		}),

	del: z
		.function()
		.args(z.string())
		.returns(z.promise(z.void()))
		.implement(async (token) => {
			await ioredisClient.del(confirmTokenKey(token));
		})
};

export const clearConfirmTokens = z
	.function()
	.returns(z.promise(z.void()))
	.implement(async () => {
		const keys = await ioredisClient.keys(`${CONFIRM_TOKEN_KEY_PREFIX}*`);
		if (keys.length > 0) {
			await ioredisClient.del(...keys);
		}
	});
