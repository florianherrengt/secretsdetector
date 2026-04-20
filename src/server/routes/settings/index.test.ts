import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	return {
		createBillingPortalSessionForUserMock: vi.fn(),
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
		await next();
	},
}));

vi.mock('../../billing/customerPortal.js', () => ({
	createBillingPortalSessionForUser: mocks.createBillingPortalSessionForUserMock,
}));

vi.mock('../confirmQuerySchema.js', () => ({
	buildConfirmUrl: async () => '/settings/confirm?token=test-token',
}));

import settingsRoutes, { resetBillingPortalRateLimitStateForTests } from './index.js';

beforeEach(() => {
	resetBillingPortalRateLimitStateForTests();
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

	it('redirects back to settings with flash when Origin is cross-origin', async () => {
		process.env.STRIPE_SECRET_KEY = 'sk_test_key';
		mocks.createBillingPortalSessionForUserMock.mockClear();

		const response = await settingsRoutes.request('/billing/portal', {
			method: 'POST',
			headers: {
				Origin: 'https://evil.example',
			},
		});

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/settings');
		expect(response.headers.get('set-cookie')).toContain('flash_message=');
		expect(mocks.createBillingPortalSessionForUserMock).not.toHaveBeenCalled();

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
