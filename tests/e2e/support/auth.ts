/* eslint-disable custom/no-raw-functions */
import type { APIRequestContext } from '@playwright/test';

export interface MockEmail {
	to: string;
	subject: string;
	html: string;
	createdAt: string;
}

export interface AuthSession {
	email: string;
	sessionId: string;
	cookieHeader: string;
}

const sleep = async (ms: number) => {
	await new Promise((resolve) => setTimeout(resolve, ms));
};

export const getMagicLinkFromEmail = (email: MockEmail): string | null => {
	const linkMatch = email.html.match(/href="([^"]*auth\/verify\?token=[^"]*)"/);
	return linkMatch?.[1] ?? null;
};

export const extractTokenFromMagicLink = (magicLink: string): string | null => {
	const tokenMatch = magicLink.match(/token=([^&"]+)/);
	return tokenMatch?.[1] ?? null;
};

export const getSessionIdFromSetCookie = (setCookieHeader: string | null): string | null => {
	if (!setCookieHeader) {
		return null;
	}

	const sessionMatch = setCookieHeader.match(/session_id=([^;]+)/);
	return sessionMatch?.[1] ?? null;
};

export const requestMagicLink = async (request: APIRequestContext, email: string) => {
	return await request.post('/auth/request-link', {
		headers: { 'Content-Type': 'application/json' },
		data: { email },
	});
};

export const getLatestEmailForRecipient = async (
	request: APIRequestContext,
	email: string,
	maxAttempts = 20,
	waitMs = 100,
): Promise<MockEmail | null> => {
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const response = await request.get('/debug/emails');

		if (response.ok()) {
			const emails = (await response.json()) as MockEmail[];
			const matchingEmails = emails
				.filter((candidate) => candidate.to === email)
				.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

			if (matchingEmails.length > 0) {
				return matchingEmails[0];
			}
		}

		await sleep(waitMs);
	}

	return null;
};

export const getTokenForEmail = async (
	request: APIRequestContext,
	email: string,
): Promise<string | null> => {
	const latestEmail = await getLatestEmailForRecipient(request, email);

	if (!latestEmail) {
		return null;
	}

	const magicLink = getMagicLinkFromEmail(latestEmail);

	if (!magicLink) {
		return null;
	}

	return extractTokenFromMagicLink(magicLink);
};

export const verifyMagicLinkToken = async (
	request: APIRequestContext,
	tokenOrMagicLink: string,
) => {
	const url = tokenOrMagicLink.startsWith('http')
		? tokenOrMagicLink
		: `/auth/verify?token=${tokenOrMagicLink}`;

	return await request.get(url, { maxRedirects: 0 });
};

export const extractCsrfToken = (html: string): string | null => {
	const match = html.match(/name="_csrf" value="([^"]+)"/);
	return match?.[1] ?? null;
};

export const getOrigin = (): string => {
	const d = process.env.DOMAIN ?? '127.0.0.1:3000';
	return d.includes('://') ? d : `http://${d}`;
};

export const withOrigin = (headers: Record<string, string>): Record<string, string> => ({
	...headers,
	Origin: getOrigin(),
});

export const getCsrfToken = async (
	request: APIRequestContext,
	authHeaders: Record<string, string>,
): Promise<string> => {
	const response = await request.get('/domains', { headers: authHeaders });
	const html = await response.text();
	const token = extractCsrfToken(html);
	if (!token) throw new Error('CSRF token not found in page');
	return token;
};

export const createAuthenticatedSession = async (
	request: APIRequestContext,
	email = `e2e-${Date.now()}-${crypto.randomUUID()}@example.com`,
): Promise<AuthSession> => {
	const requestLinkResponse = await requestMagicLink(request, email);

	if (!requestLinkResponse.ok()) {
		throw new Error(`Failed to request magic link (${requestLinkResponse.status()})`);
	}

	const latestEmail = await getLatestEmailForRecipient(request, email);

	if (!latestEmail) {
		throw new Error(`Magic link email not found for ${email}`);
	}

	const magicLink = getMagicLinkFromEmail(latestEmail);

	if (!magicLink) {
		throw new Error('Unable to extract magic link from mock email');
	}

	const verifyResponse = await verifyMagicLinkToken(request, magicLink);

	if (![302, 303].includes(verifyResponse.status())) {
		throw new Error(`Magic link verification failed (${verifyResponse.status()})`);
	}

	const sessionId = getSessionIdFromSetCookie(verifyResponse.headers()['set-cookie'] ?? null);

	if (!sessionId) {
		throw new Error('Missing session_id cookie after magic link verification');
	}

	return {
		email,
		sessionId,
		cookieHeader: `session_id=${sessionId}`,
	};
};
