import { z } from "zod";
import { SENSITIVE_ENV_VAR_KEYS, IMPLAUSIBLE_VALUES } from "./keys.js";
import type { ScriptDetection } from "../../shared/detection.js";

const implausibleSet = new Set(IMPLAUSIBLE_VALUES);

const buildPatternsForKey = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<RegExp>()))
	.implement((keyName) => {
		const escaped = keyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const prefix = `(?<![a-zA-Z0-9_$.])${escaped}\\s*[=:]\\s*`;

		return [
			new RegExp(`${prefix}"((?:[^"\\\\]|\\\\.)*)"`, "gi"),
			new RegExp(`${prefix}'((?:[^'\\\\]|\\\\.)*)'`, "gi"),
			new RegExp(`${prefix}\`((?:[^\`\\\\]|\\\\.)*)\``, "gi")
		];
	});

export const findEnvVarKeyDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const seenPositions = new Set<string>();

		for (const keyName of SENSITIVE_ENV_VAR_KEYS) {
			const patterns = buildPatternsForKey(keyName);

			for (const regex of patterns) {
				regex.lastIndex = 0;

				for (const match of body.matchAll(regex)) {
					const stringValue = match[1] ?? "";

					if (stringValue.length === 0) {
						continue;
					}

					if (implausibleSet.has(stringValue.toLowerCase())) {
						continue;
					}

					if (regex.source.includes("`") && stringValue.includes("${")) {
						continue;
					}

					const fullMatch = match[0];
					const matchIndex = match.index ?? 0;
					const valueOffsetInMatch = fullMatch.indexOf(stringValue, fullMatch.length - stringValue.length - 1);
					const valueStart = matchIndex + (valueOffsetInMatch >= 0 ? valueOffsetInMatch : fullMatch.indexOf(stringValue));
					const valueEnd = valueStart + stringValue.length;

					const positionKey = `${valueStart}:${valueEnd}`;
					if (seenPositions.has(positionKey)) {
						continue;
					}
					seenPositions.add(positionKey);

					detections.push({
						value: stringValue,
						start: valueStart,
						end: valueEnd
					});
				}
			}
		}

		return detections;
	});
