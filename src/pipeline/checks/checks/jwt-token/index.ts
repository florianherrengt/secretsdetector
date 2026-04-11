import type { ScanCheck } from "../../contracts.js";
import { jwtTokenCheckMetadata } from "./metadata.js";
import { runJwtCheck } from "./run.js";

export const jwtTokenCheck: ScanCheck = {
	...jwtTokenCheckMetadata,
	run: runJwtCheck
};
