import { checkDefinitionSchema } from "../../contracts.js";

export const credentialUrlCheckMetadata = checkDefinitionSchema.parse({
	id: "credential-url",
	name: "Credential URL Detection",
	description: "Detects URLs that embed username and password credentials."
});
