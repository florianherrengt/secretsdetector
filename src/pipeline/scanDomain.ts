import { createHash } from "node:crypto";
import { z } from "zod";

export const ScanDomainInput = z.object({
	domain: z.string()
});

export const ScanDomainOutput = z.object({
	status: z.enum(["success", "failed"]),
	findings: z.array(
		z.object({
			type: z.literal("secret"),
			file: z.string(),
			snippet: z.string(),
			fingerprint: z.string()
		})
	)
});

export type ScanDomainInput = z.infer<typeof ScanDomainInput>;
export type ScanDomainOutput = z.infer<typeof ScanDomainOutput>;

const HOMEPAGE_TIMEOUT_MS = 4_000;
const SCRIPT_TIMEOUT_MS = 3_000;
const HOMEPAGE_MAX_BYTES = 200 * 1024;
const SCRIPT_MAX_BYTES = 50 * 1024;
const MAX_SCRIPT_CANDIDATES = 3;

const isValidHostname = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((rawHostname) => {
		let hostname = rawHostname.trim().toLowerCase();

		if (hostname.endsWith(".")) {
			hostname = hostname.slice(0, -1);
		}

		if (hostname === "localhost") {
			return true;
		}

		if (hostname.length === 0 || hostname.length > 253) {
			return false;
		}

		if (
			hostname.includes("/") ||
			hostname.includes("?") ||
			hostname.includes("#") ||
			hostname.includes("@") ||
			hostname.includes(":") ||
			hostname.includes("..") ||
			hostname.startsWith(".") ||
			hostname.endsWith(".")
		) {
			return false;
		}

		const labels = hostname.split(".");

		if (labels.length < 2) {
			return false;
		}

		for (const label of labels) {
			if (label.length === 0 || label.length > 63) {
				return false;
			}

			if (label.startsWith("-") || label.endsWith("-")) {
				return false;
			}

			for (const char of label) {
				const isLower = char >= "a" && char <= "z";
				const isNumber = char >= "0" && char <= "9";
				const isDash = char === "-";

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

		if (input.length === 0 || input.includes("://")) {
			return null;
		}

		let targetUrl: URL;

		try {
			targetUrl = new URL(`https://${input}`);
		} catch {
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
		targetUrl.hash = "";

		if (targetUrl.pathname.length === 0) {
			targetUrl.pathname = "/";
		}

		if (normalizedHostname === "localhost" || normalizedHostname.endsWith(".localhost")) {
			targetUrl.protocol = "http:";
		} else {
			targetUrl.protocol = "https:";
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
		let bytesRead = 0;
		let body = "";

		while (true) {
			let chunkResult;

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

const fetchTextResource = z
	.function()
	.args(
		z.string().url(),
		z.number().int().positive(),
		z.number().int().positive(),
		z.record(z.string()).optional()
	)
	.returns(
		z.promise(
			z
				.object({
					contentType: z.string(),
					body: z.string()
				})
				.nullable()
		)
	)
	.implement(async (url, timeoutMs, maxBytes, headers) => {
		let response: Response;

		try {
			response = await fetch(url, {
				method: "GET",
				headers,
				signal: AbortSignal.timeout(timeoutMs),
				redirect: "follow"
			});
		} catch {
			return null;
		}

		if (!response.ok && response.status !== 206) {
			return null;
		}

		const body = await readResponseTextWithLimit(response, maxBytes);

		if (body === null) {
			return null;
		}

		const contentType = response.headers.get("content-type") ?? "";

		return {
			contentType,
			body
		};
	});

const extractScriptUrls = z
	.function()
	.args(z.string(), z.string().url())
	.returns(z.array(z.string().url()))
	.implement((html, homepageUrl) => {
		const sourceUrl = new URL(homepageUrl);
		const scriptUrlRegex = /<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))[^>]*>/gi;
		const scriptUrls: string[] = [];
		const seen = new Set<string>();

		while (true) {
			const match = scriptUrlRegex.exec(html);

			if (match === null) {
				break;
			}

			const src = (match[1] ?? match[2] ?? match[3] ?? "").trim();

			if (src.length === 0) {
				continue;
			}

			const lowercaseSrc = src.toLowerCase();

			if (lowercaseSrc.startsWith("data:") || lowercaseSrc.startsWith("javascript:")) {
				continue;
			}

			let absoluteUrl: URL;

			try {
				absoluteUrl = new URL(src, sourceUrl);
			} catch {
				continue;
			}

			if (absoluteUrl.protocol !== "https:" && absoluteUrl.protocol !== "http:") {
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
			return "";
		}
	});

const isLikelyJavaScript = z
	.function()
	.args(z.string().url(), z.string())
	.returns(z.boolean())
	.implement((url, contentType) => {
		const lowerContentType = contentType.toLowerCase();
		const path = getUrlPath(url);
		const looksLikeJsPath =
			path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs") || path.includes(".js?");

		if (lowerContentType.length === 0) {
			return looksLikeJsPath;
		}

		if (lowerContentType.includes("javascript") || lowerContentType.includes("ecmascript")) {
			return true;
		}

		if (looksLikeJsPath && lowerContentType.startsWith("text/plain")) {
			return true;
		}

		return false;
	});

const redactSecret = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((value) => {
		if (value.length <= 8) {
			return "[REDACTED]";
		}

		const prefix = value.slice(0, 4);
		const suffix = value.slice(-4);

		return `${prefix}...[REDACTED]...${suffix}`;
	});

const buildSnippet = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive(), z.string())
	.returns(z.string())
	.implement((body, start, end, matchedValue) => {
		const contextChars = 50;
		const snippetStart = Math.max(0, start - contextChars);
		const snippetEnd = Math.min(body.length, end + contextChars);
		let snippet = body.slice(snippetStart, snippetEnd);
		const localStart = start - snippetStart;
		const localEnd = localStart + (end - start);

		snippet = `${snippet.slice(0, localStart)}${redactSecret(matchedValue)}${snippet.slice(localEnd)}`;
		snippet = snippet.replace(/\s+/g, " ").trim();

		if (snippet.length > 180) {
			return snippet.slice(0, 180);
		}

		return snippet;
	});

const fingerprintValue = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((value) => {
		return createHash("sha256").update(value).digest("hex");
	});

const isLikelyJwt = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
		if (value.length < 60) {
			return false;
		}

		if (!value.startsWith("eyJ")) {
			return false;
		}

		const segments = value.split(".");

		if (segments.length !== 3) {
			return false;
		}

		if (segments[0].length < 10 || segments[1].length < 10 || segments[2].length < 16) {
			return false;
		}

		return true;
	});

const detectHighConfidenceSecret = z
	.function()
	.args(z.string())
	.returns(
		z
			.object({
				value: z.string(),
				start: z.number().int().nonnegative(),
				end: z.number().int().positive()
			})
			.nullable()
	)
	.implement((body) => {
		const privateKeyMarker = "-----BEGIN PRIVATE KEY-----";
		const privateKeyIndex = body.indexOf(privateKeyMarker);

		if (privateKeyIndex !== -1) {
			const privateKeyEndMarker = "-----END PRIVATE KEY-----";
			const endMarkerIndex = body.indexOf(
				privateKeyEndMarker,
				privateKeyIndex + privateKeyMarker.length
			);
			const hasCompleteBlock = endMarkerIndex !== -1;
			const valueEnd = hasCompleteBlock
				? endMarkerIndex + privateKeyEndMarker.length
				: privateKeyIndex + privateKeyMarker.length;
			const privateKeyValue = body.slice(privateKeyIndex, valueEnd);

			return {
				value: privateKeyValue,
				start: privateKeyIndex,
				end: valueEnd
			};
		}

		const jwtRegex = /(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/g;

		while (true) {
			const match = jwtRegex.exec(body);

			if (match === null) {
				break;
			}

			const value = match[2];

			if (!isLikelyJwt(value)) {
				continue;
			}

			const prefixLength = match[1]?.length ?? 0;
			const start = match.index + prefixLength;

			return {
				value,
				start,
				end: start + value.length
			};
		}

		const credentialUrlRegex = /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@[^\s"'<>]+/g;

		while (true) {
			const match = credentialUrlRegex.exec(body);

			if (match === null) {
				break;
			}

			const value = match[0];

			return {
				value,
				start: match.index,
				end: match.index + value.length
			};
		}

		return null;
	});

const toFailedResult = z
	.function()
	.args()
	.returns(ScanDomainOutput)
	.implement(() => {
		return {
			status: "failed",
			findings: []
		};
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

		const homepage = await fetchTextResource(
			targetUrl,
			HOMEPAGE_TIMEOUT_MS,
			HOMEPAGE_MAX_BYTES,
			undefined
		);

		if (homepage === null) {
			return toFailedResult();
		}

		if (!homepage.contentType.toLowerCase().includes("text/html")) {
			return toFailedResult();
		}

		if (!homepage.body.toLowerCase().includes("<script")) {
			return toFailedResult();
		}

		const scriptUrls = extractScriptUrls(homepage.body, targetUrl);
		const candidateScriptUrls = scriptUrls.slice(0, MAX_SCRIPT_CANDIDATES);
		const findings: ScanDomainOutput["findings"] = [];

		for (const scriptUrl of candidateScriptUrls) {
			const scriptResponse = await fetchTextResource(scriptUrl, SCRIPT_TIMEOUT_MS, SCRIPT_MAX_BYTES, {
				Range: `bytes=0-${SCRIPT_MAX_BYTES - 1}`
			});

			if (scriptResponse === null) {
				continue;
			}

			if (!isLikelyJavaScript(scriptUrl, scriptResponse.contentType)) {
				continue;
			}

			const detection = detectHighConfidenceSecret(scriptResponse.body);

			if (detection === null) {
				continue;
			}

			findings.push({
				type: "secret",
				file: scriptUrl,
				snippet: buildSnippet(scriptResponse.body, detection.start, detection.end, detection.value),
				fingerprint: fingerprintValue(detection.value)
			});

			break;
		}

		return {
			status: "success",
			findings
		};
	});
