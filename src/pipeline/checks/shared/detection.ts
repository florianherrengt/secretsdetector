import { z } from "zod";
import { checkFindingSchema } from "../contracts.js";
import { buildSnippet } from "./snippet.js";
import { fingerprintValue } from "./fingerprint.js";

export type ScriptDetection = {
	value: string;
	start: number;
	end: number;
};

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

export const mapDetectionsToFindings = z
	.function()
	.args(z.string().url(), z.string(), z.array(z.custom<ScriptDetection>()))
	.returns(z.array(checkFindingSchema))
	.implement((file, body, detections) => {
		return detections.map((detection) => toFinding(file, body, detection));
	});
