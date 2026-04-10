import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
	await page.goto("/");

	await expect(page).toHaveTitle("Home | Secret Detector");
	await expect(page.getByRole("heading", { name: "Secret Detector" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Run scan" })).toBeVisible();
});

test("scan form submits and renders no-findings result", async ({ page }) => {
	await page.goto("/");

	await page.getByLabel("Domain target").fill("localhost:4173/sandbox/website/examples/no-leak/");
	await page.getByRole("button", { name: "Run scan" }).click();

	await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/);
	await expect(page.getByRole("heading", { name: "Scan Result" })).toBeVisible();
	await expect(page.getByText("Status:")).toBeVisible();
	await expect(page.getByText("No findings")).toBeVisible();
});

test("scan form submits and renders redacted finding", async ({ page }) => {
	await page.goto("/");

	await page.getByLabel("Domain target").fill("localhost:4173/sandbox/website/examples/pem-key/");
	await page.getByRole("button", { name: "Run scan" }).click();

	await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/);
	await expect(page.getByRole("heading", { name: "Scan Result" })).toBeVisible();
	await expect(page.getByText("File:")).toBeVisible();
	await expect(page.getByText("Snippet:")).toBeVisible();
	await expect(page.getByText("[REDACTED]")).toBeVisible();
});
