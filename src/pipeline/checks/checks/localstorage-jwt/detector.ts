import { z } from 'zod';
import type { ScriptDetection } from '../../shared/detection.js';
import { isLikelyJwt } from '../../shared/jwt.js';

const TOKEN_KEYS: readonly string[] = [
	'token',
	'jwttoken',
	'jwt',
	'accesstoken',
	'refreshtoken',
	'idtoken',
	'authtoken',
	'sessiontoken',
	'bearertoken',
];

const tokenKeySet = new Set(TOKEN_KEYS);

const identifierCaptureRegex = /[a-zA-Z_$][a-zA-Z0-9_$]*/g;

const normalizeKey = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((raw) => {
		return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
	});

const extractToken = z
	.function()
	.args(z.string())
	.returns(
		z.object({
			text: z.string(),
			isLiteral: z.boolean(),
		}),
	)
	.implement((raw) => {
		const trimmed = raw.trim();

		if (
			(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			return { text: trimmed.slice(1, -1), isLiteral: true };
		}

		if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
			const content = trimmed.slice(1, -1);

			if (content.includes('${')) {
				return { text: '', isLiteral: true };
			}

			return { text: content, isLiteral: true };
		}

		return { text: trimmed, isLiteral: false };
	});

const extractIdentifierCandidates = z
	.function()
	.args(z.string())
	.returns(z.array(z.string()))
	.implement((rawExpression) => {
		const matches = rawExpression.match(identifierCaptureRegex) ?? [];

		return matches
			.map((candidate) => normalizeKey(candidate))
			.filter((candidate) => candidate.length > 0);
	});

const isTokenLikeCandidate = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((candidate) => {
		return tokenKeySet.has(candidate) || candidate.includes('token') || candidate.includes('jwt');
	});

const matchesRule = z
	.function()
	.args(z.string(), z.string(), z.boolean())
	.returns(z.boolean())
	.implement((rawKey, rawValueText, valueIsLiteral) => {
		const normalizedKey = normalizeKey(rawKey);

		if (isTokenLikeCandidate(normalizedKey)) {
			return true;
		}

		const keyCandidates = extractIdentifierCandidates(rawKey);

		if (keyCandidates.some((candidate) => isTokenLikeCandidate(candidate))) {
			return true;
		}

		if (valueIsLiteral && isLikelyJwt(rawValueText)) {
			return true;
		}

		if (!valueIsLiteral) {
			const valueCandidates = extractIdentifierCandidates(rawValueText);

			if (valueCandidates.some((candidate) => isTokenLikeCandidate(candidate))) {
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
		if (valueIsLiteral && isLikelyJwt(rawValueText)) {
			return 'jwt-literal';
		}

		if (valueIsLiteral) {
			return 'literal';
		}

		return 'identifier';
	});

const quotedTokenPattern = `"[^"]*"|'[^']*'`;
const templateTokenPattern = '`[^`]*`';
const identifierPattern = '[a-zA-Z_$][a-zA-Z0-9_$]*';
const memberExpressionPattern = `${identifierPattern}(?:\\s*(?:\\.\\s*${identifierPattern}|\\[\\s*(?:${quotedTokenPattern}|${identifierPattern})\\s*\\]))*`;
const tokenPattern = `(?:${quotedTokenPattern}|${templateTokenPattern}|${memberExpressionPattern})`;

const setItemRegex = new RegExp(
	`(?:(?:window|globalThis)\\s*\\.\\s*)?localStorage\\s*\\.\\s*setItem\\s*\\(\\s*(${tokenPattern})\\s*,\\s*(${tokenPattern})\\s*\\)`,
	'gi',
);

const bracketAssignRegex = new RegExp(
	`(?:(?:window|globalThis)\\s*\\.\\s*)?localStorage\\s*\\[\\s*(${tokenPattern})\\s*\\]\\s*=\\s*(${tokenPattern})`,
	'gi',
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
			const rawKey = match[1] ?? '';
			const rawValue = match[2] ?? '';

			if (rawKey.length === 0 || rawValue.length === 0) {
				continue;
			}

			if (typeof match.index !== 'number') {
				continue;
			}

			results.push({
				sink,
				rawKey,
				rawValue,
				start: match.index,
				end: match.index + match[0].length,
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
			...collectMatches(setItemRegex, body, 'localStorage.setItem'),
			...collectMatches(bracketAssignRegex, body, 'localStorage.bracket'),
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
				end: rawMatch.end,
			});
		}

		return detections;
	});
