import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	return {
		createBillingPortalSessionForUserMock: vi.fn(),
		listApiKeysMock: vi.fn(),
		createApiKeyMock: vi.fn(),
		revokeApiKeyMock: vi.fn(),
	};
});

vi.mock('../../auth/middleware.js', () => ({
	requireAuth: async (
		c: { set: (key: string, value: unknown) => void },
		next: () => Promise<void>,
	) => {
		c.set('user', {
			userId: '2484c6d0-2e27-4ebf-9f86-f8ba7bde87c7',
			email: 'billing@example.com',
			stripeCustomerId: null,
		});
		c.set('csrfToken', 'test-csrf-token');
		await next();
	},
}));

vi.mock('../../csrf/validateCsrf.js', () => ({
	validateCsrfToken: async (
		c: { set: (key: string, value: unknown) => void },
		next: () => Promise<void>,
	) => {
		await next();
	},
}));

vi.mock('../../billing/customerPortal.js', () => ({
	createBillingPortalSessionForUser: mocks.createBillingPortalSessionForUserMock,
}));

vi.mock('../confirmQuerySchema.js', () => ({
	buildConfirmUrl: async () => '/settings/confirm?token=test-token',
}));

vi.mock('../../auth/apiKeys.js', async () => {
	const actual =
		await vi.importActual<typeof import('../../auth/apiKeys.js')>('../../auth/apiKeys.js');
	return {
		...actual,
		listApiKeys: mocks.listApiKeysMock,
		createApiKey: mocks.createApiKeyMock,
		revokeApiKey: mocks.revokeApiKeyMock,
	};
});

import settingsRoutes, { resetBillingPortalRateLimitStateForTests } from './index.js';

const TEST_USER_ID = '2484c6d0-2e27-4ebf-9f86-f8ba7bde87c7';

beforeEach(() => {
	resetBillingPortalRateLimitStateForTests();
	mocks.listApiKeysMock.mockReset();
	mocks.createApiKeyMock.mockReset();
	mocks.revokeApiKeyMock.mockReset();
	mocks.listApiKeysMock.mockResolvedValue([]);
});

describe('GET /settings', () => {
	it('renders billing section with manage billing button when Stripe is configured', async () => {
		process.env.STRIPE_SECRET_KEY = 'sk_test_key';

		const response = await settingsRoutes.request('/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('Billing');
		expect(html).toContain('Manage billing');
		expect(html).toContain('action="/settings/billing/portal"');
		expect(html).not.toContain('Billing portal is unavailable');

		delete process.env.STRIPE_SECRET_KEY;
	});

	it('renders billing section with disabled button when Stripe is not configured', async () => {
		delete process.env.STRIPE_SECRET_KEY;

		const response = await settingsRoutes.request('/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('Billing');
		expect(html).toContain('disabled');
		expect(html).toContain('Billing portal is unavailable until Stripe is configured.');
	});

	it('renders the API Keys section with create form and empty state', async () => {
		mocks.listApiKeysMock.mockResolvedValue([]);

		const response = await settingsRoutes.request('/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('API Keys');
		expect(html).toContain('action="/settings/api-keys"');
		expect(html).toContain('No API keys yet.');
		expect(mocks.listApiKeysMock).toHaveBeenCalledWith(TEST_USER_ID);
	});

	it('lists existing API keys with revoke buttons', async () => {
		mocks.listApiKeysMock.mockResolvedValue([
			{
				id: '11111111-1111-1111-1111-111111111111',
				name: 'CI',
				prefix: 'sw_abcdef12',
				createdAt: new Date('2025-01-01T00:00:00.000Z'),
				lastUsedAt: null,
			},
		]);

		const response = await settingsRoutes.request('/');
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('CI');
		expect(html).toContain('sw_abcdef12…');
		expect(html).toContain('Never');
		expect(html).toContain('action="/settings/api-keys/11111111-1111-1111-1111-111111111111"');
		expect(html).toContain('Revoke');
	});

	it('renders and clears the new_api_key cookie on first display', async () => {
		mocks.listApiKeysMock.mockResolvedValue([]);

		const response = await settingsRoutes.request('/', {
			headers: {
				Cookie: 'new_api_key=sw_testvalue1234567890abcdef12345678',
			},
		});
		const html = await response.text();

		expect(response.status).toBe(200);
		expect(html).toContain('Copy your new API key now');
		expect(html).toContain('sw_testvalue1234567890abcdef12345678');
		// Cookie must be cleared so a refresh does not re-display the key.
		expect(response.headers.get('set-cookie')).toContain('new_api_key=;');
		expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
	});
});

describe('POST /settings/api-keys', () => {
	it('creates a key and redirects with the raw key in a one-time cookie', async () => {
		mocks.createApiKeyMock.mockResolvedValue({
			rawKey: 'sw_abcdef1234567890abcdef12345678',
			row: {
				id: '11111111-1111-1111-1111-111111111111',
				name: 'CI',
				prefix: 'sw_abcdef12',
				createdAt: new Date('2025-01-01T00:00:00.000Z'),
				lastUsedAt: null,
			},
		});

		const response = await settingsRoutes.request('/api-keys', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: 'CI' }).toString(),
		});

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('/settings');
		expect(response.headers.get('set-cookie')).toContain('new_api_key=');
		expect(response.headers.get('set-cookie')).toContain('Max-Age=60');
		expect(response.headers.get('set-cookie')).toContain('HttpOnly');
		expect(mocks.createApiKeyMock).toHaveBeenCalledWith(TEST_USER_ID, 'CI');
	});

	it('rejects an empty name with a flash message and redirect', async () => {
		const response = await settingsRoutes.request('/api-keys', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ name: '   ' }).toString(),
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/settings');
		expect(response.headers.get('set-cookie')).toContain('flash_message=');
		expect(mocks.createApiKeyMock).not.toHaveBeenCalled();
	});
});

describe('POST /settings/api-keys/:id', () => {
	it('revokes the key and redirects with a success flash', async () => {
		mocks.revokeApiKeyMock.mockResolvedValue(true);

		const response = await settingsRoutes.request(
			'/api-keys/11111111-1111-1111-1111-111111111111',
			{
				method: 'POST',
			},
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/settings');
		expect(response.headers.get('set-cookie')).toContain('API%20key%20revoked');
		expect(mocks.revokeApiKeyMock).toHaveBeenCalledWith(
			TEST_USER_ID,
			'11111111-1111-1111-1111-111111111111',
		);
	});

	it('reports not found when the key does not belong to the user', async () => {
		mocks.revokeApiKeyMock.mockResolvedValue(false);

		const response = await settingsRoutes.request(
			'/api-keys/11111111-1111-1111-1111-111111111111',
			{
				method: 'POST',
			},
		);

		expect(response.status).toBe(302);
		expect(response.headers.get('set-cookie')).toContain('API%20key%20not%20found');
	});

	it('rejects a malformed key id with a flash message', async () => {
		const response = await settingsRoutes.request('/api-keys/not-a-uuid', {
			method: 'POST',
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('set-cookie')).toContain('flash_message=');
		expect(mocks.revokeApiKeyMock).not.toHaveBeenCalled();
	});
});

describe('POST /settings/billing/portal', () => {
	it('rate limits billing portal requests after five attempts', async () => {
		process.env.STRIPE_SECRET_KEY = 'sk_test_key';
		mocks.createBillingPortalSessionForUserMock.mockClear();
		mocks.createBillingPortalSessionForUserMock.mockResolvedValue(
			'https://billing.stripe.com/p/session/test_123',
		);

		for (const [attempt] of Array.from({ length: 5 }).entries()) {
			const response = await settingsRoutes.request('/billing/portal', {
				method: 'POST',
				headers: {
					'X-Test-Attempt': String(attempt),
				},
			});

			expect(response.status).toBe(303);
			expect(response.headers.get('location')).toBe(
				'https://billing.stripe.com/p/session/test_123',
			);
		}

		const rateLimitedResponse = await settingsRoutes.request('/billing/portal', {
			method: 'POST',
		});

		expect(rateLimitedResponse.status).toBe(302);
		expect(rateLimitedResponse.headers.get('location')).toBe('/settings');
		expect(rateLimitedResponse.headers.get('set-cookie')).toContain('flash_message=');
		expect(mocks.createBillingPortalSessionForUserMock).toHaveBeenCalledTimes(5);

		delete process.env.STRIPE_SECRET_KEY;
	});

	it('creates a Stripe portal session and redirects to Stripe', async () => {
		process.env.STRIPE_SECRET_KEY = 'sk_test_key';
		mocks.createBillingPortalSessionForUserMock.mockResolvedValue(
			'https://billing.stripe.com/p/session/test_123',
		);

		const response = await settingsRoutes.request('/billing/portal', {
			method: 'POST',
		});

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('https://billing.stripe.com/p/session/test_123');
		expect(mocks.createBillingPortalSessionForUserMock).toHaveBeenCalledWith({
			userId: '2484c6d0-2e27-4ebf-9f86-f8ba7bde87c7',
			email: 'billing@example.com',
			stripeCustomerId: null,
		});

		delete process.env.STRIPE_SECRET_KEY;
	});

	it('sets a flash message and redirects back to settings on Stripe errors', async () => {
		process.env.STRIPE_SECRET_KEY = 'sk_test_key';
		mocks.createBillingPortalSessionForUserMock.mockRejectedValue(new Error('Stripe unavailable'));

		const response = await settingsRoutes.request('/billing/portal', {
			method: 'POST',
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/settings');
		expect(response.headers.get('set-cookie')).toContain('flash_message=');

		delete process.env.STRIPE_SECRET_KEY;
	});

	it('redirects back to settings with flash when Stripe is not configured', async () => {
		delete process.env.STRIPE_SECRET_KEY;
		mocks.createBillingPortalSessionForUserMock.mockClear();

		const response = await settingsRoutes.request('/billing/portal', {
			method: 'POST',
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/settings');
		expect(response.headers.get('set-cookie')).toContain('flash_message=');
		expect(mocks.createBillingPortalSessionForUserMock).not.toHaveBeenCalled();
	});
});
