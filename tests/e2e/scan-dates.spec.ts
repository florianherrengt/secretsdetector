import { expect, test } from "./fixtures/authed";

const waitForScanCompletion = async (page: import("@playwright/test").Page) => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const issueDetected = await page
			.getByText("Issue Detected", { exact: true })
			.count();
		const noIssuesFound = await page
			.getByText("No Issues Found", { exact: true })
			.count();

		if (issueDetected > 0 || noIssuesFound > 0) {
			return;
		}

		await page.waitForTimeout(250);
		await page.reload();
	}

	throw new Error("Timed out waiting for scan completion");
};

test.describe("localized date display", () => {
	test("sets tz and locale cookies then renders formatted dates on scan result", async ({
		authedPage,
	}) => {
		const page = authedPage;

		await page.goto("/");

		const tzCookie = await page.context().cookies();
		const tz = tzCookie.find((c) => c.name === "tz");
		const locale = tzCookie.find((c) => c.name === "locale");

		expect(tz).toBeDefined();
		expect(tz!.value.length).toBeGreaterThan(0);
		expect(locale).toBeDefined();
		expect(locale!.value.length).toBeGreaterThan(0);

		await page
			.getByPlaceholder("Enter any URL to scan")
			.fill("localhost:3000/sandbox/demo");
		await page.getByRole("button", { name: "Scan now" }).click();

		await page.waitForURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await expect(page).toHaveTitle("Scan Result | Secret Detector");
		await waitForScanCompletion(page);

		const startedText = page.locator("p.font-mono").first();
		await expect(startedText).toHaveText(/\d{2}:\d{2}:\d{2} \d{2}\/\d{2}\/\d{2} \([+-]\d{2}:\d{2}\)/);
	});
});
