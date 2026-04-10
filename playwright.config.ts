import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "on-first-retry"
	},
	projects: [
		{
			name: "chrome",
			use: {
				...devices["Desktop Chrome"],
				channel: "chrome"
			}
		}
	],
	webServer: {
		command: "npm run build && npm run start",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: !process.env.CI,
		env: {
			PORT: "4173"
		}
	}
});
