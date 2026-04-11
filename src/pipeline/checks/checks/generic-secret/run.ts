import { z } from "zod";
import { checkRunInputSchema, checkRunOutputSchema } from "../../contracts.js";
import { mapDetectionsToFindings } from "../../shared/detection.js";
import { dedupeFindings } from "../../shared/dedupe.js";
import { findGenericSecretDetections } from "./detector.js";

export const runGenericSecretCheck = z
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
