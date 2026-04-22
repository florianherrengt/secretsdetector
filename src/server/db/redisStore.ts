import { z } from 'zod';
import { ioredisClient } from '../scan/redis.js';

export const createRedisStore = z
	.function()
	.args(z.string(), z.object({ serialize: z.boolean().optional() }).optional())
	.returns(
		z.object({
			set: z.custom(),
			get: z.custom(),
			del: z.custom(),
			clearAll: z.custom(),
			createIfMissing: z.custom(),
		}),
	)
	.implement((prefix, options) => {
		const shouldSerialize = options?.serialize ?? false;

		const set = z
			.function()
			.args(z.string(), z.unknown(), z.number().int().positive())
			.returns(z.promise(z.void()))
			.implement(async (id, value, ttlSeconds) => {
				const stored = shouldSerialize ? JSON.stringify(value) : String(value);
				await ioredisClient.set(`${prefix}${id}`, stored, 'EX', ttlSeconds);
			});

		const get = z
			.function()
			.args(z.string())
			.returns(z.promise(z.unknown()))
			.implement(async (id) => {
				const raw = await ioredisClient.get(`${prefix}${id}`);
				if (raw === null) return null;
				if (shouldSerialize) {
					return JSON.parse(raw);
				}
				return raw;
			});

		const del = z
			.function()
			.args(z.string())
			.returns(z.promise(z.void()))
			.implement(async (id) => {
				await ioredisClient.del(`${prefix}${id}`);
			});

		const clearAll = z
			.function()
			.returns(z.promise(z.void()))
			.implement(async () => {
				const keys = await ioredisClient.keys(`${prefix}*`);
				if (keys.length > 0) {
					await ioredisClient.del(...keys);
				}
			});

		const createIfMissing = z
			.function()
			.args(z.string(), z.string(), z.number().int().positive())
			.returns(z.promise(z.nullable(z.string())))
			.implement(async (id, value, ttlSeconds) => {
				const stored = shouldSerialize ? JSON.stringify(value) : String(value);
				const result = await (
					ioredisClient as unknown as { set: (...args: unknown[]) => Promise<string | null> }
				).set(`${prefix}${id}`, stored, 'NX', 'EX', ttlSeconds);
				return result === 'OK' ? value : null;
			});

		return { set, get, del, clearAll, createIfMissing };
	});
