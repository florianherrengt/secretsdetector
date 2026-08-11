import {
	boolean,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import type { AssetCache } from '../../schemas/assetCache.js';

export const scanStatusEnum = pgEnum('scan_status', ['pending', 'success', 'failed']);

export const findingTypeEnum = pgEnum('finding_type', ['secret']);

export const domains = pgTable('domains', {
	id: uuid('id').primaryKey(),
	hostname: text('hostname').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const scans = pgTable(
	'scans',
	{
		id: uuid('id').primaryKey(),
		domainId: uuid('domain_id')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => domains.id, { onDelete: 'cascade' }),
		status: scanStatusEnum('status').notNull(),
		startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
		finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
		resultHash: text('result_hash'),
		discoveryMetadata: jsonb('discovery_metadata').$type<{
			discoveredSubdomains: string[];
			stats: {
				fromLinks: number;
				fromSitemap: number;
				totalConsidered: number;
				totalAccepted: number;
				truncated: boolean;
			};
			subdomainAssetCoverage: {
				subdomain: string;
				scannedAssetPaths: string[];
			}[];
		}>(),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			scansDomainIdStartedAtIdx: index('scans_domain_id_started_at_idx').on(
				table.domainId,
				table.startedAt.desc(),
			),
			scansDomainIdUniqueIdx: uniqueIndex('scans_domain_id_unique_idx').on(table.domainId),
		};
	},
);

export const findings = pgTable(
	'findings',
	{
		id: uuid('id').primaryKey(),
		scanId: uuid('scan_id')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => scans.id, { onDelete: 'cascade' }),
		checkId: text('check_id').notNull(),
		type: findingTypeEnum('type').notNull(),
		file: text('file').notNull(),
		snippet: text('snippet').notNull(),
		fingerprint: text('fingerprint').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			findingsFingerprintIdx: index('findings_fingerprint_idx').on(table.fingerprint),
			findingsScanIdIdx: index('findings_scan_id_idx').on(table.scanId),
		};
	},
);

// One row per domain storing the ETag/Last-Modified/bodyHash of every asset
// the last successful scan examined. The worker uses this to send conditional
// requests (If-None-Match) on the next scan — if all return 304, the full
// pipeline is skipped. Unique on domain_id so it upserts in place.
export const assetSnapshots = pgTable(
	'asset_snapshots',
	{
		id: uuid('id').primaryKey(),
		domainId: uuid('domain_id')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => domains.id, { onDelete: 'cascade' }),
		cache: jsonb('cache').$type<AssetCache>().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			assetSnapshotsDomainIdUniqueIdx: uniqueIndex('asset_snapshots_domain_id_unique_idx').on(
				table.domainId,
			),
		};
	},
);

export const mockEmails = pgTable('mock_emails', {
	id: uuid('id').primaryKey(),
	to: text('to').notNull(),
	subject: text('subject').notNull(),
	html: text('html').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const users = pgTable('users', {
	id: uuid('id').primaryKey(),
	email: text('email').notNull().unique(),
	stripeCustomerId: text('stripe_customer_id').unique(),
	isVerified: boolean('is_verified').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const loginTokens = pgTable(
	'login_tokens',
	{
		id: uuid('id').primaryKey(),
		email: text('email')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => users.email, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			loginTokensTokenHashIdx: index('login_tokens_token_hash_idx').on(table.tokenHash),
			loginTokensEmailIdx: index('login_tokens_email_idx').on(table.email),
		};
	},
);

export const userDomains = pgTable(
	'user_domains',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => users.id, { onDelete: 'cascade' }),
		domain: text('domain').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			userDomainsUserIdIdx: index('user_domains_user_id_idx').on(table.userId),
			userDomainsDomainIdx: index('user_domains_domain_idx').on(table.domain),
		};
	},
);

export const sessions = pgTable(
	'sessions',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			sessionsUserIdIdx: index('sessions_user_id_idx').on(table.userId),
		};
	},
);

// Long-lived bearer tokens that authenticate programmatic clients as the
// owning user. The raw key is shown to the user exactly once at creation time
// and never stored — only its SHA-256 hash is persisted. `prefix` holds the
// first 12 chars of the raw key (e.g. "sw_abcd1234") so the settings UI can
// help the user identify a key without revealing it.
export const apiKeys = pgTable(
	'api_keys',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			// eslint-disable-next-line custom/no-raw-functions
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		keyHash: text('key_hash').notNull().unique(),
		prefix: text('prefix').notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
	},
	// eslint-disable-next-line custom/no-raw-functions
	(table) => {
		return {
			apiKeysKeyHashIdx: uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
			apiKeysUserIdIdx: index('api_keys_user_id_idx').on(table.userId),
		};
	},
);
