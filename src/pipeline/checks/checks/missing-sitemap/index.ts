import type { ScanCheck } from "../../contracts.js";
import { missingSitemapCheckMetadata } from "./metadata.js";
import { runMissingSitemapCheck } from "./run.js";

export const missingSitemapCheck: ScanCheck = {
	...missingSitemapCheckMetadata,
	run: runMissingSitemapCheck
};
