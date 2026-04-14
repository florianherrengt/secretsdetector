import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures/authed";

const waitForScanCompletion = async (page: Page) => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const issueDetected = await page.getByText("Issue Detected", { exact: true }).count();
		const noIssuesFound = await page.getByText("No Issues Found", { exact: true }).count();

		if (issueDetected > 0 || noIssuesFound > 0) {
			return;
		}

		await page.waitForTimeout(250);
		await page.reload();
	}

	throw new Error("Timed out waiting for scan completion");
};

test.describe("localStorage JWT detection", () => {
	test("flags token key in large bundle fixture from home scan flow", async ({ authedPage }) => {
		const page = authedPage;

		await page.goto("/");
		await page.getByPlaceholder("Enter any URL to scan").fill("localhost:3000/sandbox/demo/large");
		await page.getByRole("button", { name: "Scan now" }).click();

		await page.waitForURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 15_000 });
		await waitForScanCompletion(page);

		await expect(page.getByText("LocalStorage JWT/Token Storage", { exact: true })).toBeVisible();
		await expect(page.getByText("Token Storage Exposure • 1 Issue Found", { exact: true })).toBeVisible();
		await expect(
			page.locator("p", {
				hasText: "File: http://localhost:3000/sandbox/demo/assets/main.large.js"
			}).first()
		).toBeVisible();
	});
});
