import type { ScanCheck } from "../../contracts.js";
import { localStorageJwtCheckMetadata } from "./metadata.js";
import { runLocalStorageJwtCheck } from "./run.js";

export const localStorageJwtCheck: ScanCheck = {
	...localStorageJwtCheckMetadata,
	run: runLocalStorageJwtCheck
};
