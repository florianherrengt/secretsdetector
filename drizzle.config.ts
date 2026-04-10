import { defineConfig } from "drizzle-kit";

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgresql://secret_detector:secret_detector@localhost:5432/secret_detector";

export default defineConfig({
	schema: "./src/server/db/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: databaseUrl
	}
});
