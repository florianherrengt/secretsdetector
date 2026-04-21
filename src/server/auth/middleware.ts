import { z } from 'zod';
import type { Context, Next } from 'hono';
import { getSession } from './index.js';

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
		return c.req.header('cookie')?.match(/session_id=([^;]+)/)?.[1] ?? null;
	});

export const requireAuth = z
	.function()
	.args(z.custom<Context>(), z.custom<Next>())
	.returns(z.promise(z.instanceof(Response)))
	.implement(async (c, next) => {
		const sessionId = extractSessionId(c);

		if (!sessionId) {
			return c.json({ error: 'Authentication required' }, 401);
		}

		const user = await getSession(sessionId);

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
