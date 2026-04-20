import * as crypto from 'node:crypto';
import { z } from 'zod';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

const stripeSecretKeySchema = z.string().min(1);
const appDomainSchema = z.string().min(1);

const stripeBillingPortalCreateAttemptsSchema = z.coerce.number().int().catch(2);

const getStripeClient = z
	.function()
	.args()
	.returns(z.custom<Stripe>())
	.implement(() => {
		const apiKey = stripeSecretKeySchema.parse(process.env.STRIPE_SECRET_KEY);
		return new Stripe(apiKey);
	});

const getAppBaseUrl = z
	.function()
	.args()
	.returns(z.string().url())
	.implement(() => {
		const raw = (process.env.DOMAIN ?? '').trim();
		const domain = appDomainSchema.parse(raw.length > 0 ? raw : 'localhost:3000');
		const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
		return `${protocol}://${domain}`;
	});

const getStripeBillingPortalCreateAttempts = z
	.function()
	.args()
	.returns(z.number().int().min(1).max(5))
	.implement(() => {
		const attempts = stripeBillingPortalCreateAttemptsSchema.parse(
			process.env.STRIPE_BILLING_PORTAL_CREATE_ATTEMPTS,
		);
		return Math.min(5, Math.max(1, attempts));
	});

const isRetryableStripePortalError = z
	.function()
	.args(z.unknown())
	.returns(z.boolean())
	.implement((error) => {
		if (!error || typeof error !== 'object') {
			return false;
		}

		const stripeLikeError = error as {
			type?: unknown;
			statusCode?: unknown;
		};
		const errorType = typeof stripeLikeError.type === 'string' ? stripeLikeError.type : null;
		const statusCode =
			typeof stripeLikeError.statusCode === 'number' ? stripeLikeError.statusCode : null;

		return (
			errorType === 'StripeConnectionError' ||
			errorType === 'StripeAPIError' ||
			errorType === 'StripeRateLimitError' ||
			(statusCode !== null && statusCode >= 500)
		);
	});

const createBillingPortalSessionWithRetry = z
	.function()
	.args(
		z.object({
			stripe: z.custom<Stripe>(),
			customerId: z.string().min(1),
			returnUrl: z.string().url(),
			idempotencyKey: z.string().min(1),
			attemptsRemaining: z.number().int().min(1),
		}),
	)
	.returns(z.promise(z.custom<Stripe.BillingPortal.Session>()))
	.implement(async ({ stripe, customerId, returnUrl, idempotencyKey, attemptsRemaining }) => {
		const createSession = async (
			remainingAttempts: number,
		): Promise<Stripe.BillingPortal.Session> => {
			try {
				return await stripe.billingPortal.sessions.create(
					{
						customer: customerId,
						return_url: returnUrl,
					},
					{ idempotencyKey },
				);
			} catch (error) {
				if (remainingAttempts <= 1 || !isRetryableStripePortalError(error)) {
					throw error;
				}

				return createSession(remainingAttempts - 1);
			}
		};

		return createSession(attemptsRemaining);
	});

const ensureStripeCustomerId = z
	.function()
	.args(
		z.object({
			userId: z.string().min(1),
			email: z.string().email(),
			stripeCustomerId: z.string().nullable(),
		}),
	)
	.returns(z.promise(z.string().min(1)))
	.implement(async ({ userId, email, stripeCustomerId }) => {
		if (stripeCustomerId) {
			return stripeCustomerId;
		}

		return db.transaction(async (tx) => {
			const [locked] = await tx
				.select({ stripeCustomerId: users.stripeCustomerId })
				.from(users)
				.where(eq(users.id, userId))
				.for('update');

			if (locked?.stripeCustomerId) {
				return locked.stripeCustomerId;
			}

			const stripe = getStripeClient();
			const customer = await stripe.customers.create({
				email,
				metadata: {
					userId,
				},
			});

			await tx.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, userId));

			return customer.id;
		});
	});

export const createBillingPortalSessionForUser = z
	.function()
	.args(
		z.object({
			userId: z.string().min(1),
			email: z.string().email(),
			stripeCustomerId: z.string().nullable(),
		}),
	)
	.returns(z.promise(z.string().url()))
	.implement(async (user) => {
		const mockUrl = process.env.STRIPE_BILLING_MOCK_URL;
		if (mockUrl) {
			return mockUrl;
		}

		const stripe = getStripeClient();

		// A Stripe Customer object is created eagerly when a user opens the billing portal
		// for the first time, even if they have never subscribed. This is required because
		// the Stripe Customer Portal API needs a customer ID to create a session. These
		// customer records will remain in Stripe even if the user never subscribes.
		const customerId = await ensureStripeCustomerId(user);
		const returnUrl = `${getAppBaseUrl()}/settings`;
		const idempotencyKey = `billing-portal:${user.userId}:${crypto.randomUUID()}`;
		const session = await createBillingPortalSessionWithRetry({
			stripe,
			customerId,
			returnUrl,
			idempotencyKey,
			attemptsRemaining: getStripeBillingPortalCreateAttempts(),
		});

		return session.url;
	});
