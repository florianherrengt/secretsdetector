import { checkDefinitionSchema } from "../../contracts.js";

export const missingSitemapCheckMetadata = checkDefinitionSchema.parse({
	id: "missing-sitemap",
	name: "Missing Sitemap",
	description:
		"Detects when a domain does not expose a sitemap.xml file, which can impact SEO and site discoverability."
});
