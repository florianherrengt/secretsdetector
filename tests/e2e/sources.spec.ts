import { expect, test } from "@playwright/test";

test.describe("Domain Sourcing", () => {
	test("source page loads and lists sources", async ({ page }) => {
		await page.goto("/source");

		await expect(page).toHaveTitle("Domain Sourcing | Secret Detector");
		await expect(page.getByRole("heading", { name: "Domain Sourcing" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "crt.sh" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Product Hunt" })).toBeVisible();
	});

	test("crt.sh source form shows tld input and debug link", async ({ page }) => {
		await page.goto("/source");
		await page.getByRole("button", { name: "Select" }).first().click();

		await expect(page.getByLabel("TLD suffix (e.g. io)").first()).toBeVisible();
		await expect(page.getByRole("link", { name: /Debug crt\.sh/ })).toBeVisible();
	});

	test("product hunt source form shows max pages input and debug link", async ({ page }) => {
		await page.goto("/source");
		const productHuntCard = page.locator("article", { has: page.getByRole("heading", { name: "Product Hunt" }) });
		await productHuntCard.getByRole("button", { name: "Select" }).click();

		await expect(page.getByLabel("Max pages to fetch (1-20)").first()).toBeVisible();
		await expect(page.getByRole("link", { name: "Debug Product Hunt" })).toBeVisible();
	});

	test.skip("crt.sh debug page loads with pre-filled tld and runs debug", async ({ page }) => {
		await page.goto("/debug/sources/crtsh?tld=io");

		await expect(page.getByRole("heading", { name: "crt.sh Debug" })).toBeVisible();
		await expect(page.getByLabel("TLD suffix (e.g. io)")).toHaveValue("io");

		await page.getByRole("button", { name: "Run debug" }).click();

		const hasError = await page.getByText(/Fetch error:/).isVisible().catch(() => false);
		if (!hasError) {
			await expect(page.getByText("Metadata")).toBeVisible();
			await expect(page.getByRole("heading", { name: /^Domains \(/ })).toBeVisible();
		}
	});

	test("product hunt debug page loads with pre-filled maxPages and runs debug", async ({ page }) => {
		await page.goto("/debug/sources/producthunt?maxPages=2");

		await expect(page.getByRole("heading", { name: "Product Hunt Debug" })).toBeVisible();

		await page.getByRole("button", { name: "Run debug" }).click();

		const hasError = await page.getByText(/Fetch error:/).isVisible().catch(() => false);
		if (!hasError) {
			await expect(page.getByText("Metadata")).toBeVisible();
			await expect(page.getByRole("heading", { name: /^Domains \(/ })).toBeVisible();
		}
	});

	test("debug page has back link to source page", async ({ page }) => {
		await page.goto("/debug/sources/crtsh");
		await expect(page.getByRole("link", { name: "Back to sourcing" })).toBeVisible();
		await page.getByRole("link", { name: "Back to sourcing" }).click();
		await expect(page).toHaveURL("/source");
	});
});
