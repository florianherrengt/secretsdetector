import { defineConfig } from "vitest/config";

	export default defineConfig({
	test: {
		include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
		exclude: ["dist/**", "node_modules/**"],
		setupFiles: ["./vitest.setup.ts"]
	}
});
