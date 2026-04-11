import { checkDefinitionSchema } from "../../contracts.js";

export const pemKeyCheckMetadata = checkDefinitionSchema.parse({
	id: "pem-key",
	name: "PEM Key Detection",
	description: "Detects private key PEM blocks exposed in JavaScript assets."
});
