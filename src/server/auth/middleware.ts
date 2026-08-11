import { z } from 'zod';
import type { Context, Next } from 'hono';
import { getSession } from './index.js';
import { resolveUserByApiKey } from './apiKeys.js';
import { extractBearerToken } from './crypto.js';

type SessionUser = Awaited<ReturnType<typeof getSession>>;

// `sessionUser` and `user` mean the same thing for session auth, but for API
// key auth we set only `user` (there is no session). Callers that need to know
// which transport authenticated the request can read `authMethod`.
export type AuthMethod = 'session' | 'api_key';

export const isResponse = z
	.function()
	.args(z.unknown())
	.returns(z.boolean())
	.implement((value) => {
		return value !== null && typeof value === 'object' && 'status' in value && 'headers' in value;
	}) as (value: unknown) => value is Response;

export const extractSessionId = z
	.function()
	.args(z.custom<Context>())
	.returns(z.nullable(z.string()))
	.implement((c) => {
		const existingSessionId = c.get('sessionId') as string | null | undefined;

		if (existingSessionId !== undefined) {
			return existingSessionId;
		}

		return c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1] ?? null;
	});

export const getSessionContextUser = z
	.function()
	.args(z.custom<Context>())
	.returns(z.promise(z.custom<SessionUser>()))
	.implement(async (c) => {
		const existingSessionUser = c.get('sessionUser') as SessionUser | undefined;

		if (existingSessionUser !== undefined) {
			return existingSessionUser;
		}

		// Try session cookie first, then fall back to an Authorization: Bearer
		// API key. They produce the same user-context shape, so downstream
		// `requireAuth`/handlers stay transport-agnostic.
		const sessionId = extractSessionId(c);

		if (sessionId) {
			const sessionUser = await getSession(sessionId);
			c.set('sessionId', sessionId);
			c.set('sessionUser', sessionUser);
			c.set('authMethod', 'session' satisfies AuthMethod);

			if (sessionUser) {
				c.set('user', sessionUser);
			}

			return sessionUser;
		}

		c.set('sessionId', null);

		const bearer = extractBearerToken(c.req.header('authorization'));

		if (!bearer) {
			c.set('sessionUser', null);
			return null;
		}

		const apiKeyUser = await resolveUserByApiKey(bearer);

		if (!apiKeyUser) {
			c.set('sessionUser', null);
			return null;
		}

		const userContext = {
			userId: apiKeyUser.userId,
			email: apiKeyUser.email,
			stripeCustomerId: apiKeyUser.stripeCustomerId,
		};

		// API key auth has no session; leave sessionUser null so session-scoped
		// helpers (CSRF token lookup, logout) know there is no session to act
		// on. The user context is what handlers actually consume.
		c.set('sessionUser', null);
		c.set('user', userContext);
		c.set('authMethod', 'api_key' satisfies AuthMethod);
		c.set('apiKeyId', apiKeyUser.keyId);

		return userContext;
	});

export const sessionContextMiddleware = z
	.function()
	.args(z.custom<Context>(), z.custom<Next>())
	.returns(z.promise(z.void()))
	.implement(async (c, next) => {
		await getSessionContextUser(c);
		await next();
	});

export const requireAuth = z
	.function()
	.args(z.custom<Context>(), z.custom<Next>())
	.returns(z.promise(z.instanceof(Response)))
	.implement(async (c, next) => {
		const sessionId = extractSessionId(c);
		const bearer = extractBearerToken(c.req.header('authorization'));

		if (!sessionId && !bearer) {
			return c.json(
				{
					error:
						'Authentication required. Please sign in to access this feature — unauthenticated access is not allowed for security reasons.',
				},
				401,
			);
		}

		const user = await getSessionContextUser(c);

		if (!user) {
			return c.json({ error: 'Invalid or expired session' }, 401);
		}

		c.set('user', user);
		const result = await next();

		if (isResponse(result)) {
			return result;
		}

		return c.text('', 200);
	});
