import { z } from "zod";
import {
	checkRunInputSchema,
	checkRunOutputSchema,
	checkFindingSchema
} from "../../contracts.js";
import { fingerprintValue } from "../../shared/fingerprint.js";

const toDirectoryUrl = z
	.function()
	.args(z.string().url())
	.returns(z.string().url())
	.implement((domainUrl) => {
		const parsedUrl = new URL(domainUrl);

		if (!parsedUrl.pathname.endsWith("/")) {
			parsedUrl.pathname = `${parsedUrl.pathname}/`;
		}

		parsedUrl.search = "";
		parsedUrl.hash = "";

		return parsedUrl.toString();
	});

export const runMissingSitemapCheck = z
	.function()
	.args(checkRunInputSchema)
	.returns(checkRunOutputSchema)
	.implement((input) => {
		if (input.sitemapFound !== false) {
			return { findings: [] };
		}

		const sitemapUrl = new URL("sitemap.xml", toDirectoryUrl(input.domain)).toString();
		const hostname = new URL(input.domain).hostname;

		const finding: z.infer<typeof checkFindingSchema> = {
			type: "secret",
			file: sitemapUrl,
			snippet: `No sitemap.xml found for ${hostname} at ${sitemapUrl}`,
			fingerprint: fingerprintValue(`missing-sitemap:${input.domain}`)
		};

		return { findings: [finding] };
	});
