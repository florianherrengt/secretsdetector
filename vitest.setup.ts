// Load .env before importing db/redis so tests read the same service URLs and
// PG_PORT/REDIS_PORT overrides as the app. This is what makes parallel
// worktrees (each with their own .env + isolated ports) work with a plain
// `npx vitest run` — without it, the db client falls back to its hardcoded
// localhost:5432 default and misses the worktree's isolated containers. Mirrors
// `src/server/app.ts`.
import 'dotenv/config';
import { ioredisClient } from './src/server/scan/redis.js';
import { db } from './src/server/db/client.js';
import { sql } from 'drizzle-orm';
import { runMigrations } from './src/server/db/migrate.js';

await (async () => {
	if (ioredisClient.status !== 'ready') {
		await new Promise<void>((resolve) => ioredisClient.once('ready', () => resolve()));
	}

	await db.execute(sql`SELECT pg_advisory_lock(1234567890)`);

	try {
		await runMigrations();
	} finally {
		await db.execute(sql`SELECT pg_advisory_unlock(1234567890)`);
	}
})();
