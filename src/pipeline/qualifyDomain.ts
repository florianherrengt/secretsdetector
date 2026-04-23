import { z } from 'zod';
import { safeNewUrl } from './url.js';

export const QualifyDomainInput = z.object({
	domain: z.string(),
});

export const QualifyDomainOutput = z.object({
	isQualified: z.boolean(),
	reasons: z.array(z.string().min(1)).min(1),
});

export type QualifyDomainInput = z.infer<typeof QualifyDomainInput>;
export type QualifyDomainOutput = z.infer<typeof QualifyDomainOutput>;

const HOMEPAGE_TIMEOUT_MS = 2_500;
const HOMEPAGE_MAX_BYTES = 128 * 1024;
const MIN_HTML_CHARS = 180;
const PARKING_MARKERS = ['domain is for sale', 'buy this domain', 'parking'];

const isValidHostname = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((rawHostname) => {
		const trimmed = rawHostname.trim().toLowerCase();
		const hostname = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;

		if (hostname === 'localhost') {
			return true;
		}

		if (hostname.length === 0 || hostname.length > 253) {
			return false;
		}

		if (
			hostname.includes('/') ||
			hostname.includes('?') ||
			hostname.includes('#') ||
			hostname.includes('@') ||
			hostname.includes(':') ||
			hostname.includes('..') ||
			hostname.startsWith('.') ||
			hostname.endsWith('.')
		) {
			return false;
		}

		const labels = hostname.split('.');

		if (labels.length < 2) {
			return false;
		}

		for (const label of labels) {
			if (label.length === 0 || label.length > 63) {
				return false;
			}

			if (label.startsWith('-') || label.endsWith('-')) {
				return false;
			}

			for (const char of label) {
				const isLower = char >= 'a' && char <= 'z';
				const isNumber = char >= '0' && char <= '9';
				const isDash = char === '-';

				if (!isLower && !isNumber && !isDash) {
					return false;
				}
			}
		}

		return true;
	});

const normalizeQualificationTarget = z
	.function()
	.args(z.string())
	.returns(z.string().url().nullable())
	.implement((rawInput) => {
		const input = rawInput.trim();

		if (input.length === 0 || input.includes('://')) {
			return null;
		}

		const targetUrl = safeNewUrl(`https://${input}`);

		if (!targetUrl) {
			return null;
		}

		const normalizedHostname = targetUrl.hostname.toLowerCase();

		if (!isValidHostname(normalizedHostname)) {
			return null;
		}

		if (targetUrl.username || targetUrl.password) {
			return null;
		}

		targetUrl.hostname = normalizedHostname;
		targetUrl.hash = '';

		if (targetUrl.pathname.length === 0) {
			targetUrl.pathname = '/';
		}

		if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
			targetUrl.protocol = 'http:';
		} else {
			targetUrl.protocol = 'https:';
		}

		return targetUrl.toString();
	});

const readResponseTextWithLimit = z
	.function()
	.args(z.custom<Response>(), z.number().int().positive())
	.returns(z.promise(z.string().nullable()))
	.implement(async (response, maxBytes) => {
		if (!response.body) {
			try {
				return (await response.text()).slice(0, maxBytes);
			} catch {
				return null;
			}
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let bytesRead = 0; // eslint-disable-line custom/no-mutable-variables
		let body = ''; // eslint-disable-line custom/no-mutable-variables

		while (true) {
			let chunkResult; // eslint-disable-line custom/no-mutable-variables

			try {
				chunkResult = await reader.read();
			} catch {
				return null;
			}

			if (chunkResult.done) {
				break;
			}

			const chunk = chunkResult.value;
			const previousBytes = bytesRead;
			bytesRead += chunk.byteLength;

			if (bytesRead > maxBytes) {
				const remaining = maxBytes - previousBytes;

				if (remaining > 0) {
					body += decoder.decode(chunk.subarray(0, remaining), { stream: true });
				}

				body += decoder.decode();
				return body;
			}

			body += decoder.decode(chunk, { stream: true });
		}

		body += decoder.decode();
		return body;
	});

const fetchHomepage = z
	.function()
	.args(z.string().url())
	.returns(
		z.promise(
			z.discriminatedUnion('kind', [
				z.object({ kind: z.literal('fetch_failed') }),
				z.object({ kind: z.literal('not_html'), finalUrl: z.string().url() }),
				z.object({ kind: z.literal('ok'), finalUrl: z.string().url(), body: z.string() }),
			]),
		),
	)
	.implement(async (url) => {
		const response = await fetch(url, {
			method: 'GET',
			signal: AbortSignal.timeout(HOMEPAGE_TIMEOUT_MS),
			redirect: 'follow',
		}).catch(() => null);

		if (!response) {
			return { kind: 'fetch_failed' };
		}

		if (!response.ok && response.status !== 206) {
			return { kind: 'fetch_failed' };
		}

		const contentType = (response.headers.get('content-type') ?? '').toLowerCase();

		if (!contentType.includes('text/html')) {
			return { kind: 'not_html', finalUrl: response.url };
		}

		const body = await readResponseTextWithLimit(response, HOMEPAGE_MAX_BYTES);

		if (body === null) {
			return { kind: 'fetch_failed' };
		}

		return {
			kind: 'ok',
			finalUrl: response.url,
			body,
		};
	});

const normalizeComparablePath = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((path) => {
		if (path === '/') {
			return '/';
		}

		return path.replace(/\/+$/, '');
	});

const isFinalUrlWithinRequestedPath = z
	.function()
	.args(z.string().url(), z.string().url())
	.returns(z.boolean())
	.implement((requestedUrl, finalUrl) => {
		const requestedPath = normalizeComparablePath(new URL(requestedUrl).pathname);

		if (requestedPath === '/') {
			return true;
		}

		const finalPath = normalizeComparablePath(new URL(finalUrl).pathname);

		if (finalPath === requestedPath) {
			return true;
		}

		return finalPath.startsWith(`${requestedPath}/`);
	});

const isParkingLikePage = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((html) => {
		const loweredHtml = html.toLowerCase();
		return PARKING_MARKERS.some((marker) => loweredHtml.includes(marker));
	});

export const qualifyDomain = z
	.function()
	.args(QualifyDomainInput)
	.returns(z.promise(QualifyDomainOutput))
	.implement(async (input) => {
		const targetUrl = normalizeQualificationTarget(input.domain);

		if (targetUrl === null) {
			return {
				isQualified: false,
				reasons: ['Failed: invalid domain input'],
			};
		}

		const homepage = await fetchHomepage(targetUrl);

		if (homepage.kind === 'fetch_failed') {
			return {
				isQualified: false,
				reasons: ['Failed: could not fetch homepage'],
			};
		}

		if (!isFinalUrlWithinRequestedPath(targetUrl, homepage.finalUrl)) {
			return {
				isQualified: false,
				reasons: ['Failed: redirected outside requested path'],
			};
		}

		if (homepage.kind === 'not_html') {
			return {
				isQualified: false,
				reasons: ['Failed: response is not HTML'],
			};
		}

		const trimmedHtml = homepage.body.trim();

		if (trimmedHtml.length === 0) {
			return {
				isQualified: false,
				reasons: ['Failed: empty HTML response'],
			};
		}

		const reasons: string[] = [];

		if (!trimmedHtml.toLowerCase().includes('<script')) {
			reasons.push('Failed: no <script> tag found');
		}

		if (isParkingLikePage(trimmedHtml)) {
			reasons.push('Failed: detected parking page');
		}

		if (trimmedHtml.length < MIN_HTML_CHARS) {
			reasons.push('Failed: HTML too small');
		}

		if (reasons.length > 0) {
			return {
				isQualified: false,
				reasons,
			};
		}

		return {
			isQualified: true,
			reasons: ['Qualified: HTML contains scripts and passes all checks'],
		};
	});
