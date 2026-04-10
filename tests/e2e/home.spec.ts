import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const domain = process.env.DOMAIN ?? "127.0.0.1:3000";
const baseUrl = `http://${domain}`;

interface MockEmail {
  to: string;
  subject: string;
  html: string;
  createdAt: string;
}

const authenticateUser = async (request: APIRequestContext) => {
  const timestamp = Date.now();
  const testEmail = `test-home-${timestamp}@example.com`;

  await request.post(`${baseUrl}/auth/request-link`, {
    headers: { "Content-Type": "application/json" },
    data: { email: testEmail }
  });

  await new Promise(resolve => setTimeout(resolve, 500));

  const emailsResponse = await request.get(`${baseUrl}/debug/emails`);
  const emails = await emailsResponse.json();
  
  const testEmails = emails.filter((email: MockEmail) => email.to === testEmail);
  const latestEmail = testEmails.sort(
    (a: MockEmail, b: MockEmail) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];

  const linkMatch = latestEmail.html.match(/href="([^"]*auth\/verify\?token=[^"]*)"/);
  const magicLink = linkMatch ? linkMatch[1] : null;

  const url = magicLink!.startsWith("http") ? magicLink! : `${baseUrl}${magicLink}`;

  const verifyResponse = await request.get(url, {
    maxRedirects: 0
  });

  const setCookieHeader = verifyResponse.headers()["set-cookie"];
  const sessionMatch = setCookieHeader?.match(/session_id=([^;]+)/);
  const sessionId = sessionMatch ? sessionMatch[1] : null;

  return sessionId;
};

const waitForScanCompletion = async (page: Page) => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const statusText = await page.locator("p", { hasText: "Status:" }).textContent();

		if (statusText?.includes("success")) {
			return;
		}

		if (statusText?.includes("failed")) {
			throw new Error("Scan entered failed state during e2e test");
		}

		await page.waitForTimeout(250);
		await page.reload();
	}

	throw new Error("Timed out waiting for scan completion");
};

test("home page loads", async ({ page }) => {
	await page.goto("/");

	await expect(page).toHaveTitle("Home | Secret Detector");
	await expect(page.getByRole("heading", { name: "Secret Detector" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Run scan" })).toBeVisible();
});

test("scan form submits and renders no-findings result", async ({ page, request }) => {
	const sessionId = await authenticateUser(request);
	
	await page.goto("/");

	await page.evaluate((id) => {
		document.cookie = `session_id=${id}; path=/`;
	}, sessionId);

	await page.getByLabel("Domain target").fill(`${domain}/sandbox/website/examples/no-leak/`);
	await page.getByRole("button", { name: "Run scan" }).click();

	await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/);
	await expect(page.getByRole("heading", { name: "Scan Result" })).toBeVisible();
	await expect(page.getByText("Status:")).toBeVisible();
	await waitForScanCompletion(page);
	await expect(page.getByText("No findings")).toBeVisible();
});

test("scan form submits and renders redacted finding", async ({ page, request }) => {
	const sessionId = await authenticateUser(request);
	
	await page.goto("/");

	await page.evaluate((id) => {
		document.cookie = `session_id=${id}; path=/`;
	}, sessionId);

	await page.getByLabel("Domain target").fill(`${domain}/sandbox/website/examples/pem-key/`);
	await page.getByRole("button", { name: "Run scan" }).click();

	await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/);
	await expect(page.getByRole("heading", { name: "Scan Result" })).toBeVisible();
	await waitForScanCompletion(page);
	await expect(page.getByText("File:")).toBeVisible();
	await expect(page.getByText("Snippet:")).toBeVisible();
	await expect(page.getByText("[REDACTED]")).toBeVisible();
});

test("repeat leak scan still shows findings", async ({ page, request }) => {
	const sessionId = await authenticateUser(request);
	const target = `${domain}/sandbox/website/examples/pem-key/`;

	await page.goto("/");

	await page.evaluate((id) => {
		document.cookie = `session_id=${id}; path=/`;
	}, sessionId);

	await page.getByLabel("Domain target").fill(target);
	await page.getByRole("button", { name: "Run scan" }).click();

	await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/);
	await waitForScanCompletion(page);
	await expect(page.getByText("File:")).toBeVisible();

	await page.goto("/");

	await page.evaluate((id) => {
		document.cookie = `session_id=${id}; path=/`;
	}, sessionId);

	await page.getByLabel("Domain target").fill(target);
	await page.getByRole("button", { name: "Run scan" }).click();

	await expect(page).toHaveURL(/\/scan\/[0-9a-f-]{36}$/);
	await waitForScanCompletion(page);
	await expect(page.getByText("File:")).toBeVisible();
	await expect(page.getByText("[REDACTED]")).toBeVisible();
});
