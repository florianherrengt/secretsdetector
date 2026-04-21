import { createHash } from 'node:crypto';
import { z } from 'zod';

export const generateToken = z
	.function()
	.args()
	.returns(z.string())
	.implement(() => {
		return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
	});

export const timingSafeEqual = z
	.function()
	.args(z.string(), z.string())
	.returns(z.boolean())
	.implement((a, b) => {
		const bufA = new TextEncoder().encode(a);
		const bufB = new TextEncoder().encode(b);
		if (bufA.length !== bufB.length) {
			return false;
		}
		return bufA.every((byte, i) => byte === bufB[i]) && bufA.length > 0;
	});

export const hashToken = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((token) => {
		return createHash('sha256').update(token).digest('hex');
	});
