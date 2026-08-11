import { createHash, randomBytes, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const generateToken = z
	.function()
	.args()
	.returns(z.string())
	.implement(() => {
		return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
	});

// API keys use a recognizable prefix so they can be detected by secret
// scanners (including this app's own pipeline) and rejected if accidentally
// committed. Format: `sw_` + 32 hex chars. The full raw key is 35 chars.
export const API_KEY_PREFIX = 'sw_';
const API_KEY_RANDOM_LENGTH = 32;

export const apiKeySchema = z
	.string()
	.regex(new RegExp(`^${API_KEY_PREFIX}[0-9a-f]{${API_KEY_RANDOM_LENGTH}}$`, 'u'));

export const generateApiKey = z
	.function()
	.args()
	.returns(z.string())
	.implement(() => {
		return API_KEY_PREFIX + randomBytes(API_KEY_RANDOM_LENGTH / 2).toString('hex');
	});

// Returns the bearer token from an `Authorization: Bearer <token>` header, or
// null if the header is absent or malformed. Intentionally permissive on
// whitespace, strict on the scheme — only `Bearer` is recognised so a leaked
// `Basic`-style header is never accidentally treated as an API key.
export const extractBearerToken = z
	.function()
	.args(z.string().nullable().optional())
	.returns(z.nullable(z.string()))
	.implement((header) => {
		if (!header) {
			return null;
		}

		const match = header.match(/^\s*Bearer\s+([^\s]+)\s*$/u);
		return match?.[1] ?? null;
	});

export const timingSafeEqual = z
	.function()
	.args(z.string(), z.string())
	.returns(z.boolean())
	.implement((a, b) => {
		const bufA = Buffer.from(a, 'utf-8');
		const bufB = Buffer.from(b, 'utf-8');
		if (bufA.length === 0 || bufB.length === 0) return false;
		// nodeTimingSafeEqual throws on length mismatch, and returning early on
		// a length difference would itself leak the expected length by timing.
		// Compare against a same-length dummy to keep the cost constant, then
		// return false: the real result is always "not equal" when lengths
		// differ.
		if (bufA.length !== bufB.length) {
			const dummy = Buffer.alloc(bufA.length);
			try {
				nodeTimingSafeEqual(bufA, dummy);
			} catch {
				// ignore — we only need the CPU cost
			}
			return false;
		}
		try {
			return nodeTimingSafeEqual(bufA, bufB);
		} catch {
			return false;
		}
	});

export const hashToken = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((token) => {
		return createHash('sha256').update(token).digest('hex');
	});
