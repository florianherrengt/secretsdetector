import { z } from "zod";
import type { ScriptDetection } from "../../shared/detection.js";

export const findPemDetections = z
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
