import { z } from 'zod';

const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

export const getAppOrigin = z
	.function()
	.args()
	.returns(z.string())
	.implement(() => {
		const domain = process.env.DOMAIN?.trim();
		if (!domain) {
			return DEFAULT_APP_ORIGIN;
		}

		const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
		const normalizedDomain = domain.replace(/^https?:\/\//, '');

		try {
			return new URL(`${protocol}://${normalizedDomain}`).origin;
		} catch {
			return DEFAULT_APP_ORIGIN;
		}
	});

export const getAppBaseUrl = z
	.function()
	.args()
	.returns(z.string())
	.implement(() => {
		const domain = process.env.DOMAIN?.trim();
		const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
		return `${protocol}://${domain && domain.length > 0 ? domain : 'localhost:3000'}`;
	});

export const CLEAR_SESSION_COOKIE = 'session_id=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
