import { z } from "zod";
import { builtinChecks, checkResultSchema, checkScriptSchema, type ScanCheck } from "./checks.js";

export const ScanDomainInput = z.object({
	domain: z.string()
});

const scanFindingWithCheckIdSchema = z.object({
	checkId: z.string(),
	type: z.literal("secret"),
	file: z.string(),
	snippet: z.string(),
	fingerprint: z.string()
});

export const ScanDomainOutput = z.object({
	status: z.enum(["success", "failed"]),
	checks: z.array(checkResultSchema),
	findings: z.array(scanFindingWithCheckIdSchema)
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
		const trimmed = rawHostname.trim().toLowerCase();
		const hostname = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;

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

		const parsed = (() => {
			try {
				return new URL(`https://${input}`);
			} catch {
				return null;
			}
		})();

		if (!parsed) {
			return null;
		}

		const targetUrl = parsed;
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
		let bytesRead = 0; // eslint-disable-line custom/no-mutable-variables
		let body = ""; // eslint-disable-line custom/no-mutable-variables

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
		const response = await fetch(url, {
			method: "GET",
			headers,
			signal: AbortSignal.timeout(timeoutMs),
			redirect: "follow"
		}).catch(() => null);

		if (!response) {
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

const toFailedResult = z
	.function()
	.args()
	.returns(ScanDomainOutput)
	.implement(() => {
		return {
			status: "failed",
			checks: [],
			findings: []
		};
	});

export const runChecks = z
	.function()
	.args(z.string().url(), z.array(checkScriptSchema), z.array(z.custom<ScanCheck>()))
	.returns(z.array(checkResultSchema))
	.implement((domain, scripts, checks) => {
		const results: z.infer<typeof checkResultSchema>[] = [];

		for (const check of checks) {
			try {
				const checkResult = check.run({ domain, scripts });

				results.push({
					id: check.id,
					name: check.name,
					description: check.description,
					findings: checkResult.findings
				});
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown check error";

				console.error("[scan-domain] Check execution failed", {
					checkId: check.id,
					domain,
					error: errorMessage
				});

				results.push({
					id: check.id,
					name: check.name,
					description: check.description,
					findings: []
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
		const scripts: { file: string; content: string }[] = [];

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

			scripts.push({
				file: scriptUrl,
				content: scriptResponse.body
			});
		}

		const checks = runChecks(targetUrl, scripts, builtinChecks);

		const findings = checks.flatMap((checkResult) => {
			return checkResult.findings.map((finding) => {
				return {
					checkId: checkResult.id,
					type: finding.type,
					file: finding.file,
					snippet: finding.snippet,
					fingerprint: finding.fingerprint
				};
			});
		});

		return {
			status: "success",
			checks,
			findings
		};
	});
