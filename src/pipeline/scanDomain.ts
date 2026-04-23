import { isIP } from 'node:net';
import { z } from 'zod';
import {
	builtinChecks,
	checkResultSchema,
	checkScriptSchema,
	sourceMapProbeSchema,
	sourceMapDiscoveryMethodSchema,
	type ScanCheck,
	type SourceMapProbe,
	type SourceMapDiscoveryMethod,
} from './checks.js';
import {
	discoverSubdomainTargets,
	shouldSkipDiscovery,
	resolveAndCheckHost,
	isSubdomainOf,
	discoveryStatsSchema,
	getEmptyDiscoveryOutput,
	isPrivateIp,
	type DiscoveryOutput,
} from './discovery.js';

export const ScanDomainInput = z.object({
	domain: z.string(),
});

const scanFindingWithCheckIdSchema = z.object({
	checkId: z.string(),
	type: z.literal('secret'),
	file: z.string(),
	snippet: z.string(),
	fingerprint: z.string(),
});

export const ScanDomainOutput = z.object({
	status: z.enum(['success', 'failed']),
	checks: z.array(checkResultSchema),
	findings: z.array(scanFindingWithCheckIdSchema),
	discoveredSubdomains: z.array(z.string()),
	discoveryStats: discoveryStatsSchema,
	subdomainAssetCoverage: z.array(
		z.object({
			subdomain: z.string(),
			scannedAssetPaths: z.array(z.string()),
		}),
	),
});

export type ScanDomainInput = z.infer<typeof ScanDomainInput>;
export type ScanDomainOutput = z.infer<typeof ScanDomainOutput>;

const HOMEPAGE_TIMEOUT_MS = 4_000;
const SCRIPT_TIMEOUT_MS = 3_000;
const HOMEPAGE_MAX_BYTES = 200 * 1024;
const SCRIPT_HEAD_MAX_BYTES = 50 * 1024;
const SCRIPT_TAIL_MAX_BYTES = 256 * 1024;
const MAX_SCRIPT_CANDIDATES = 3;
const SOURCE_MAP_TIMEOUT_MS = 3_000;
const SOURCE_MAP_MAX_BYTES = 100 * 1024;
const MAX_TOTAL_SCRIPTS = 200;
const MAX_TOTAL_SOURCE_MAPS = 200;
const MAX_CONCURRENT_FETCHES = 5;

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

const normalizeScanTarget = z
	.function()
	.args(z.string())
	.returns(z.string().url().nullable())
	.implement((rawInput) => {
		const input = rawInput.trim();

		if (input.length === 0 || input.includes('://')) {
			return null;
		}

		const targetUrl = (() => {
			try {
				return new URL(`https://${input}`);
			} catch {
				return null;
			}
		})();

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
		} else if (isPrivateIp(normalizedHostname)) {
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
				const text = await response.text();
				return text.slice(0, maxBytes);
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

type Semaphore = {
	acquire: () => Promise<void>;
	release: () => void;
};

const createSemaphore = z
	.function()
	.args(z.number().int().positive())
	.returns(z.custom<Semaphore>())
	.implement((limit) => {
		let active = 0; // eslint-disable-line custom/no-mutable-variables
		const queue: Array<() => void> = [];

		const acquire = z
			.function()
			.args()
			.returns(z.promise(z.void()))
			.implement(async () => {
				if (active < limit) {
					active++;
					return;
				}
				return new Promise<void>((resolve) => {
					const next = z
						.function()
						.args()
						.returns(z.void())
						.implement(() => {
							active++;
							resolve();
						});
					queue.push(next);
				});
			});

		const release = z
			.function()
			.args()
			.returns(z.void())
			.implement(() => {
				active--;
				const next = queue.shift();
				if (next) {
					next();
				}
			});

		return { acquire, release };
	});

const fetchTextResource = z
	.function()
	.args(
		z.string().url(),
		z.number().int().positive(),
		z.number().int().positive(),
		z.record(z.string()).optional(),
		z.custom<Semaphore>().optional(),
		z.string().optional(),
	)
	.returns(
		z.promise(
			z
				.object({
					finalUrl: z.string().url(),
					contentType: z.string(),
					body: z.string(),
					headers: z.record(z.string()),
				})
				.nullable(),
		),
	)
	.implement(async (url, timeoutMs, maxBytes, headers, semaphore, allowedFinalHost) => {
		const parsedUrl = new URL(url);
		const hostname = parsedUrl.hostname.toLowerCase();
		const isExplicitTarget =
			hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname) !== 0;
		if (!isExplicitTarget) {
			const isSafe = await resolveAndCheckHost(parsedUrl.hostname);
			if (!isSafe) return null;
		}

		if (semaphore) await semaphore.acquire();
		let response: Response | null; // eslint-disable-line custom/no-mutable-variables
		try {
			response = await fetch(url, {
				method: 'GET',
				headers,
				signal: AbortSignal.timeout(timeoutMs),
				redirect: 'follow',
			}).catch(() => null);
		} finally {
			if (semaphore) semaphore.release();
		}

		if (!response) {
			return null;
		}

		if (allowedFinalHost) {
			const finalHost = new URL(response.url).hostname.toLowerCase();
			const normalizedAllowedHost = allowedFinalHost.toLowerCase();
			const hostAllowed =
				finalHost === normalizedAllowedHost || isSubdomainOf(finalHost, normalizedAllowedHost);

			if (!hostAllowed) {
				return null;
			}
		}

		if (!response.ok && response.status !== 206) {
			return null;
		}

		const body = await readResponseTextWithLimit(response, maxBytes);

		if (body === null) {
			return null;
		}

		const contentType = response.headers.get('content-type') ?? '';
		const responseHeaders: Record<string, string> = {};

		response.headers.forEach((value, key) => {
			responseHeaders[key] = value;
		});

		return {
			finalUrl: response.url,
			contentType,
			body,
			headers: responseHeaders,
		};
	});

const mergeScriptSegments = z
	.function()
	.args(z.string(), z.string())
	.returns(z.string())
	.implement((headSegment, tailSegment) => {
		if (tailSegment.length === 0) {
			return headSegment;
		}

		if (headSegment === tailSegment) {
			return headSegment;
		}

		if (headSegment.includes(tailSegment)) {
			return headSegment;
		}

		if (tailSegment.includes(headSegment)) {
			return tailSegment;
		}

		return `${headSegment}\n${tailSegment}`;
	});

const fetchScriptCandidate = z
	.function()
	.args(z.string().url(), z.string(), z.custom<Semaphore>())
	.returns(
		z.promise(
			z
				.object({
					contentType: z.string(),
					body: z.string(),
					headers: z.record(z.string()),
				})
				.nullable(),
		),
	)
	.implement(async (scriptUrl, allowedFinalHost, semaphore) => {
		const headResponse = await fetchTextResource(
			scriptUrl,
			SCRIPT_TIMEOUT_MS,
			SCRIPT_HEAD_MAX_BYTES,
			{ Range: `bytes=0-${SCRIPT_HEAD_MAX_BYTES - 1}` },
			semaphore,
			allowedFinalHost,
		);

		if (headResponse === null) {
			return null;
		}

		if (!isLikelyJavaScript(scriptUrl, headResponse.contentType)) {
			return null;
		}

		const tailResponse = await fetchTextResource(
			scriptUrl,
			SCRIPT_TIMEOUT_MS,
			SCRIPT_TAIL_MAX_BYTES,
			{ Range: `bytes=-${SCRIPT_TAIL_MAX_BYTES}` },
			semaphore,
			allowedFinalHost,
		);

		const mergedBody =
			tailResponse !== null && isLikelyJavaScript(scriptUrl, tailResponse.contentType)
				? mergeScriptSegments(headResponse.body, tailResponse.body)
				: headResponse.body;

		return {
			contentType: headResponse.contentType,
			body: mergedBody,
			headers: headResponse.headers,
		};
	});

const extractScriptUrls = z
	.function()
	.args(z.string(), z.string().url())
	.returns(z.array(z.string().url()))
	.implement((html, homepageUrl) => {
		const sourceUrl = new URL(homepageUrl);
		const scriptTagRegex = /<script\b([^>]*)>/gi;
		const scriptSrcRegex = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/i;
		const scriptUrls: string[] = [];
		const seen = new Set<string>();

		while (true) {
			const match = scriptTagRegex.exec(html);

			if (match === null) {
				break;
			}

			const attributes = match[1] ?? '';
			const srcMatch = scriptSrcRegex.exec(attributes);

			if (srcMatch === null) {
				continue;
			}

			const src = (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '').trim();

			if (src.length === 0) {
				continue;
			}

			const lowercaseSrc = src.toLowerCase();

			if (lowercaseSrc.startsWith('data:') || lowercaseSrc.startsWith('javascript:')) {
				continue;
			}

			const absoluteUrl = (() => {
				try {
					return new URL(src, sourceUrl);
				} catch {
					return null;
				}
			})();

			if (!absoluteUrl) {
				continue;
			}

			if (absoluteUrl.protocol !== 'https:' && absoluteUrl.protocol !== 'http:') {
				continue;
			}

			if (absoluteUrl.origin !== sourceUrl.origin) {
				continue;
			}

			const normalizedUrl = absoluteUrl.toString();

			if (seen.has(normalizedUrl)) {
				continue;
			}

			seen.add(normalizedUrl);
			scriptUrls.push(normalizedUrl);
		}

		return scriptUrls;
	});

const getUrlPath = z
	.function()
	.args(z.string().url())
	.returns(z.string())
	.implement((url) => {
		try {
			return new URL(url).pathname.toLowerCase();
		} catch {
			return '';
		}
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

const toDirectoryUrl = z
	.function()
	.args(z.string().url())
	.returns(z.string().url())
	.implement((urlValue) => {
		const parsedUrl = new URL(urlValue);
		if (!parsedUrl.pathname.endsWith('/')) {
			parsedUrl.pathname = `${parsedUrl.pathname}/`;
		}
		parsedUrl.search = '';
		parsedUrl.hash = '';
		return parsedUrl.toString();
	});

const buildSitemapCandidateUrls = z
	.function()
	.args(z.string().url(), z.string().url())
	.returns(z.array(z.string().url()))
	.implement((requestedUrl, finalHomepageUrl) => {
		const candidateUrls = [
			new URL('sitemap.xml', toDirectoryUrl(requestedUrl)).toString(),
			new URL('sitemap.xml', toDirectoryUrl(finalHomepageUrl)).toString(),
			new URL('/sitemap.xml', requestedUrl).toString(),
		];

		const uniqueUrls = new Set<string>();
		const dedupedUrls: string[] = [];

		for (const candidateUrl of candidateUrls) {
			if (uniqueUrls.has(candidateUrl)) {
				continue;
			}
			uniqueUrls.add(candidateUrl);
			dedupedUrls.push(candidateUrl);
		}

		return dedupedUrls;
	});

const isLikelyJavaScript = z
	.function()
	.args(z.string().url(), z.string())
	.returns(z.boolean())
	.implement((url, contentType) => {
		const lowerContentType = contentType.toLowerCase();
		const path = getUrlPath(url);
		const looksLikeJsPath =
			path.endsWith('.js') ||
			path.endsWith('.mjs') ||
			path.endsWith('.cjs') ||
			path.includes('.js?');

		if (lowerContentType.length === 0) {
			return looksLikeJsPath;
		}

		if (lowerContentType.includes('javascript') || lowerContentType.includes('ecmascript')) {
			return true;
		}

		if (looksLikeJsPath && lowerContentType.startsWith('text/plain')) {
			return true;
		}

		return false;
	});

const extractSourceMapRefFromHeaders = z
	.function()
	.args(z.record(z.string()))
	.returns(
		z
			.object({
				url: z.string(),
				method: sourceMapDiscoveryMethodSchema,
			})
			.nullable(),
	)
	.implement((headers) => {
		const sourcemapHeader = headers['sourcemap'] ?? headers['sourcemap'];

		if (typeof sourcemapHeader === 'string' && sourcemapHeader.length > 0) {
			return { url: sourcemapHeader, method: 'sourcemap-header' as const };
		}

		const xSourcemapHeader = headers['x-sourcemap'] ?? headers['x-sourcemap'];

		if (typeof xSourcemapHeader === 'string' && xSourcemapHeader.length > 0) {
			return { url: xSourcemapHeader, method: 'x-sourcemap-header' as const };
		}

		return null;
	});

const extractSourceMapRefFromBody = z
	.function()
	.args(z.string())
	.returns(
		z
			.object({
				url: z.string(),
				method: sourceMapDiscoveryMethodSchema,
			})
			.nullable(),
	)
	.implement((body) => {
		const lines = body.split('\n');
		let lastMatch: { url: string; method: SourceMapDiscoveryMethod } | null = null; // eslint-disable-line custom/no-mutable-variables

		for (const line of lines) {
			const standardMatch = line.match(/\/\/# sourceMappingURL=(\S+)/);

			if (standardMatch?.[1]) {
				lastMatch = { url: standardMatch[1], method: 'inline-comment' as const };
				continue;
			}

			const legacyMatch = line.match(/\/\/@ sourceMappingURL=(\S+)/);

			if (legacyMatch?.[1]) {
				lastMatch = { url: legacyMatch[1], method: 'legacy-inline-comment' as const };
			}
		}

		return lastMatch;
	});

type SourceMapRef = {
	url: string;
	method: SourceMapDiscoveryMethod;
	scriptUrl: string;
};

const resolveSourceMapUrl = z
	.function()
	.args(z.string().url(), z.string())
	.returns(z.string().url().nullable())
	.implement((scriptUrl, rawMapUrl) => {
		if (rawMapUrl.toLowerCase().startsWith('data:')) {
			return null;
		}

		try {
			const resolved = new URL(rawMapUrl, scriptUrl);

			if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
				return null;
			}

			const scriptOrigin = new URL(scriptUrl).origin;

			if (resolved.origin !== scriptOrigin) {
				return null;
			}

			return resolved.toString() as `${string}://${string}`;
		} catch {
			return null;
		}
	});

const extractSourceMapRefs = z
	.function()
	.args(z.string().url(), z.record(z.string()), z.string())
	.returns(z.array(z.custom<SourceMapRef>()))
	.implement((scriptUrl, headers, body) => {
		const headerRef = extractSourceMapRefFromHeaders(headers);

		if (headerRef) {
			const resolved = resolveSourceMapUrl(scriptUrl, headerRef.url);

			if (resolved) {
				return [{ url: resolved, method: headerRef.method, scriptUrl }];
			}
		}

		const bodyRef = extractSourceMapRefFromBody(body);

		if (bodyRef) {
			const resolved = resolveSourceMapUrl(scriptUrl, bodyRef.url);

			if (resolved) {
				return [{ url: resolved, method: bodyRef.method, scriptUrl }];
			}
		}

		return [];
	});

const parseHasSourcesContent = z
	.function()
	.args(z.string())
	.returns(z.boolean().nullable())
	.implement((rawBody) => {
		try {
			const parsed = JSON.parse(rawBody);

			if (typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.sourcesContent)) {
				return parsed.sourcesContent.some(
					(entry: unknown) => entry !== null && entry !== undefined,
				);
			}

			return false;
		} catch {
			return null;
		}
	});

const probeSourceMap = z
	.function()
	.args(z.custom<SourceMapRef>(), z.custom<Semaphore>().optional())
	.returns(z.promise(z.custom<SourceMapProbe>()))
	.implement(async (ref, semaphore) => {
		const mapParsedUrl = new URL(ref.url);
		const hostname = mapParsedUrl.hostname.toLowerCase();
		const isExplicitTarget =
			hostname === 'localhost' || hostname.endsWith('.localhost') || isIP(hostname) !== 0;
		const isSafe = isExplicitTarget || (await resolveAndCheckHost(mapParsedUrl.hostname));

		if (!isSafe) {
			return {
				scriptUrl: ref.scriptUrl,
				mapUrl: ref.url,
				discoveryMethod: ref.method,
				isAccessible: false,
				httpStatus: null,
				hasSourcesContent: null,
			};
		}

		if (semaphore) await semaphore.acquire();
		let response: Response | null; // eslint-disable-line custom/no-mutable-variables
		try {
			response = await fetch(ref.url, {
				method: 'GET',
				signal: AbortSignal.timeout(SOURCE_MAP_TIMEOUT_MS),
				redirect: 'follow',
			}).catch(() => null);
		} finally {
			if (semaphore) semaphore.release();
		}

		if (!response) {
			return {
				scriptUrl: ref.scriptUrl,
				mapUrl: ref.url,
				discoveryMethod: ref.method,
				isAccessible: false,
				httpStatus: null,
				hasSourcesContent: null,
			};
		}

		const finalHost = new URL(response.url).hostname.toLowerCase();
		if (finalHost !== hostname) {
			return {
				scriptUrl: ref.scriptUrl,
				mapUrl: ref.url,
				discoveryMethod: ref.method,
				isAccessible: false,
				httpStatus: null,
				hasSourcesContent: null,
			};
		}

		const isAccessible = response.ok || response.status === 206;
		const httpStatus = response.status;
		let hasSourcesContent: boolean | null = null; // eslint-disable-line custom/no-mutable-variables

		if (isAccessible) {
			const body = await readResponseTextWithLimit(response, SOURCE_MAP_MAX_BYTES);

			if (body !== null) {
				hasSourcesContent = parseHasSourcesContent(body);
			}
		}

		return {
			scriptUrl: ref.scriptUrl,
			mapUrl: ref.url,
			discoveryMethod: ref.method,
			isAccessible,
			httpStatus,
			hasSourcesContent,
		};
	});

const toFailedResult = z
	.function()
	.args()
	.returns(ScanDomainOutput)
	.implement(() => {
		const empty = getEmptyDiscoveryOutput();
		return {
			status: 'failed',
			checks: [],
			findings: [],
			discoveredSubdomains: empty.subdomains,
			discoveryStats: empty.stats,
			subdomainAssetCoverage: [],
		};
	});

export const buildSubdomainAssetCoverage = z
	.function()
	.args(
		z.array(z.string()),
		z.array(
			z.object({
				file: z.string(),
			}),
		),
	)
	.returns(
		z.array(
			z.object({
				subdomain: z.string(),
				scannedAssetPaths: z.array(z.string()),
			}),
		),
	)
	.implement((discoveredSubdomains, scripts) => {
		const assetPathsByHost = new Map<string, Set<string>>();

		for (const script of scripts) {
			let parsed;

			try {
				parsed = new URL(script.file);
			} catch {
				continue;
			}

			const host = parsed.hostname.toLowerCase();
			const rawPath = parsed.pathname.length > 0 ? parsed.pathname : '/';
			const normalizedPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
			const displayPath = normalizedPath.length > 0 ? normalizedPath : '/';

			const current = assetPathsByHost.get(host) ?? new Set<string>();
			current.add(displayPath);
			assetPathsByHost.set(host, current);
		}

		const sortedSubdomains = [
			...new Set(discoveredSubdomains.map((subdomain) => subdomain.toLowerCase())),
		].sort((a, b) => a.localeCompare(b));

		return sortedSubdomains.map((subdomain) => {
			const scannedAssetPaths = [...(assetPathsByHost.get(subdomain) ?? new Set<string>())].sort(
				(a, b) => a.localeCompare(b),
			);

			return {
				subdomain,
				scannedAssetPaths,
			};
		});
	});

export const runChecks = z
	.function()
	.args(
		z.string().url(),
		z.array(checkScriptSchema),
		z.array(z.custom<ScanCheck>()),
		z.array(sourceMapProbeSchema).optional(),
		z.boolean().optional(),
	)
	.returns(z.array(checkResultSchema))
	.implement((domain, scripts, checks, sourceMaps, sitemapFound) => {
		const results: z.infer<typeof checkResultSchema>[] = [];

		for (const check of checks) {
			try {
				const checkResult = check.run({
					domain,
					scripts,
					sourceMaps: sourceMaps ?? [],
					sitemapFound: sitemapFound ?? true,
				});

				results.push({
					id: check.id,
					name: check.name,
					description: check.description,
					findings: checkResult.findings,
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown check error';

				console.error('[scan-domain] Check execution failed', {
					checkId: check.id,
					domain,
					error: errorMessage,
				});

				results.push({
					id: check.id,
					name: check.name,
					description: check.description,
					findings: [],
				});
			}
		}

		return results;
	});

export const scanDomain = z
	.function()
	.args(ScanDomainInput)
	.returns(z.promise(ScanDomainOutput))
	.implement(async (input) => {
		const targetUrl = normalizeScanTarget(input.domain);

		if (targetUrl === null) {
			return toFailedResult();
		}

		const semaphore = createSemaphore(MAX_CONCURRENT_FETCHES);

		const baseHost = new URL(targetUrl).hostname;

		const homepage = await fetchTextResource(
			targetUrl,
			HOMEPAGE_TIMEOUT_MS,
			HOMEPAGE_MAX_BYTES,
			undefined,
			semaphore,
			baseHost,
		);

		if (homepage === null) {
			return toFailedResult();
		}

		if (!isFinalUrlWithinRequestedPath(targetUrl, homepage.finalUrl)) {
			return toFailedResult();
		}

		const homepageUrl = homepage.finalUrl;

		const skipDiscovery = shouldSkipDiscovery(baseHost);

		let discovery: DiscoveryOutput; // eslint-disable-line custom/no-mutable-variables
		if (skipDiscovery) {
			discovery = getEmptyDiscoveryOutput();
		} else {
			discovery = await discoverSubdomainTargets(targetUrl, homepage.body);
		}

		const allScripts: { file: string; content: string; headers: Record<string, string> }[] = [];
		const allSourceMapRefs: SourceMapRef[] = [];

		const mainScriptUrls = extractScriptUrls(homepage.body, homepageUrl);
		const mainCandidates = mainScriptUrls.slice(0, MAX_SCRIPT_CANDIDATES);

		for (const scriptUrl of mainCandidates) {
			const scriptResponse = await fetchScriptCandidate(scriptUrl, baseHost, semaphore);

			if (scriptResponse === null) {
				continue;
			}

			allScripts.push({
				file: scriptUrl,
				content: scriptResponse.body,
				headers: scriptResponse.headers,
			});
		}

		for (const targetUrlStr of discovery.targets) {
			const targetHost = new URL(targetUrlStr).hostname;
			const targetResponse = await fetchTextResource(
				targetUrlStr,
				HOMEPAGE_TIMEOUT_MS,
				HOMEPAGE_MAX_BYTES,
				undefined,
				semaphore,
				targetHost,
			);

			if (targetResponse === null) {
				continue;
			}

			if (!targetResponse.contentType.toLowerCase().includes('text/html')) {
				continue;
			}

			if (!targetResponse.body.toLowerCase().includes('<script')) {
				continue;
			}

			const targetScriptUrls = extractScriptUrls(targetResponse.body, targetUrlStr);
			const targetCandidates = targetScriptUrls.slice(0, MAX_SCRIPT_CANDIDATES);

			for (const scriptUrl of targetCandidates) {
				const scriptResponse = await fetchScriptCandidate(scriptUrl, targetHost, semaphore);

				if (scriptResponse === null) {
					continue;
				}

				allScripts.push({
					file: scriptUrl,
					content: scriptResponse.body,
					headers: scriptResponse.headers,
				});
			}
		}

		const seenScriptUrls = new Set<string>();
		const dedupedScripts = allScripts.filter((script) => {
			if (seenScriptUrls.has(script.file)) {
				return false;
			}
			seenScriptUrls.add(script.file);
			return true;
		});

		let truncated = discovery.stats.truncated; // eslint-disable-line custom/no-mutable-variables
		let finalScripts = dedupedScripts; // eslint-disable-line custom/no-mutable-variables
		if (finalScripts.length > MAX_TOTAL_SCRIPTS) {
			finalScripts = finalScripts.slice(0, MAX_TOTAL_SCRIPTS);
			truncated = true;
		}

		for (const script of finalScripts) {
			const refs = extractSourceMapRefs(script.file, script.headers, script.content);
			allSourceMapRefs.push(...refs);
		}

		const seenMapUrls = new Set<string>();
		const uniqueRefs = allSourceMapRefs.filter((ref) => {
			if (seenMapUrls.has(ref.url)) {
				return false;
			}
			seenMapUrls.add(ref.url);
			return true;
		});

		let finalRefs = uniqueRefs; // eslint-disable-line custom/no-mutable-variables
		if (finalRefs.length > MAX_TOTAL_SOURCE_MAPS) {
			finalRefs = finalRefs.slice(0, MAX_TOTAL_SOURCE_MAPS);
			truncated = true;
		}

		const sourceMapProbes: SourceMapProbe[] = [];

		for (const ref of finalRefs) {
			const probe = await probeSourceMap(ref, semaphore);
			sourceMapProbes.push(probe);
		}

		const sitemapCandidateUrls = buildSitemapCandidateUrls(targetUrl, homepageUrl);
		let sitemapFound = false; // eslint-disable-line custom/no-mutable-variables

		for (const sitemapCandidateUrl of sitemapCandidateUrls) {
			const sitemapResponse = await fetchTextResource(
				sitemapCandidateUrl,
				HOMEPAGE_TIMEOUT_MS,
				HOMEPAGE_MAX_BYTES,
				undefined,
				semaphore,
				baseHost,
			);

			if (sitemapResponse !== null) {
				sitemapFound = true;
				break;
			}
		}

		const checks = runChecks(
			targetUrl,
			finalScripts.map(({ file, content }) => ({ file, content })),
			builtinChecks,
			sourceMapProbes,
			sitemapFound,
		);

		const subdomainAssetCoverage = buildSubdomainAssetCoverage(
			discovery.subdomains,
			finalScripts.map((script) => ({ file: script.file })),
		);

		const findings = checks.flatMap((checkResult) => {
			return checkResult.findings.map((finding) => {
				return {
					checkId: checkResult.id,
					type: finding.type,
					file: finding.file,
					snippet: finding.snippet,
					fingerprint: finding.fingerprint,
				};
			});
		});

		return {
			status: 'success',
			checks,
			findings,
			discoveredSubdomains: discovery.subdomains,
			discoveryStats: {
				...discovery.stats,
				truncated,
			},
			subdomainAssetCoverage,
		};
	});
