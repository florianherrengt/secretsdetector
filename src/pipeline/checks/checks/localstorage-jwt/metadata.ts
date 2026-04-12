import { checkDefinitionSchema } from "../../contracts.js";

export const localStorageJwtCheckMetadata = checkDefinitionSchema.parse({
	id: "localstorage-jwt",
	name: "LocalStorage JWT/Token Storage",
	description:
		"Detects token or JWT writes to localStorage in client-side JavaScript."
});
