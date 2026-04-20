import 'dotenv/config';
import { chromium } from 'playwright';

const DOMAIN = process.env.DOMAIN ?? 'localhost:3000';
const BASE_URL = DOMAIN.includes('://') ? DOMAIN : `http://${DOMAIN}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
	if (!process.env.STRIPE_SECRET_KEY) {
		console.error('STRIPE_SECRET_KEY must be set in .env');
		process.exit(1);
	}

	const browser = await chromium.launch({ headless: false });
	const context = await browser.newContext();
	const page = await context.newPage();

	console.log(`1. Navigating to ${BASE_URL}/auth/sign-in`);
	await page.goto(`${BASE_URL}/auth/sign-in`);

	const testEmail = `billing-verify-${Date.now()}@example.com`;
	console.log(`2. Requesting magic link for ${testEmail}`);

	await page.fill('input[name="email"], input[type="email"]', testEmail);
	await page.click('button[type="submit"]');

	await page.waitForSelector('text=Check your email', { timeout: 10000 }).catch(() => {});
	await sleep(1000);

	console.log('3. Fetching magic link from debug endpoint');
	const emailsResponse = await page.request.get(`${BASE_URL}/debug/emails`);
	const emails = await emailsResponse.json();
	const match = emails
		.filter((e) => e.to === testEmail)
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
		?.html?.match(/href="([^"]*auth\/verify\?token=[^"]*)"/);

	if (!match) {
		console.error('Could not find magic link in debug emails');
		await browser.close();
		process.exit(1);
	}

	const magicLink = match[1].startsWith('http') ? match[1] : `${BASE_URL}${match[1]}`;
	console.log('4. Visiting magic link');
	await page.goto(magicLink);
	await page.waitForURL('**/domains', { timeout: 10000 });
	console.log('   Authenticated successfully');

	console.log('5. Navigating to /settings');
	await page.goto(`${BASE_URL}/settings`);

	const billingHeading = page.getByRole('heading', { name: 'Billing' });
	await billingHeading.waitFor({ timeout: 5000 });
	console.log('   Billing section visible');

	const manageBtn = page.locator('form[action="/settings/billing/portal"] button[type="submit"]');
	await manageBtn.waitFor({ timeout: 5000 });
	const isDisabled = await manageBtn.isDisabled();
	console.log(`   "Manage billing" button is ${isDisabled ? 'DISABLED' : 'ENABLED'}`);

	if (isDisabled) {
		console.log('   Button is disabled — STRIPE_SECRET_KEY may not be available to the server');
		await browser.close();
		process.exit(1);
	}

	console.log('6. Clicking "Manage billing"');
	const [response] = await Promise.all([
		page.waitForNavigation({ timeout: 15000 }),
		manageBtn.click(),
	]);

	const finalUrl = page.url();
	console.log(`   Landed on: ${finalUrl}`);

	const isStripe = finalUrl.includes('stripe.com') || finalUrl.includes('billing.stripe');
	if (isStripe) {
		console.log('   Redirected to Stripe Customer Portal');
	} else {
		console.log('   WARNING: Did not redirect to Stripe');
	}

	const flashVisible = await page
		.getByText('Unable to open billing portal')
		.isVisible()
		.catch(() => false);
	if (flashVisible) {
		console.log('   Flash error message is visible — Stripe call failed');
	}

	console.log(`7. Verifying "Return to" link points back to app`);
	const returnLinkVisible = await page
		.getByText(/return to/i)
		.isVisible()
		.catch(() => false);
	console.log(`   Return link visible: ${returnLinkVisible}`);

	await page.screenshot({ path: 'billing-portal-verification.png', fullPage: true });
	console.log('8. Screenshot saved to billing-portal-verification.png');

	await browser.close();

	if (isStripe) {
		console.log('\nBilling portal verification PASSED');
	} else {
		console.log('\nBilling portal verification FAILED');
		process.exit(1);
	}
}

main().catch((err) => {
	console.error('Verification failed:', err);
	process.exit(1);
});
