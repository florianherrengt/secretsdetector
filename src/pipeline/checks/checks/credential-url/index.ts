import type { ScanCheck } from "../../contracts.js";
import { credentialUrlCheckMetadata } from "./metadata.js";
import { runCredentialUrlCheck } from "./run.js";

export const credentialUrlCheck: ScanCheck = {
	...credentialUrlCheckMetadata,
	run: runCredentialUrlCheck
};
