import { z } from "zod";
import { checkFindingSchema } from "../contracts.js";

export const dedupeFindings = z
	.function()
	.args(z.array(checkFindingSchema))
	.returns(z.array(checkFindingSchema))
	.implement((findings) => {
		const seenFingerprints = new Set<string>();

		return findings.filter((finding) => {
			if (seenFingerprints.has(finding.fingerprint)) {
				return false;
			}

			seenFingerprints.add(finding.fingerprint);
			return true;
		});
	});
