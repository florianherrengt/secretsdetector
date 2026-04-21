import { z } from 'zod';
import { hasNegativeContext, hasPositiveContext } from '../../shared/context.js';
import type { ScriptDetection } from '../../shared/detection.js';
import { hasGenericTokenEntropy } from '../../shared/entropy.js';
import { isLikelyJwt } from '../../shared/jwt.js';

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

		if (lowerValue.includes('example')) {
			return true;
		}

		return false;
	});

export const findGenericSecretDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const genericTokenRegex = /(["'`])([A-Za-z0-9_./+=-]{16,})\1/g;

		for (const match of body.matchAll(genericTokenRegex)) {
			const value = match[2] ?? '';

			if (value.length === 0 || typeof match.index !== 'number') {
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

			const quoteLength = (match[1] ?? '').length;
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
				end,
			});
		}

		return detections;
	});
