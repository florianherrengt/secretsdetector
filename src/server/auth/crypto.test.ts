import { describe, it, expect } from 'vitest';
import { timingSafeEqual } from './crypto.js';

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
