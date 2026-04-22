import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const mockGetSession = vi.fn();
const mockExtractSessionId = vi.fn();
const mockGenerateToken = vi.fn();
const mockCreateIfMissing = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock('../auth/index.js', () => ({
	getSession: (...args: unknown[]) => mockGetSession(...args),
}));

vi.mock('../auth/middleware.js', () => ({
	extractSessionId: (...args: unknown[]) => mockExtractSessionId(...args),
}));

vi.mock('../auth/crypto.js', () => ({
	generateToken: (...args: unknown[]) => mockGenerateToken(...args),
}));

vi.mock('./csrfTokenStore.js', () => ({
	csrfTokenStore: {
		createIfMissing: (...args: unknown[]) => mockCreateIfMissing(...args),
		get: (...args: unknown[]) => mockGet(...args),
		set: (...args: unknown[]) => mockSet(...args),
	},
	CSRF_TOKEN_TTL_SECONDS: 2592000,
}));

import { csrfTokenInjection } from './csrfToken.js';

const createApp = () => {
	const app = new Hono();
	app.use('*', csrfTokenInjection);
	app.get('*', async (c) => {
		const token = (c as unknown as { get: (key: string) => string | undefined }).get('csrfToken');
		return c.json({ token: token ?? null });
	});
	return app;
};

describe('csrfTokenInjection', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('skips token creation when no session cookie', async () => {
		mockExtractSessionId.mockReturnValue(null);

		const app = createApp();
		const res = await app.request('/');
		const body = (await res.json()) as { token: string | null };

		expect(body.token).toBeNull();
		expect(mockGetSession).not.toHaveBeenCalled();
	});

	it('skips token creation when session is invalid', async () => {
		mockExtractSessionId.mockReturnValue('sid');
		mockGetSession.mockResolvedValue(null);

		const app = createApp();
		const res = await app.request('/');
		const body = (await res.json()) as { token: string | null };

		expect(body.token).toBeNull();
		expect(mockCreateIfMissing).not.toHaveBeenCalled();
	});

	it('creates token atomically when session is valid and no token exists', async () => {
		mockExtractSessionId.mockReturnValue('sid');
		mockGetSession.mockResolvedValue({ userId: 'u1', email: 'a@b.c' });
		mockGenerateToken.mockReturnValue('new-token');
		mockCreateIfMissing.mockResolvedValue('new-token');

		const app = createApp();
		const res = await app.request('/');
		const body = (await res.json()) as { token: string | null };

		expect(body.token).toBe('new-token');
		expect(mockGet).not.toHaveBeenCalled();
	});

	it('fetches and refreshes existing token when createIfMissing returns null', async () => {
		mockExtractSessionId.mockReturnValue('sid');
		mockGetSession.mockResolvedValue({ userId: 'u1', email: 'a@b.c' });
		mockGenerateToken.mockReturnValue('new-token');
		mockCreateIfMissing.mockResolvedValue(null);
		mockGet.mockResolvedValue('existing-token');
		mockSet.mockResolvedValue(undefined);

		const app = createApp();
		const res = await app.request('/');
		const body = (await res.json()) as { token: string | null };

		expect(body.token).toBe('existing-token');
		expect(mockSet).toHaveBeenCalledWith('sid', 'existing-token', 2592000);
	});

	it('does not set token when token deleted between createIfMissing and get', async () => {
		mockExtractSessionId.mockReturnValue('sid');
		mockGetSession.mockResolvedValue({ userId: 'u1', email: 'a@b.c' });
		mockGenerateToken.mockReturnValue('new-token');
		mockCreateIfMissing.mockResolvedValue(null);
		mockGet.mockResolvedValue(null);

		const app = createApp();
		const res = await app.request('/');
		const body = (await res.json()) as { token: string | null };

		expect(body.token).toBeNull();
		expect(mockSet).not.toHaveBeenCalled();
	});
});
