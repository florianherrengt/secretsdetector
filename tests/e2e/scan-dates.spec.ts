import { expect, test } from './fixtures/authed';

const waitForScanCompletion = async (page: import('@playwright/test').Page) => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const issueDetected = await page.getByText('Issue Detected', { exact: true }).count();
		const noIssuesFound = await page.getByText('No Issues Found', { exact: true }).count();

		if (issueDetected > 0 || noIssuesFound > 0) {
			return;
		}

		await page.waitForTimeout(250);
		await page.reload();
	}

	throw new Error('Timed out waiting for scan completion');
};

test.describe('scan result timestamps', () => {
	test('renders <time> elements with ISO datetime on scan result', async ({ authedPage: page }) => {
		await page.goto('/');

		await page.getByPlaceholder('Enter any URL to scan').fill('localhost:3000/sandbox/demo');
		await page.getByRole('button', { name: 'Scan now' }).click();

		await page.waitForURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await expect(page).toHaveTitle('Scan Result | Secrets Watch');
		await waitForScanCompletion(page);

		const timeElement = page.locator('time').first();
		await expect(timeElement).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
		await expect(timeElement).not.toHaveText('— : —');
		await expect(timeElement).toHaveText(/[0-9]/);
	});
});
