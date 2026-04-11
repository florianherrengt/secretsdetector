import { z } from "zod";
import type { ScriptDetection } from "../../shared/detection.js";

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

export const findJwtDetections = z
	.function()
	.args(z.string())
	.returns(z.array(z.custom<ScriptDetection>()))
	.implement((body) => {
		const detections: ScriptDetection[] = [];
		const jwtRegex =
			/(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])/g;

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
