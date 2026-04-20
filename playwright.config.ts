import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const domain = process.env.DOMAIN ?? '127.0.0.1:3000';
const baseURL = domain.includes('://') ? domain : `http://${domain}`;
const port = Number(process.env.PORT) || 3000;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	use: {
		baseURL,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chrome',
			use: {
				...devices['Desktop Chrome'],
				channel: 'chrome',
			},
		},
	],
	webServer: {
		command: 'npm run test:e2e:serve',
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		env: {
			...process.env,
			PORT: String(port),
			DOMAIN: domain,
			DEBUG_ENDPOINT: 'true',
			RESEND_API_KEY: '',
			RATE_LIMIT_DISABLED: 'true',
			STRIPE_BILLING_MOCK_URL: 'https://billing-mock.stripe.com/test-portal',
		},
	},
});
