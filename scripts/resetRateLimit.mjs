import "dotenv/config";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl, {
	enableOfflineQueue: false,
	maxRetriesPerRequest: null,
	lazyConnect: true
});

const keyPrefixes = ["endpoint_rl:", "scan_ip_rl:", "scan_fingerprint_rl:"];

const deleteKeysByPrefix = async (prefix) => {
	let cursor = "0";
	let deletedCount = 0;

	do {
		const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
		cursor = nextCursor;

		if (keys.length > 0) {
			const removed = await redis.del(keys);
			deletedCount += removed;
		}
	} while (cursor !== "0");

	return deletedCount;
};

try {
	await redis.connect();

	let totalDeleted = 0;

	for (const prefix of keyPrefixes) {
		const deleted = await deleteKeysByPrefix(prefix);
		totalDeleted += deleted;
		console.log(`Deleted ${deleted} key(s) for prefix: ${prefix}`);
	}

	console.log(`Done. Deleted ${totalDeleted} total rate limit key(s).`);
} finally {
	await redis.quit();
}
