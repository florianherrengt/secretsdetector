import { expect, test } from './fixtures/authed';

test.describe('CSRF Protection', () => {
	test('POST /domains succeeds with valid CSRF token', async ({ request, authHeaders }) => {
		const listResponse = await request.get('/domains', { headers: authHeaders });
		const csrfMatch = (await listResponse.text()).match(/name="_csrf" value="([^"]+)"/);

		expect(csrfMatch).not.toBeNull();
		const csrfToken = csrfMatch![1];

		const response = await request.post('/domains', {
			headers: {
				...authHeaders,
				'content-type': 'application/x-www-form-urlencoded',
				Origin: 'http://127.0.0.1:3000',
			},
			form: { domain: 'csrf-test.com', _csrf: csrfToken },
			maxRedirects: 0,
		});

		expect(response.status()).toBe(302);
		expect(response.headers()['location']).toBe('/domains');
	});

	test('POST /domains returns 403 with wrong CSRF token', async ({ request, authHeaders }) => {
		await request.get('/domains', { headers: authHeaders });

		const response = await request.post('/domains', {
			headers: {
				...authHeaders,
				'content-type': 'application/x-www-form-urlencoded',
				Origin: 'http://127.0.0.1:3000',
			},
			form: { domain: 'csrf-test.com', _csrf: 'wrong-token' },
		});

		expect(response.status()).toBe(403);
		const html = await response.text();
		expect(html).toContain('data-testid="csrf-forbidden"');
	});

	test('POST /domains returns 403 without CSRF token', async ({ request, authHeaders }) => {
		const response = await request.post('/domains', {
			headers: {
				...authHeaders,
				'content-type': 'application/x-www-form-urlencoded',
				Origin: 'http://127.0.0.1:3000',
			},
			form: { domain: 'csrf-test.com' },
		});

		expect(response.status()).toBe(403);
		const html = await response.text();
		expect(html).toContain('data-testid="csrf-forbidden"');
	});

	test('POST /scan works without CSRF token (unauthenticated)', async ({ request }) => {
		const response = await request.post('/scan', {
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				Origin: 'http://127.0.0.1:3000',
			},
			form: {
				domain: 'example.com',
				visitorFingerprint: 'fp-test-' + Date.now(),
			},
			maxRedirects: 0,
		});

		expect(response.status()).toBe(302);
		expect(response.headers()['location']).toMatch(/^\/scan\/[a-f0-9-]+$/);
	});
});
