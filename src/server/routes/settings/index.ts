import { z } from 'zod';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { render } from '../../../lib/response.js';
import { settingsPagePropsSchema, SettingsPage } from '../../../views/pages/settings.js';
import { buildConfirmUrl } from '../confirmQuerySchema.js';
import { createConfirmHandlers } from '../confirmHandlerFactory.js';
import { deleteAccount } from '../../auth/index.js';
import { createApiKey, listApiKeys, revokeApiKey, apiKeyNameSchema } from '../../auth/apiKeys.js';
import { getEmailProvider } from '../../email/index.js';
import { requireAuth, extractSessionId } from '../../auth/middleware.js';
import { validateCsrfToken } from '../../csrf/validateCsrf.js';
import { csrfTokenStore } from '../../csrf/csrfTokenStore.js';
import { setFlashMessage } from '../../../lib/flash.js';
import { createBillingPortalSessionForUser } from '../../billing/customerPortal.js';
import { isStripeConfigured } from '../../billing/config.js';
import { CLEAR_SESSION_COOKIE } from '../../config.js';

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

settingsRoutes.use('*', requireAuth);

// Cookie name for one-time display of a freshly created API key. HttpOnly +
// SameSite=Lax so it is unreachable from JS and not sent on cross-site
// requests. Short Max-Age: it only needs to survive the POST→302→GET round
// trip. The GET handler clears it as soon as the key is rendered.
const NEW_API_KEY_COOKIE = 'new_api_key';
const NEW_API_KEY_COOKIE_OPTIONS = 'Path=/settings; HttpOnly; SameSite=Lax';

const buildApiKeyEntriesForView = z
	.function()
	.args(z.string().uuid())
	.returns(
		z.promise(
			z.array(
				z.object({
					id: z.string().uuid(),
					name: z.string(),
					prefix: z.string(),
					createdAtIso: z.string(),
					lastUsedIso: z.string().nullable(),
				}),
			),
		),
	)
	.implement(async (userId) => {
		const rows = await listApiKeys(userId);
		return rows.map((row) => ({
			id: row.id,
			name: row.name,
			prefix: row.prefix,
			createdAtIso: row.createdAt.toISOString(),
			lastUsedIso: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
		}));
	});

settingsRoutes.get(
	'/',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const user = c.get('user');
			const flashMessage = c.get('flash');

			// Drain the one-time API key cookie. Absent for normal page loads.
			const newlyCreatedApiKey = c.req
				.header('cookie')
				?.match(new RegExp(`${NEW_API_KEY_COOKIE}=([^;]+)`))?.[1];
			const decodedNewKey = newlyCreatedApiKey
				? safeDecodeCookieValue(newlyCreatedApiKey)
				: undefined;

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
				apiKeys: await buildApiKeyEntriesForView(user.userId),
				newlyCreatedApiKey: decodedNewKey,
				createApiKeyActionUrl: '/settings/api-keys',
				revokeApiKeyActionUrlBase: '/settings/api-keys',
			});

			if (newlyCreatedApiKey) {
				// Set the clear-cookie BEFORE c.html builds the Response — headers
				// tracked on the context are applied when the Response is created.
				c.header(`Set-Cookie`, `${NEW_API_KEY_COOKIE}=; ${NEW_API_KEY_COOKIE_OPTIONS}; Max-Age=0`, {
					append: true,
				});
			}

			return c.html(render(SettingsPage, viewProps));
		}),
);

const safeDecodeCookieValue = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((value) => {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	});

settingsRoutes.post(
	'/api-keys',
	validateCsrfToken,
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			const user = c.get('user');
			const body = await c.req.parseBody();
			const parsedName = apiKeyNameSchema.safeParse(typeof body.name === 'string' ? body.name : '');

			if (!parsedName.success) {
				setFlashMessage(c, 'Please provide a name for the API key (1–80 characters).');
				return c.redirect('/settings', 302);
			}

			const created = await createApiKey(user.userId, parsedName.data);

			c.header(
				'Set-Cookie',
				`${NEW_API_KEY_COOKIE}=${encodeURIComponent(created.rawKey)}; ${NEW_API_KEY_COOKIE_OPTIONS}; Max-Age=60`,
				{ append: true },
			);

			return c.redirect('/settings', 303);
		}),
);

const revokeParamsSchema = z.object({
	id: z.string().uuid(),
});

settingsRoutes.post(
	'/api-keys/:id',
	validateCsrfToken,
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			const user = c.get('user');
			const parsedParams = revokeParamsSchema.safeParse({ id: c.req.param('id') });

			if (!parsedParams.success) {
				setFlashMessage(c, 'Invalid API key.');
				return c.redirect('/settings', 302);
			}

			const didRevoke = await revokeApiKey(user.userId, parsedParams.data.id);

			setFlashMessage(c, didRevoke ? 'API key revoked.' : 'API key not found.');
			return c.redirect('/settings', 302);
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
