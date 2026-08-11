import { describe, it, expect } from 'vitest';
import {
	timingSafeEqual,
	generateApiKey,
	apiKeySchema,
	extractBearerToken,
	API_KEY_PREFIX,
} from './crypto.js';

describe('timingSafeEqual', () => {
	it('returns true for equal strings', () => {
		expect(timingSafeEqual('hello', 'hello')).toBe(true);
	});

	it('returns false for different strings of same length', () => {
		expect(timingSafeEqual('hello', 'world')).toBe(false);
	});

	it('returns false for strings of different lengths', () => {
		expect(timingSafeEqual('hello', 'hi')).toBe(false);
	});

	it('returns false for both empty strings', () => {
		expect(timingSafeEqual('', '')).toBe(false);
	});

	it('returns false when one string is empty and the other is not', () => {
		expect(timingSafeEqual('hello', '')).toBe(false);
	});

	it('returns true for matching single characters', () => {
		expect(timingSafeEqual('a', 'a')).toBe(true);
	});

	it('returns false for mismatching single characters', () => {
		expect(timingSafeEqual('a', 'b')).toBe(false);
	});

	it('returns true for matching unicode strings', () => {
		expect(timingSafeEqual('café', 'café')).toBe(true);
	});

	it('returns false for mismatching unicode strings', () => {
		expect(timingSafeEqual('café', 'caff')).toBe(false);
	});
});

describe('generateApiKey', () => {
	it('produces a key with the sw_ prefix followed by 32 hex chars', () => {
		const key = generateApiKey();
		expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
		expect(key).toMatch(new RegExp(`^${API_KEY_PREFIX}[0-9a-f]{32}$`, 'u'));
	});

	it('passes apiKeySchema validation', () => {
		expect(apiKeySchema.safeParse(generateApiKey()).success).toBe(true);
	});

	it('produces unique keys across calls', () => {
		const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
		expect(keys.size).toBe(50);
	});
});

describe('extractBearerToken', () => {
	it('extracts the token from a well-formed Bearer header', () => {
		expect(extractBearerToken('Bearer abc123')).toBe('abc123');
	});

	it('tolerates surrounding whitespace', () => {
		expect(extractBearerToken('  Bearer   abc123  ')).toBe('abc123');
	});

	it('returns null for non-Bearer schemes', () => {
		expect(extractBearerToken('Basic abc123')).toBeNull();
	});

	it('returns null when header is missing', () => {
		expect(extractBearerToken(undefined)).toBeNull();
		expect(extractBearerToken(null)).toBeNull();
		expect(extractBearerToken('')).toBeNull();
	});

	it('returns null for a Bearer header with no token', () => {
		expect(extractBearerToken('Bearer ')).toBeNull();
		expect(extractBearerToken('Bearer')).toBeNull();
	});
});
