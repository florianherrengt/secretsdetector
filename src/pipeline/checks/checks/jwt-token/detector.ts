import { z } from 'zod';
import type { ScriptDetection } from '../../shared/detection.js';
import { isLikelyJwt } from '../../shared/jwt.js';

export const findJwtDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const jwtRegex =
			/(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/g;

		for (const match of body.matchAll(jwtRegex)) {
			const rawValue = match[2] ?? '';

			if (rawValue.length === 0 || !isLikelyJwt(rawValue)) {
				continue;
			}

			if (typeof match.index !== 'number') {
				continue;
			}

			const prefixLength = (match[1] ?? '').length;
			const start = match.index + prefixLength;
			const end = start + rawValue.length;

			detections.push({
				value: rawValue,
				start,
				end,
			});
		}

		return detections;
	});
