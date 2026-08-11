import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, apiKeys } from '../db/schema.js';
import {
	createApiKey,
	listApiKeys,
	revokeApiKey,
	resolveUserByApiKey,
	apiKeyNameSchema,
} from './apiKeys.js';
import { hashToken, generateApiKey } from './crypto.js';

const createUser = async (overrides: Partial<{ email: string; isVerified: boolean }> = {}) => {
	const id = randomUUID();
	const email = overrides.email ?? `apikey-test-${id}@example.com`;
	await db.insert(users).values({
		id,
		email,
		isVerified: overrides.isVerified ?? true,
		createdAt: new Date(),
	});
	return { id, email };
};

const deleteUser = async (userId: string) => {
	await db.delete(users).where(eq(users.id, userId));
};

describe('apiKeyNameSchema', () => {
	it('accepts a non-empty trimmed name within length', () => {
		expect(apiKeyNameSchema.safeParse('CI').success).toBe(true);
		expect(apiKeyNameSchema.safeParse('  local dev  ').data).toBe('local dev');
	});

	it('rejects empty or whitespace-only names', () => {
		expect(apiKeyNameSchema.safeParse('').success).toBe(false);
		expect(apiKeyNameSchema.safeParse('   ').success).toBe(false);
	});

	it('rejects names longer than 80 characters', () => {
		expect(apiKeyNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
		expect(apiKeyNameSchema.safeParse('a'.repeat(80)).success).toBe(true);
	});
});

describe('createApiKey', () => {
	let userId: string; // eslint-disable-line custom/no-mutable-variables

	beforeEach(async () => {
		({ id: userId } = await createUser());
	});

	afterEach(async () => {
		await deleteUser(userId);
	});

	it('persists a hashed key and returns the raw key + row metadata', async () => {
		const result = await createApiKey(userId, 'CI');

		expect(result.rawKey).toMatch(/^sw_[0-9a-f]{32}$/u);
		expect(result.row.name).toBe('CI');
		expect(result.row.prefix).toBe(result.rawKey.slice(0, 12));
		expect(result.row.lastUsedAt).toBeNull();

		const [stored] = await db
			.select()
			.from(apiKeys)
			.where(eq(apiKeys.keyHash, hashToken(result.rawKey)));

		expect(stored).toBeDefined();
		expect(stored?.userId).toBe(userId);
		// Raw key must never be persisted.
		expect(stored?.keyHash).not.toBe(result.rawKey);
		expect(stored?.revokedAt).toBeNull();
	});

	it('stores two keys with distinct hashes under the same user', async () => {
		const a = await createApiKey(userId, 'a');
		const b = await createApiKey(userId, 'b');

		expect(hashToken(a.rawKey)).not.toBe(hashToken(b.rawKey));
		expect(a.rawKey).not.toBe(b.rawKey);
	});
});

describe('listApiKeys', () => {
	let userId: string; // eslint-disable-line custom/no-mutable-variables

	beforeEach(async () => {
		({ id: userId } = await createUser());
	});

	afterEach(async () => {
		await deleteUser(userId);
	});

	it('returns keys for the user ordered by createdAt desc, excluding revoked keys', async () => {
		const first = await createApiKey(userId, 'first');
		// Tiny delay so ordering is unambiguous even at the same millisecond.
		await new Promise((resolve) => setTimeout(resolve, 5));
		const second = await createApiKey(userId, 'second');

		await revokeApiKey(userId, first.row.id);

		const listed = await listApiKeys(userId);
		expect(listed.map((row) => row.id)).toEqual([second.row.id]);
		expect(listed[0]?.name).toBe('second');
	});

	it('does not leak keys belonging to another user', async () => {
		const otherUser = await createUser();

		try {
			await createApiKey(userId, 'mine');
			await createApiKey(otherUser.id, 'theirs');

			const listed = await listApiKeys(userId);
			expect(listed).toHaveLength(1);
			expect(listed[0]?.name).toBe('mine');
		} finally {
			await deleteUser(otherUser.id);
		}
	});
});

describe('revokeApiKey', () => {
	let userId: string; // eslint-disable-line custom/no-mutable-variables

	beforeEach(async () => {
		({ id: userId } = await createUser());
	});

	afterEach(async () => {
		await deleteUser(userId);
	});

	it('returns true and marks the key revoked', async () => {
		const created = await createApiKey(userId, 'CI');
		const didRevoke = await revokeApiKey(userId, created.row.id);

		expect(didRevoke).toBe(true);

		const [stored] = await db
			.select({ revokedAt: apiKeys.revokedAt })
			.from(apiKeys)
			.where(eq(apiKeys.id, created.row.id));

		expect(stored?.revokedAt).toBeInstanceOf(Date);
	});

	it('returns false when the key id does not belong to the user', async () => {
		const otherUser = await createUser();

		try {
			const created = await createApiKey(otherUser.id, 'theirs');
			const didRevoke = await revokeApiKey(userId, created.row.id);

			expect(didRevoke).toBe(false);

			const [stored] = await db
				.select({ revokedAt: apiKeys.revokedAt })
				.from(apiKeys)
				.where(eq(apiKeys.id, created.row.id));

			expect(stored?.revokedAt).toBeNull();
		} finally {
			await deleteUser(otherUser.id);
		}
	});

	it('returns false when already revoked (idempotency guard)', async () => {
		const created = await createApiKey(userId, 'CI');
		await revokeApiKey(userId, created.row.id);
		const secondAttempt = await revokeApiKey(userId, created.row.id);

		expect(secondAttempt).toBe(false);
	});
});

describe('resolveUserByApiKey', () => {
	let userId: string; // eslint-disable-line custom/no-mutable-variables
	let userEmail: string; // eslint-disable-line custom/no-mutable-variables

	beforeEach(async () => {
		({ id: userId, email: userEmail } = await createUser());
	});

	afterEach(async () => {
		await deleteUser(userId);
	});

	it('resolves the owning user for a valid raw key and updates lastUsedAt', async () => {
		const created = await createApiKey(userId, 'CI');

		const resolved = await resolveUserByApiKey(created.rawKey);

		expect(resolved).not.toBeNull();
		expect(resolved?.userId).toBe(userId);
		expect(resolved?.email).toBe(userEmail);
		expect(resolved?.keyId).toBe(created.row.id);

		const [stored] = await db
			.select({ lastUsedAt: apiKeys.lastUsedAt })
			.from(apiKeys)
			.where(eq(apiKeys.id, created.row.id));

		expect(stored?.lastUsedAt).toBeInstanceOf(Date);
	});

	it('returns null for a revoked key', async () => {
		const created = await createApiKey(userId, 'CI');
		await revokeApiKey(userId, created.row.id);

		expect(await resolveUserByApiKey(created.rawKey)).toBeNull();
	});

	it('returns null for an unverified user', async () => {
		const unverifiedUser = await createUser({ isVerified: false });

		try {
			const created = await createApiKey(unverifiedUser.id, 'CI');
			expect(await resolveUserByApiKey(created.rawKey)).toBeNull();
		} finally {
			await deleteUser(unverifiedUser.id);
		}
	});

	it('returns null for a malformed key', async () => {
		expect(await resolveUserByApiKey('not-a-real-key')).toBeNull();
		expect(await resolveUserByApiKey('sw_short')).toBeNull();
	});

	it('returns null for a random key that was never issued', async () => {
		const randomKey = generateApiKey();
		expect(await resolveUserByApiKey(randomKey)).toBeNull();
	});

	it('does not update lastUsedAt for unrelated keys when one is invalid', async () => {
		const created = await createApiKey(userId, 'CI');
		// First call updates lastUsedAt.
		await resolveUserByApiKey(created.rawKey);
		const [initial] = await db
			.select({ lastUsedAt: apiKeys.lastUsedAt })
			.from(apiKeys)
			.where(eq(apiKeys.id, created.row.id));

		// An invalid call must not throw and must not touch the row.
		await resolveUserByApiKey('sw_doesnotexist0000000000000000000');
		const [afterInvalid] = await db
			.select({ lastUsedAt: apiKeys.lastUsedAt })
			.from(apiKeys)
			.where(eq(apiKeys.id, created.row.id));

		expect(initial?.lastUsedAt?.toISOString()).toBe(afterInvalid?.lastUsedAt?.toISOString());
	});
});
