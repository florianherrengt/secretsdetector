import type { ScanCheck } from "./contracts.js";
import { pemKeyCheck } from "./checks/pem-key/index.js";
import { jwtTokenCheck } from "./checks/jwt-token/index.js";
import { credentialUrlCheck } from "./checks/credential-url/index.js";
import { genericSecretCheck } from "./checks/generic-secret/index.js";

export const builtinChecks: ScanCheck[] = [
	pemKeyCheck,
	jwtTokenCheck,
	credentialUrlCheck,
	genericSecretCheck
];
