import { checkDefinitionSchema } from "../../contracts.js";

export const genericSecretCheckMetadata = checkDefinitionSchema.parse({
	id: "generic-secret",
	name: "Generic Secret Detection",
	description: "Detects high-entropy secret-like tokens with context validation."
});
