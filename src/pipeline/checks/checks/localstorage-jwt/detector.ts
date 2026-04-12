import { z } from "zod";
import type { ScriptDetection } from "../../shared/detection.js";

const TOKEN_KEYS: readonly string[] = [
	"token",
	"jwttoken",
	"jwt",
	"accesstoken",
	"refreshtoken",
	"idtoken",
	"authtoken",
	"sessiontoken",
	"bearertoken"
];

const tokenKeySet = new Set(TOKEN_KEYS);

const normalizeKey = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((raw) => {
		return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
	});

const extractToken = z
	.function()
	.args(z.string())
	.returns(
		z.object({
			text: z.string(),
			isLiteral: z.boolean()
		})
	)
	.implement((raw) => {
		const trimmed = raw.trim();

		if (
			(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			return { text: trimmed.slice(1, -1), isLiteral: true };
		}

		if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
			const content = trimmed.slice(1, -1);

			if (content.includes("${")) {
				return { text: "", isLiteral: true };
			}

			return { text: content, isLiteral: true };
		}

		return { text: trimmed, isLiteral: false };
	});

const isJwtLiteral = z
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

		if (
			segments[0].length < 10 ||
			segments[1].length < 10 ||
			segments[2].length < 16
		) {
			return false;
		}

		return true;
	});

const matchesRule = z
	.function()
	.args(z.string(), z.string(), z.boolean())
	.returns(z.boolean())
	.implement((rawKey, rawValueText, valueIsLiteral) => {
		const normalizedKey = normalizeKey(rawKey);

		if (tokenKeySet.has(normalizedKey)) {
			return true;
		}

		if (valueIsLiteral && isJwtLiteral(rawValueText)) {
			return true;
		}

		if (!valueIsLiteral) {
			const normalizedValue = normalizeKey(rawValueText);

			if (tokenKeySet.has(normalizedValue)) {
				return true;
			}
		}

		return false;
	});

const getValueType = z
	.function()
	.args(z.string(), z.boolean())
	.returns(z.string())
	.implement((rawValueText, valueIsLiteral) => {
		if (valueIsLiteral && isJwtLiteral(rawValueText)) {
			return "jwt-literal";
		}

		if (valueIsLiteral) {
			return "literal";
		}

		return "identifier";
	});

const quotedTokenPattern = `"[^"]*"|'[^']*'`;
const templateTokenPattern = "`[^`]*`";
const identifierPattern = "[a-zA-Z_$][a-zA-Z0-9_$]*";
const tokenPattern = `(?:${quotedTokenPattern}|${templateTokenPattern}|${identifierPattern})`;

const setItemRegex = new RegExp(
	`(?:(?:window|globalThis)\\s*\\.\\s*)?localStorage\\s*\\.\\s*setItem\\s*\\(\\s*(${tokenPattern})\\s*,\\s*(${tokenPattern})\\s*\\)`,
	"gi"
);

const bracketAssignRegex = new RegExp(
	`(?:(?:window|globalThis)\\s*\\.\\s*)?localStorage\\s*\\[\\s*(${tokenPattern})\\s*\\]\\s*=\\s*(${tokenPattern})`,
	"gi"
);

interface RawMatch {
	readonly sink: string;
	readonly rawKey: string;
	readonly rawValue: string;
	readonly start: number;
	readonly end: number;
}

const collectMatches = z
	.function()
	.args(z.custom<RegExp>(), z.string(), z.string())
	.returns(z.array(z.custom<RawMatch>()))
	.implement((regex, body, sink) => {
		const results: RawMatch[] = [];

		regex.lastIndex = 0;

		for (const match of body.matchAll(regex)) {
			const rawKey = match[1] ?? "";
			const rawValue = match[2] ?? "";

			if (rawKey.length === 0 || rawValue.length === 0) {
				continue;
			}

			if (typeof match.index !== "number") {
				continue;
			}

			results.push({
				sink,
				rawKey,
				rawValue,
				start: match.index,
				end: match.index + match[0].length
			});
		}

		return results;
	});

export const findLocalStorageJwtDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const seenPositions = new Set<string>();

		const allMatches: RawMatch[] = [
			...collectMatches(setItemRegex, body, "localStorage.setItem"),
			...collectMatches(bracketAssignRegex, body, "localStorage.bracket")
		];

		for (const rawMatch of allMatches) {
			const key = extractToken(rawMatch.rawKey);
			const value = extractToken(rawMatch.rawValue);

			if (key.text.length === 0 || value.text.length === 0) {
				continue;
			}

			if (!matchesRule(key.text, value.text, value.isLiteral)) {
				continue;
			}

			const positionKey = `${rawMatch.start}:${rawMatch.end}`;

			if (seenPositions.has(positionKey)) {
				continue;
			}

			seenPositions.add(positionKey);

			const normalizedKey = normalizeKey(key.text);
			const valueType = getValueType(value.text, value.isLiteral);
			const signature = `sink=${rawMatch.sink};key=${normalizedKey};value=${valueType}`;

			detections.push({
				value: signature,
				start: rawMatch.start,
				end: rawMatch.end
			});
		}

		return detections;
	});
