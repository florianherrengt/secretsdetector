import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures/authed";
import { builtinChecks } from "../../src/pipeline/checks.js";

const waitForScanCompletion = async (page: Page) => {
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

const waitForScanFromHome = async (page: Page) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForURL(/\/scan(\/[0-9a-f-]{36})?$/, { timeout: 5_000 });

    if (/\/scan\/[0-9a-f-]{36}$/.test(page.url())) {
      await expect(page).toHaveTitle("Scan Result | Secret Detector");
      await waitForScanCompletion(page);
      return;
    }

    const limited = await page
      .getByRole("heading", { name: "Too Many Requests" })
      .count();

    if (limited === 0) {
      throw new Error(
        `Expected scan result redirect but stayed on ${page.url()}`,
      );
    }

    await page.waitForTimeout(2_000 * (attempt + 1));
    await page.goto("/");
  }

  throw new Error("Rate limit prevented scanning demo website");
};

test.describe("home page", () => {
  test("loads and shows scan form", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Secret Detector");
    await expect(page.getByRole("button", { name: "Scan now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  });

  test("shows Settings button when logged in", async ({ authedPage }) => {
    const page = authedPage;

    await page.goto("/");

    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("manual scan submits domain and reaches scan result", async ({
    authedPage,
  }) => {
    const page = authedPage;

    await page.goto("/");
    await page
      .getByPlaceholder("Enter any URL to scan")
      .fill("localhost:3000/sandbox/demo");
    await page.getByRole("button", { name: "Scan now" }).click();

    await waitForScanFromHome(page);
    await expect(
      page.getByText("Issue Detected", { exact: true }),
    ).toBeVisible();

    for (const check of builtinChecks) {
      await expect(page.getByText(check.name, { exact: true })).toBeVisible();
    }
  });
});
