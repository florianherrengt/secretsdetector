import type { ScanCheck } from "../../contracts.js";
import { genericSecretCheckMetadata } from "./metadata.js";
import { runGenericSecretCheck } from "./run.js";

export const genericSecretCheck: ScanCheck = {
	...genericSecretCheckMetadata,
	run: runGenericSecretCheck
};
