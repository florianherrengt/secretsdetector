import { z } from "zod";
import { checkRunInputSchema, checkRunOutputSchema } from "../../contracts.js";
import { mapDetectionsToFindings } from "../../shared/detection.js";
import { dedupeFindings } from "../../shared/dedupe.js";
import { findLocalStorageJwtDetections } from "./detector.js";

export const runLocalStorageJwtCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		const findings = input.scripts.flatMap((script) => {
			return mapDetectionsToFindings(
				script.file,
				script.content,
				findLocalStorageJwtDetections(script.content)
			);
		});

		return {
			findings: dedupeFindings(findings)
		};
	});
