import { checkDefinitionSchema } from "../../contracts.js";

export const envVarKeyCheckMetadata = checkDefinitionSchema.parse({
	id: "env-var-key",
	name: "Environment Variable Key Leak",
	description: "Detects known sensitive environment variable key names assigned string literal values in client-side JavaScript."
});
