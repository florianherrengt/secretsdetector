import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	return {
		stripeCustomersCreateMock: vi.fn(),
		stripeBillingPortalSessionsCreateMock: vi.fn(),
		dbTransactionMock: vi.fn(),
		dbSelectMock: vi.fn(),
		dbUpdateMock: vi.fn(),
	};
});

const mockSelectChain = {
	from: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnThis(),
	for: vi.fn().mockReturnValue([{ stripeCustomerId: null }]),
};

const mockUpdateChain = {
	set: vi.fn().mockReturnThis(),
	where: vi.fn().mockReturnValue(Promise.resolve()),
};

vi.mock('stripe', () => {
	const mockInstance = {
		customers: {
			create: mocks.stripeCustomersCreateMock,
		},
		billingPortal: {
			sessions: {
				create: mocks.stripeBillingPortalSessionsCreateMock,
			},
		},
	};
	return {
		default: vi.fn(function (this: unknown) {
			return mockInstance;
		}),
	};
});

vi.mock('../db/client.js', () => ({
	db: {
		transaction: mocks.dbTransactionMock,
	},
}));

vi.mock('../db/schema.js', () => ({
	users: {
		id: 'id',
		stripeCustomerId: 'stripe_customer_id',
	},
}));

import { createBillingPortalSessionForUser } from './customerPortal.js';

describe('createBillingPortalSessionForUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.STRIPE_SECRET_KEY = 'sk_test_key';
		process.env.DOMAIN = 'localhost:3000';
		process.env.NODE_ENV = 'test';
	});

	afterEach(() => {
		delete process.env.STRIPE_SECRET_KEY;
		delete process.env.DOMAIN;
		delete process.env.NODE_ENV;
	});

	it('returns existing Stripe customer ID when stripeCustomerId is set', async () => {
		mocks.stripeBillingPortalSessionsCreateMock.mockResolvedValue({
			url: 'https://billing.stripe.com/p/session/existing',
		});

		const result = await createBillingPortalSessionForUser({
			userId: 'user-1',
			email: 'test@example.com',
			stripeCustomerId: 'cus_existing123',
		});

		expect(result).toBe('https://billing.stripe.com/p/session/existing');
		expect(mocks.stripeBillingPortalSessionsCreateMock).toHaveBeenCalledWith(
			{
				customer: 'cus_existing123',
				return_url: 'http://localhost:3000/settings',
			},
			{
				idempotencyKey: expect.any(String),
			},
		);
		expect(mocks.stripeCustomersCreateMock).not.toHaveBeenCalled();
	});

	it('retries billing portal session creation for retryable Stripe errors', async () => {
		mocks.stripeBillingPortalSessionsCreateMock
			.mockRejectedValueOnce({ type: 'StripeConnectionError' })
			.mockResolvedValueOnce({
				url: 'https://billing.stripe.com/p/session/retry-success',
			});

		const result = await createBillingPortalSessionForUser({
			userId: 'user-retry',
			email: 'retry@example.com',
			stripeCustomerId: 'cus_retry123',
		});

		expect(result).toBe('https://billing.stripe.com/p/session/retry-success');
		expect(mocks.stripeBillingPortalSessionsCreateMock).toHaveBeenCalledTimes(2);

		const firstCallOptions = mocks.stripeBillingPortalSessionsCreateMock.mock.calls[0]?.[1];
		const secondCallOptions = mocks.stripeBillingPortalSessionsCreateMock.mock.calls[1]?.[1];

		expect(firstCallOptions).toEqual({
			idempotencyKey: expect.any(String),
		});
		expect(secondCallOptions).toEqual({
			idempotencyKey: firstCallOptions?.idempotencyKey,
		});
	});

	it('does not retry billing portal session creation for non-retryable Stripe errors', async () => {
		mocks.stripeBillingPortalSessionsCreateMock.mockRejectedValue({
			type: 'StripeInvalidRequestError',
		});

		await expect(
			createBillingPortalSessionForUser({
				userId: 'user-no-retry',
				email: 'no-retry@example.com',
				stripeCustomerId: 'cus_no_retry123',
			}),
		).rejects.toMatchObject({
			type: 'StripeInvalidRequestError',
		});

		expect(mocks.stripeBillingPortalSessionsCreateMock).toHaveBeenCalledTimes(1);
	});

	it('creates a new Stripe customer when stripeCustomerId is null', async () => {
		mocks.stripeCustomersCreateMock.mockResolvedValue({ id: 'cus_new123' });
		mocks.stripeBillingPortalSessionsCreateMock.mockResolvedValue({
			url: 'https://billing.stripe.com/p/session/new',
		});
		mocks.dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
			const tx = {
				select: () => mockSelectChain,
				update: () => mockUpdateChain,
			};
			return fn(tx);
		});

		const result = await createBillingPortalSessionForUser({
			userId: 'user-2',
			email: 'new@example.com',
			stripeCustomerId: null,
		});

		expect(result).toBe('https://billing.stripe.com/p/session/new');
		expect(mocks.stripeCustomersCreateMock).toHaveBeenCalledWith({
			email: 'new@example.com',
			metadata: { userId: 'user-2' },
		});
	});

	it('throws when STRIPE_SECRET_KEY is missing', async () => {
		delete process.env.STRIPE_SECRET_KEY;

		await expect(
			createBillingPortalSessionForUser({
				userId: 'user-3',
				email: 'test@example.com',
				stripeCustomerId: 'cus_123',
			}),
		).rejects.toThrow();
	});

	it('uses https in production', async () => {
		process.env.NODE_ENV = 'production';
		process.env.DOMAIN = 'example.com';
		mocks.stripeBillingPortalSessionsCreateMock.mockResolvedValue({
			url: 'https://billing.stripe.com/p/session/prod',
		});

		await createBillingPortalSessionForUser({
			userId: 'user-4',
			email: 'test@example.com',
			stripeCustomerId: 'cus_123',
		});

		expect(mocks.stripeBillingPortalSessionsCreateMock).toHaveBeenCalledWith(
			{
				customer: 'cus_123',
				return_url: 'https://example.com/settings',
			},
			{
				idempotencyKey: expect.any(String),
			},
		);
	});

	it('returns mock URL when STRIPE_BILLING_MOCK_URL is set', async () => {
		process.env.STRIPE_BILLING_MOCK_URL = 'https://mock.stripe.com/portal';

		const result = await createBillingPortalSessionForUser({
			userId: 'user-5',
			email: 'mock@example.com',
			stripeCustomerId: null,
		});

		expect(result).toBe('https://mock.stripe.com/portal');
		expect(mocks.stripeBillingPortalSessionsCreateMock).not.toHaveBeenCalled();
		expect(mocks.stripeCustomersCreateMock).not.toHaveBeenCalled();

		delete process.env.STRIPE_BILLING_MOCK_URL;
	});
});
