import { z } from "zod";

export const QualifyDomainInput = z.object({
	domain: z.string()
});

export const QualifyDomainOutput = z.object({
	isQualified: z.boolean(),
	reasons: z.array(z.string().min(1)).min(1)
});

export type QualifyDomainInput = z.infer<typeof QualifyDomainInput>;
export type QualifyDomainOutput = z.infer<typeof QualifyDomainOutput>;

const HOMEPAGE_TIMEOUT_MS = 2_500;
const HOMEPAGE_MAX_BYTES = 128 * 1024;
const MIN_HTML_CHARS = 180;
const PARKING_MARKERS = ["domain is for sale", "buy this domain", "parking"];

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

const normalizeQualificationTarget = z
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
				return (await response.text()).slice(0, maxBytes);
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

const fetchHomepage = z
	.function()
	.args(z.string().url())
	.returns(
		z.promise(
			z.discriminatedUnion("kind", [
				z.object({ kind: z.literal("fetch_failed") }),
				z.object({ kind: z.literal("not_html") }),
				z.object({ kind: z.literal("ok"), body: z.string() })
			])
		)
	)
	.implement(async (url) => {
		let response: Response;

		try {
			response = await fetch(url, {
				method: "GET",
				signal: AbortSignal.timeout(HOMEPAGE_TIMEOUT_MS),
				redirect: "follow"
			});
		} catch {
			return { kind: "fetch_failed" };
		}

		if (!response.ok && response.status !== 206) {
			return { kind: "fetch_failed" };
		}

		const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

		if (!contentType.includes("text/html")) {
			return { kind: "not_html" };
		}

		const body = await readResponseTextWithLimit(response, HOMEPAGE_MAX_BYTES);

		if (body === null) {
			return { kind: "fetch_failed" };
		}

		return {
			kind: "ok",
			body
		};
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
				reasons: ["Failed: invalid domain input"]
			};
		}

		const homepage = await fetchHomepage(targetUrl);

		if (homepage.kind === "fetch_failed") {
			return {
				isQualified: false,
				reasons: ["Failed: could not fetch homepage"]
			};
		}

		if (homepage.kind === "not_html") {
			return {
				isQualified: false,
				reasons: ["Failed: response is not HTML"]
			};
		}

		const trimmedHtml = homepage.body.trim();

		if (trimmedHtml.length === 0) {
			return {
				isQualified: false,
				reasons: ["Failed: empty HTML response"]
			};
		}

		const reasons: string[] = [];

		if (!trimmedHtml.toLowerCase().includes("<script")) {
			reasons.push("Failed: no <script> tag found");
		}

		if (isParkingLikePage(trimmedHtml)) {
			reasons.push("Failed: detected parking page");
		}

		if (trimmedHtml.length < MIN_HTML_CHARS) {
			reasons.push("Failed: HTML too small");
		}

		if (reasons.length > 0) {
			return {
				isQualified: false,
				reasons
			};
		}

		return {
			isQualified: true,
			reasons: ["Qualified: HTML contains scripts and passes all checks"]
		};
	});
