import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { apiKeys, users } from '../db/schema.js';
import { generateApiKey, hashToken, apiKeySchema } from './crypto.js';

// Visible portion of a key in the UI. Includes the `sw_` prefix + 8 hex chars
// so the user can identify a key without revealing enough to forge one.
const API_KEY_DISPLAY_LENGTH = 12;

export const apiKeyNameSchema = z
	.string()
	.trim()
	.min(1, 'Name is required')
	.max(80, 'Name must be 80 characters or fewer');

export const apiKeyRowSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	prefix: z.string(),
	createdAt: z.date(),
	lastUsedAt: z.date().nullable(),
});

export type ApiKeyRow = z.infer<typeof apiKeyRowSchema>;

export const createApiKeyResultSchema = z.object({
	rawKey: z.string(),
	row: apiKeyRowSchema,
});

export type CreateApiKeyResult = z.infer<typeof createApiKeyResultSchema>;

export const createApiKey = z
	.function()
	.args(z.string().uuid(), apiKeyNameSchema)
	.returns(z.promise(createApiKeyResultSchema))
	.implement(async (userId, name) => {
		const rawKey = generateApiKey();
		const keyHash = hashToken(rawKey);
		const prefix = rawKey.slice(0, API_KEY_DISPLAY_LENGTH);
		const id = crypto.randomUUID();
		const createdAt = new Date();

		await db.insert(apiKeys).values({
			id,
			userId,
			name,
			keyHash,
			prefix,
			createdAt,
		});

		return {
			rawKey,
			row: {
				id,
				name,
				prefix,
				createdAt,
				lastUsedAt: null,
			},
		};
	});

export const listApiKeys = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.array(apiKeyRowSchema)))
	.implement(async (userId) => {
		const rows = await db
			.select({
				id: apiKeys.id,
				name: apiKeys.name,
				prefix: apiKeys.prefix,
				createdAt: apiKeys.createdAt,
				lastUsedAt: apiKeys.lastUsedAt,
			})
			.from(apiKeys)
			.where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
			.orderBy(sql`${apiKeys.createdAt} DESC`);

		return rows.map((row) => apiKeyRowSchema.parse(row));
	});

export const revokeApiKey = z
	.function()
	.args(z.string().uuid(), z.string().uuid())
	.returns(z.promise(z.boolean()))
	.implement(async (userId, keyId) => {
		const now = new Date();
		const [updated] = await db
			.update(apiKeys)
			.set({ revokedAt: now })
			.where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
			.returning({ id: apiKeys.id });

		return Boolean(updated);
	});

// Resolves a raw API key (as presented in an Authorization: Bearer header) to
// the owning user. Returns null if the key is malformed, unknown, revoked, or
// attached to an unverified account — matching the session auth rules so an
// API key is never a way to bypass email verification.
//
// On a successful lookup, the key's lastUsedAt is updated best-effort: a
// failure to write lastUsedAt must never block an otherwise valid request.
export const resolveUserByApiKey = z
	.function()
	.args(z.string())
	.returns(
		z.promise(
			z.nullable(
				z.object({
					userId: z.string().uuid(),
					email: z.string(),
					stripeCustomerId: z.string().nullable(),
					keyId: z.string().uuid(),
				}),
			),
		),
	)
	.implement(async (rawKey) => {
		const parsed = apiKeySchema.safeParse(rawKey);

		if (!parsed.success) {
			return null;
		}

		const keyHash = hashToken(parsed.data);
		const [row] = await db
			.select({
				id: apiKeys.id,
				userId: users.id,
				email: users.email,
				stripeCustomerId: users.stripeCustomerId,
				revokedAt: apiKeys.revokedAt,
				isVerified: users.isVerified,
			})
			.from(apiKeys)
			.innerJoin(users, eq(users.id, apiKeys.userId))
			.where(eq(apiKeys.keyHash, keyHash))
			.limit(1);

		if (!row || row.revokedAt !== null || !row.isVerified) {
			return null;
		}

		try {
			await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
		} catch (error) {
			console.error('Failed to update api_keys.lastUsedAt', error);
		}

		return {
			userId: row.userId,
			email: row.email,
			stripeCustomerId: row.stripeCustomerId,
			keyId: row.id,
		};
	});
