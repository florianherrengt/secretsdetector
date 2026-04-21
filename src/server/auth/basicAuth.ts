import { z } from 'zod';
import type { Context, Next } from 'hono';
import { timingSafeEqual } from './crypto.js';
import { isResponse } from './middleware.js';

const parseBasicHeader = z
	.function()
	.args(z.string())
	.returns(z.nullable(z.tuple([z.string(), z.string()])))
	.implement((header) => {
		const match = header.match(/^Basic\s+(.+)$/i);
		if (!match) return null;
		try {
			const decoded = atob(match[1]);
			const colonIndex = decoded.indexOf(':');
			if (colonIndex === -1) return null;
			return [decoded.slice(0, colonIndex), decoded.slice(colonIndex + 1)];
		} catch {
			return null;
		}
	});

export const requireBasicAuth = z
	.function()
	.args(z.custom<Context>(), z.custom<Next>())
	.returns(z.promise(z.instanceof(Response)))
	.implement(async (c, next) => {
		const expectedUser = process.env.ADMIN_BASIC_AUTH_USERNAME ?? '';
		const expectedPass = process.env.ADMIN_BASIC_AUTH_PASSWORD ?? '';

		if (!expectedUser || !expectedPass) {
			console.error('ADMIN_BASIC_AUTH_USERNAME and ADMIN_BASIC_AUTH_PASSWORD must be set');
			return new Response('Admin auth not configured', { status: 500 });
		}

		const authHeader = c.req.header('Authorization') ?? '';
		const parsed = parseBasicHeader(authHeader);

		if (!parsed) {
			return new Response('Authentication required', {
				status: 401,
				headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
			});
		}

		const [username, password] = parsed;

		if (!timingSafeEqual(username, expectedUser) || !timingSafeEqual(password, expectedPass)) {
			return new Response('Invalid credentials', {
				status: 401,
				headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
			});
		}

		const result = await next();

		if (isResponse(result)) {
			return result;
		}

		return new Response(null, { status: 404 });
	});
