import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures/authed";

const waitForScanCompletion = async (page: Page) => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const statusText = await page.locator("section[aria-live='polite'] p").first().textContent();

		if (statusText?.includes("Issue Detected") || statusText?.includes("No Issues Found")) {
			return;
		}

		if (!statusText?.includes("Scan In Progress")) {
			throw new Error("Scan entered failed state during e2e test");
		}

		await page.waitForTimeout(250);
		await page.reload();
	}

	throw new Error("Timed out waiting for scan completion");
};

const startDemoExampleScan = async (page: Page, exampleTitle: string) => {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		const demoCard = page.locator("li", {
			has: page.getByText(exampleTitle, { exact: true })
		});

		await demoCard.getByRole("button", { name: "Scan with tool" }).click();
		await page.waitForURL(/\/scan(\/[0-9a-f-]{36})?$/, { timeout: 5_000 });

		if (/\/scan\/[0-9a-f-]{36}$/.test(page.url())) {
			await expect(page).toHaveTitle("Scan Result | Secret Detector");
			await waitForScanCompletion(page);
			return;
		}

		const limited = await page.getByRole("heading", { name: "Too Many Requests" }).count();

		if (limited === 0) {
			throw new Error(`Expected scan result redirect for "${exampleTitle}" but stayed on ${page.url()}`);
		}

		await page.waitForTimeout(2_000 * (attempt + 1));
		await page.goto("/");
	}

	throw new Error(`Rate limit prevented scanning demo example "${exampleTitle}"`);
};

test("home page loads", async ({ page }) => {
	await page.goto("/");

	await expect(page).toHaveTitle("Home | Secret Detector");
	await expect(page.getByRole("heading", { name: "Secret Detector" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Run scan" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Go to app" })).toHaveCount(0);
});

test("home page shows go to app when user is logged in", async ({ authedPage }) => {
	const page = authedPage;

	await page.goto("/");

	await expect(page.getByRole("link", { name: "Go to app" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
	await expect(page.getByRole("link", { name: "Sign up" })).toHaveCount(0);
});

test("sign in button goes to sign in page", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("link", { name: "Sign in" }).click();

	await expect(page).toHaveURL(/\/auth\/sign-in$/);
	await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});

test("sign up button goes to sign up page", async ({ page }) => {
	await page.goto("/");

	await page.getByRole("link", { name: "Sign up" }).click();

	await expect(page).toHaveURL(/\/auth\/sign-up$/);
	await expect(page.getByRole("heading", { name: "Sign Up" })).toBeVisible();
});

test("sign in page submits to request-link", async ({ page }) => {
	const email = `signin-${Date.now()}@example.com`;

	await page.goto("/auth/sign-in");
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Send magic link" }).click();

	await expect(page.getByText("Check your email for a sign-in link.")).toBeVisible();
});

test("sign up page submits to request-link", async ({ page }) => {
	const email = `signup-${Date.now()}@example.com`;

	await page.goto("/auth/sign-up");
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Send magic link" }).click();

	await expect(page.getByText("Check your email for a sign-in link.")).toBeVisible();
});

const demoExamples = [
	{ title: "PEM key in frontend bundle", expectedCheck: "PEM Key Detection" },
	{ title: "JWT token shipped to client", expectedCheck: "JWT Detection" },
	{ title: "Credential in URL", expectedCheck: "Credential URL Detection" },
	{ title: "Clean baseline", expectedCheck: null },
	{ title: "Multiple scripts, first one leaks", expectedCheck: "Credential URL Detection" }
] as const;

test.describe("demo example scans", () => {
	test.describe.configure({ mode: "serial" });

	for (const demoExample of demoExamples) {
		test(`demo example scan works: ${demoExample.title}`, async ({ authedPage }) => {
			const page = authedPage;
			await page.goto("/");

			await startDemoExampleScan(page, demoExample.title);

			const issueSection = page.locator("section", {
				has: page.getByRole("heading", { name: "Issue Detected" })
			});

			if (demoExample.expectedCheck === null) {
				await expect(page.locator("section[aria-live='polite']")).toContainText("No Issues Found");
				await expect(issueSection).toContainText("No checks in this group.");
				return;
			}

			await expect(page.locator("section[aria-live='polite']")).toContainText("Issue Detected");
			await expect(issueSection).toContainText(demoExample.expectedCheck);
			await expect(page.getByText("[REDACTED]")).toBeVisible();
		});
	}

	test("repeat pem-key demo scan still shows findings", async ({ authedPage }) => {
		const page = authedPage;

		await page.goto("/");
		await startDemoExampleScan(page, "PEM key in frontend bundle");
		await expect(page.getByText("PEM Key Detection")).toBeVisible();

		await page.goto("/");
		await startDemoExampleScan(page, "PEM key in frontend bundle");
		await expect(page.getByText("PEM Key Detection")).toBeVisible();
		await expect(page.getByText("[REDACTED]")).toBeVisible();
	});
});
