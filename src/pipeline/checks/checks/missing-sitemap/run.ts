import { z } from "zod";
import {
	checkRunInputSchema,
	checkRunOutputSchema,
	checkFindingSchema
} from "../../contracts.js";
import { fingerprintValue } from "../../shared/fingerprint.js";

export const runMissingSitemapCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		if (input.sitemapFound !== false) {
			return { findings: [] };
		}

		const sitemapUrl = new URL("/sitemap.xml", input.domain).toString();
		const hostname = new URL(input.domain).hostname;

		const finding: z.infer<typeof checkFindingSchema> = {
			type: "secret",
			file: sitemapUrl,
			snippet: `No sitemap.xml found for ${hostname}`,
			fingerprint: fingerprintValue(`missing-sitemap:${input.domain}`)
		};

		return { findings: [finding] };
	});
