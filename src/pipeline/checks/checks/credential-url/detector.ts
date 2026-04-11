import { z } from "zod";
import type { ScriptDetection } from "../../shared/detection.js";

export const findCredentialUrlDetections = z
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
