import { describe, expect, it } from 'vitest';
import { db } from './client.js';
import { sql } from 'drizzle-orm';

const expectedIndexes = [
	{ name: 'findings_fingerprint_idx', table: 'findings', defContains: '(fingerprint)' },
	{ name: 'findings_scan_id_idx', table: 'findings', defContains: '(scan_id)' },
	{ name: 'scans_domain_id_started_at_idx', table: 'scans', defContains: '(domain_id' },
	{ name: 'scans_domain_id_started_at_idx', table: 'scans', defContains: 'started_at DESC' },
	{ name: 'login_tokens_token_hash_idx', table: 'login_tokens', defContains: '(token_hash)' },
	{ name: 'login_tokens_email_idx', table: 'login_tokens', defContains: '(email)' },
	{ name: 'user_domains_user_id_idx', table: 'user_domains', defContains: '(user_id)' },
	{ name: 'user_domains_domain_idx', table: 'user_domains', defContains: '(domain)' },
	{ name: 'sessions_user_id_idx', table: 'sessions', defContains: '(user_id)' },
];

describe('database indexes', () => {
	for (const { name, table, defContains } of expectedIndexes) {
		it(`should have index ${name} on ${table} containing ${defContains}`, async () => {
			const result = await db.execute(
				sql`SELECT tablename, indexdef FROM pg_indexes WHERE indexname = ${name}`,
			);
			expect(result.rows.length).toBeGreaterThan(0);
			expect(result.rows[0].tablename).toBe(table);
			expect(result.rows[0].indexdef).toContain(defContains);
		});
	}

	it('should not have findings_check_id_fingerprint_idx', async () => {
		const result = await db.execute(
			sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'findings_check_id_fingerprint_idx'`,
		);
		expect(result.rows.length).toBe(0);
	});
});
