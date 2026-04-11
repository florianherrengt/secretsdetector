import { checkDefinitionSchema } from "../../contracts.js";

export const jwtTokenCheckMetadata = checkDefinitionSchema.parse({
	id: "jwt-token",
	name: "JWT Detection",
	description: "Detects likely JWT token strings with 3-part token structure."
});
