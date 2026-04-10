import Redis from "ioredis";
import { z } from "zod";

const REDIS_URL_FALLBACK = "redis://localhost:6379";
const redisUrlSchema = z.string().url();

export const redisUrl = redisUrlSchema.parse(process.env.REDIS_URL ?? REDIS_URL_FALLBACK);

export const ioredisClient = new Redis(redisUrl, {
	enableOfflineQueue: false,
	lazyConnect: true
});
