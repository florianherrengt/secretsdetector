import { z } from 'zod';
import type { Context, Next } from 'hono';
import { extractSessionId } from '../auth/middleware.js';
import { getSession } from '../auth/index.js';
import { generateToken } from '../auth/crypto.js';
import { csrfTokenStore, CSRF_TOKEN_TTL_SECONDS } from './csrfTokenStore.js';

export const csrfTokenInjection = z
	.function()
	.args(z.custom<Context>(), z.custom<Next>())
	.returns(z.promise(z.void()))
	.implement(async (c, next) => {
		const sessionId = extractSessionId(c);

		if (!sessionId) {
			await next();
			return;
		}

		const session = await getSession(sessionId);

		if (!session) {
			await next();
			return;
		}

		const rawToken = generateToken();
		const createdToken = await csrfTokenStore.createIfMissing(
			sessionId,
			rawToken,
			CSRF_TOKEN_TTL_SECONDS,
		);

		const csrfToken =
			createdToken ??
			(await (async () => {
				const existing = await csrfTokenStore.get(sessionId);
				if (existing) {
					await csrfTokenStore.set(sessionId, existing, CSRF_TOKEN_TTL_SECONDS);
					return existing;
				}
				return null;
			})());

		if (csrfToken) {
			c.set('csrfToken', csrfToken);
		}

		await next();
	});
