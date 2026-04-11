import type { ScanCheck } from "../../contracts.js";
import { pemKeyCheckMetadata } from "./metadata.js";
import { runPemKeyCheck } from "./run.js";

export const pemKeyCheck: ScanCheck = {
	...pemKeyCheckMetadata,
	run: runPemKeyCheck
};
