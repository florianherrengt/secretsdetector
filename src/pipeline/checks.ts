import { createHash } from "node:crypto";
import { z } from "zod";

const GENERIC_TOKEN_MIN_LENGTH = 20;
const GENERIC_TOKEN_MIN_ENTROPY = 3.6;
const CONTEXT_WINDOW_CHARS = 80;

export const checkFindingSchema = z.object({
	type: z.literal("secret"),
	file: z.string().url(),
	snippet: z.string(),
	fingerprint: z.string()
});

export const checkScriptSchema = z.object({
	file: z.string().url(),
	content: z.string()
});

export const checkRunInputSchema = z.object({
	domain: z.string().url(),
	scripts: z.array(checkScriptSchema)
});

export const checkRunOutputSchema = z.object({
	findings: z.array(checkFindingSchema)
});

export const checkDefinitionSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	description: z.string().min(1)
});

export const checkResultSchema = checkDefinitionSchema.extend({
	findings: z.array(checkFindingSchema)
});

export type CheckFinding = z.infer<typeof checkFindingSchema>;
export type CheckRunInput = z.infer<typeof checkRunInputSchema>;
export type CheckRunOutput = z.infer<typeof checkRunOutputSchema>;
export type CheckDefinition = z.infer<typeof checkDefinitionSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export type ScanCheck = CheckDefinition & {
	run: (input: CheckRunInput) => CheckRunOutput;
};

type ScriptDetection = {
	value: string;
	start: number;
	end: number;
};

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
		const rawSnippet = body.slice(snippetStart, snippetEnd);
		const localStart = start - snippetStart;
		const localEnd = localStart + (end - start);

		const redacted = `${rawSnippet.slice(0, localStart)}${redactSecret(matchedValue)}${rawSnippet.slice(localEnd)}`;
		const snippet = redacted.replace(/\s+/g, " ").trim();

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

const toFinding = z
	.function()
	.args(z.string().url(), z.string(), z.custom<ScriptDetection>())
	.returns(checkFindingSchema)
	.implement((file, body, detection) => {
		return {
			type: "secret",
			file,
			snippet: buildSnippet(body, detection.start, detection.end, detection.value),
			fingerprint: fingerprintValue(detection.value)
		};
	});

const getDetectionContext = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive())
	.returns(z.string())
	.implement((body, start, end) => {
		const contextStart = Math.max(0, start - CONTEXT_WINDOW_CHARS);
		const contextEnd = Math.min(body.length, end + CONTEXT_WINDOW_CHARS);

		return body.slice(contextStart, contextEnd).toLowerCase();
	});

const hasPositiveContext = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive())
	.returns(z.boolean())
	.implement((body, start, end) => {
		const context = getDetectionContext(body, start, end);

		return /\b(secret|token|auth|authorization|password|api[_-]?key|apikey)\b/i.test(context);
	});

const hasNegativeContext = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive())
	.returns(z.boolean())
	.implement((body, start, end) => {
		const context = getDetectionContext(body, start, end);

		return /\b(analytics|measurement|tracking|public|example)\b/i.test(context);
	});

const shannonEntropy = z
	.function()
	.args(z.string())
	.returns(z.number().nonnegative())
	.implement((value) => {
		if (value.length === 0) {
			return 0;
		}

		const counts = new Map<string, number>();

		for (const char of value) {
			counts.set(char, (counts.get(char) ?? 0) + 1);
		}

		const entropy = [...counts.values()].reduce((sum, count) => {
			const probability = count / value.length;
			return sum - probability * Math.log2(probability);
		}, 0);

		return entropy;
	});

const hasGenericTokenEntropy = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
		if (value.length < GENERIC_TOKEN_MIN_LENGTH) {
			return false;
		}

		return shannonEntropy(value) >= GENERIC_TOKEN_MIN_ENTROPY;
	});

const isAllowlistedValue = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
		const lowerValue = value.toLowerCase();

		if (/^pk_(live|test)_[a-z0-9]{6,}$/i.test(value)) {
			return true;
		}

		if (/^g-[a-z0-9]{4,}$/i.test(value) || /^ua-\d{4,}-\d+$/i.test(value)) {
			return true;
		}

		if (/^ca-pub-\d{10,}$/i.test(value)) {
			return true;
		}

		if (lowerValue.includes("example")) {
			return true;
		}

		return false;
	});

const isLikelyJwt = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
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

const findPemDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const marker = "-----BEGIN PRIVATE KEY-----";
		const detections: ScriptDetection[] = [];

		for (const match of body.matchAll(/-----BEGIN PRIVATE KEY-----/g)) {
			if (typeof match.index !== "number") {
				continue;
			}

			const start = match.index;
			const endMarker = "-----END PRIVATE KEY-----";
			const endMarkerIndex = body.indexOf(endMarker, start + marker.length);
			const end = endMarkerIndex === -1 ? start + marker.length : endMarkerIndex + endMarker.length;
			const value = body.slice(start, end);

			detections.push({
				value,
				start,
				end
			});
		}

		return detections;
	});

const findJwtDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const jwtRegex = /(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/g;

		for (const match of body.matchAll(jwtRegex)) {
			const rawValue = match[2] ?? "";

			if (rawValue.length === 0 || !isLikelyJwt(rawValue)) {
				continue;
			}

			if (typeof match.index !== "number") {
				continue;
			}

			const prefixLength = (match[1] ?? "").length;
			const start = match.index + prefixLength;
			const end = start + rawValue.length;

			detections.push({
				value: rawValue,
				start,
				end
			});
		}

		return detections;
	});

const findCredentialUrlDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const credentialUrlRegex = /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@[^\s"'<>]+/g;

		for (const match of body.matchAll(credentialUrlRegex)) {
			const value = match[0] ?? "";

			if (value.length === 0 || typeof match.index !== "number") {
				continue;
			}

			const start = match.index;
			const end = start + value.length;

			detections.push({
				value,
				start,
				end
			});
		}

		return detections;
	});

const findGenericSecretDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const genericTokenRegex = /(["'`])([A-Za-z0-9_./+=-]{16,})\1/g;

		for (const match of body.matchAll(genericTokenRegex)) {
			const value = match[2] ?? "";

			if (value.length === 0 || typeof match.index !== "number") {
				continue;
			}

			if (isAllowlistedValue(value)) {
				continue;
			}

			if (isLikelyJwt(value)) {
				continue;
			}

			if (!hasGenericTokenEntropy(value)) {
				continue;
			}

			const quoteLength = (match[1] ?? "").length;
			const start = match.index + quoteLength;
			const end = start + value.length;

			if (!hasPositiveContext(body, start, end)) {
				continue;
			}

			if (hasNegativeContext(body, start, end)) {
				continue;
			}

			detections.push({
				value,
				start,
				end
			});
		}

		return detections;
	});

const mapDetectionsToFindings = z
	.function()
	.args(z.string().url(), z.string(), z.array(z.custom<ScriptDetection>()))
	.returns(z.array(checkFindingSchema))
	.implement((file, body, detections) => {
		return detections.map((detection) => toFinding(file, body, detection));
	});

const dedupeFindings = z
	.function()
	.args(z.array(checkFindingSchema))
	.returns(z.array(checkFindingSchema))
	.implement((findings) => {
		const seenFingerprints = new Set<string>();

		return findings.filter((finding) => {
			if (seenFingerprints.has(finding.fingerprint)) {
				return false;
			}

			seenFingerprints.add(finding.fingerprint);
			return true;
		});
	});

const runPemKeyCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		const findings = input.scripts.flatMap((script) => {
			return mapDetectionsToFindings(script.file, script.content, findPemDetections(script.content));
		});

		return {
			findings: dedupeFindings(findings)
		};
	});

const runJwtCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		const findings = input.scripts.flatMap((script) => {
			return mapDetectionsToFindings(script.file, script.content, findJwtDetections(script.content));
		});

		return {
			findings: dedupeFindings(findings)
		};
	});

const runCredentialUrlCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		const findings = input.scripts.flatMap((script) => {
			return mapDetectionsToFindings(
				script.file,
				script.content,
				findCredentialUrlDetections(script.content)
			);
		});

		return {
			findings: dedupeFindings(findings)
		};
	});

const runGenericSecretCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		const findings = input.scripts.flatMap((script) => {
			return mapDetectionsToFindings(
				script.file,
				script.content,
				findGenericSecretDetections(script.content)
			);
		});

		return {
			findings: dedupeFindings(findings)
		};
	});

export const builtinChecks: ScanCheck[] = [
	{
		id: "pem-key",
		name: "PEM Key Detection",
		description: "Detects private key PEM blocks exposed in JavaScript assets.",
		run: runPemKeyCheck
	},
	{
		id: "jwt-token",
		name: "JWT Detection",
		description: "Detects likely JWT token strings with 3-part token structure.",
		run: runJwtCheck
	},
	{
		id: "credential-url",
		name: "Credential URL Detection",
		description: "Detects URLs that embed username and password credentials.",
		run: runCredentialUrlCheck
	},
	{
		id: "generic-secret",
		name: "Generic Secret Detection",
		description: "Detects high-entropy secret-like tokens with context validation.",
		run: runGenericSecretCheck
	}
];
