import { z } from 'zod';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { render } from '../../../lib/response.js';
import { settingsPagePropsSchema, SettingsPage } from '../../../views/pages/settings.js';
import { buildConfirmUrl } from '../confirmQuerySchema.js';
import { createConfirmHandlers } from '../confirmHandlerFactory.js';
import { deleteAccount } from '../../auth/index.js';
import { getEmailProvider } from '../../email/index.js';
import { requireAuth, extractSessionId } from '../../auth/middleware.js';
import { validateCsrfToken } from '../../csrf/validateCsrf.js';
import { csrfTokenStore } from '../../csrf/csrfTokenStore.js';
import { setFlashMessage } from '../../../lib/flash.js';
import { createBillingPortalSessionForUser } from '../../billing/customerPortal.js';
import { isStripeConfigured } from '../../billing/config.js';
import { getAppOrigin, CLEAR_SESSION_COOKIE } from '../../config.js';

const settingsRoutes = new Hono();
const DEFAULT_BILLING_PORTAL_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_BILLING_PORTAL_RATE_LIMIT_MAX_REQUESTS = 5;
const MINIMUM_BILLING_PORTAL_RATE_LIMIT_WINDOW_MS = 1_000;
const MINIMUM_BILLING_PORTAL_RATE_LIMIT_MAX_REQUESTS = 1;

const parsedBillingPortalRateLimitWindowMs = Number(
	process.env.BILLING_PORTAL_RATE_LIMIT_WINDOW_MS ??
		String(DEFAULT_BILLING_PORTAL_RATE_LIMIT_WINDOW_MS),
);
const parsedBillingPortalRateLimitMaxRequests = Number(
	process.env.BILLING_PORTAL_RATE_LIMIT_MAX_REQUESTS ??
		String(DEFAULT_BILLING_PORTAL_RATE_LIMIT_MAX_REQUESTS),
);

const billingPortalRateLimitWindowMs = Math.max(
	MINIMUM_BILLING_PORTAL_RATE_LIMIT_WINDOW_MS,
	Number.isFinite(parsedBillingPortalRateLimitWindowMs)
		? Math.floor(parsedBillingPortalRateLimitWindowMs)
		: DEFAULT_BILLING_PORTAL_RATE_LIMIT_WINDOW_MS,
);
const billingPortalRateLimitMaxRequests = Math.max(
	MINIMUM_BILLING_PORTAL_RATE_LIMIT_MAX_REQUESTS,
	Number.isFinite(parsedBillingPortalRateLimitMaxRequests)
		? Math.floor(parsedBillingPortalRateLimitMaxRequests)
		: DEFAULT_BILLING_PORTAL_RATE_LIMIT_MAX_REQUESTS,
);

const billingPortalRateLimitState = {
	requestTimesByActor: new Map<string, number[]>(),
};

const isBillingPortalRateLimited = z
	.function()
	.args(z.string().min(1))
	.returns(z.boolean())
	.implement((actorKey) => {
		const now = Date.now();
		const windowStart = now - billingPortalRateLimitWindowMs;
		const recentRequestTimes = (
			billingPortalRateLimitState.requestTimesByActor.get(actorKey) ?? []
		).filter((timestamp) => timestamp >= windowStart);

		if (recentRequestTimes.length >= billingPortalRateLimitMaxRequests) {
			billingPortalRateLimitState.requestTimesByActor.set(actorKey, recentRequestTimes);
			return true;
		}

		billingPortalRateLimitState.requestTimesByActor.set(actorKey, [...recentRequestTimes, now]);
		return false;
	});

export const resetBillingPortalRateLimitStateForTests = z
	.function()
	.args()
	.returns(z.void())
	.implement(() => {
		billingPortalRateLimitState.requestTimesByActor.clear();
	});

const hasTrustedRequestOrigin = z
	.function()
	.args(z.string().optional(), z.string().optional())
	.returns(z.boolean())
	.implement((originHeader, refererHeader) => {
		const appOrigin = getAppOrigin();

		const headerValues = [originHeader, refererHeader];
		for (const headerValue of headerValues) {
			if (!headerValue) {
				continue;
			}

			try {
				if (new URL(headerValue).origin !== appOrigin) {
					return false;
				}
			} catch {
				return false;
			}
		}

		return true;
	});

settingsRoutes.use('*', requireAuth);

settingsRoutes.get(
	'/',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const user = c.get('user');
			const flashMessage = c.get('flash');
			const viewProps = settingsPagePropsSchema.parse({
				email: user.email,
				message: flashMessage ?? undefined,
				billingPortalActionUrl: '/settings/billing/portal',
				canManageBilling: isStripeConfigured(),
				deleteAccountUrl: await buildConfirmUrl(
					'delete_account',
					user.userId,
					undefined,
					'/settings',
				),
				csrfToken: c.get('csrfToken'),
			});

			return c.html(render(SettingsPage, viewProps));
		}),
);

settingsRoutes.post(
	'/billing/portal',
	validateCsrfToken,
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			const user = c.get('user');
			const actorKey = `user:${user.userId}`;

			if (!hasTrustedRequestOrigin(c.req.header('Origin'), c.req.header('Referer'))) {
				setFlashMessage(c, 'Invalid billing request. Please refresh and try again.');
				return c.redirect('/settings', 302);
			}

			if (!isStripeConfigured()) {
				setFlashMessage(c, 'Billing is not configured. Please try again later.');
				return c.redirect('/settings', 302);
			}

			if (isBillingPortalRateLimited(actorKey)) {
				setFlashMessage(c, 'Too many billing portal requests. Please wait a minute and try again.');
				return c.redirect('/settings', 302);
			}

			try {
				const portalUrl = await createBillingPortalSessionForUser(user);
				return c.redirect(portalUrl, 303);
			} catch (error) {
				console.error('Failed to create billing portal session', error);
				setFlashMessage(c, 'Unable to open billing portal right now. Please try again.');
				return c.redirect('/settings', 302);
			}
		}),
);

const handleDeleteAccount = z
	.function()
	.args(z.custom<Context>(), z.custom<{ action: string; context: Record<string, string> }>())
	.returns(z.promise(z.instanceof(Response)))
	.implement(async (c) => {
		const user = c.get('user');
		const sessionId = extractSessionId(c);
		await deleteAccount(user.userId);

		if (sessionId) {
			await csrfTokenStore.del(sessionId);
		}

		try {
			const emailProvider = getEmailProvider();
			await emailProvider.send({
				to: user.email,
				subject: 'Account deleted',
				html: '<p>Your account has been deleted.</p>',
			});
		} catch (error) {
			console.error('Failed to send account deletion email', error);
		}

		setFlashMessage(c, 'Your account has been deleted.');
		c.header('Set-Cookie', CLEAR_SESSION_COOKIE, {
			append: true,
		});

		return c.redirect('/', 302);
	});

const { getConfirmHandler, postConfirmHandler } = createConfirmHandlers('/settings', {
	delete_account: handleDeleteAccount,
});

settingsRoutes.get(
	'/confirm',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(getConfirmHandler),
);

settingsRoutes.post(
	'/confirm',
	validateCsrfToken,
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(postConfirmHandler),
);

export default settingsRoutes;
