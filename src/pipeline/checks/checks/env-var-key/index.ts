import type { ScanCheck } from "../../contracts.js";
import { envVarKeyCheckMetadata } from "./metadata.js";
import { runEnvVarKeyCheck } from "./run.js";

export const envVarKeyCheck: ScanCheck = {
	...envVarKeyCheckMetadata,
	run: runEnvVarKeyCheck
};
