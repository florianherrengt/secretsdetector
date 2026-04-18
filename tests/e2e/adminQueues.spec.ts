import "dotenv/config";
import { expect, test } from "@playwright/test";

const adminUsername = process.env.ADMIN_BASIC_AUTH_USERNAME ?? "admin";
const adminPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD ?? "changeme";

const validAuth = {
	Authorization: `Basic ${Buffer.from(`${adminUsername}:${adminPassword}`).toString("base64")}`
};

const wrongAuth = {
	Authorization: `Basic ${Buffer.from(`${adminUsername}:wrong`).toString("base64")}`
};

test.describe("Admin Basic Auth", () => {
	test("GET /admin returns 401 without credentials", async ({ request }) => {
		const response = await request.get("/admin", { maxRedirects: 0 });

		expect(response.status()).toBe(401);
		expect(response.headers()["www-authenticate"]).toBe('Basic realm="Admin"');
	});

	test("GET /admin returns 401 with wrong credentials", async ({ request }) => {
		const response = await request.get("/admin", {
			headers: wrongAuth,
			maxRedirects: 0
		});

		expect(response.status()).toBe(401);
		expect(response.headers()["www-authenticate"]).toBe('Basic realm="Admin"');
	});

	test("GET /admin returns 200 with valid credentials", async ({ request }) => {
		const response = await request.get("/admin", {
			headers: validAuth,
			maxRedirects: 0
		});

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("Admin");
		expect(html).toContain("Queue Monitor");
	});

	test("GET /admin/queues returns 401 without credentials", async ({ request }) => {
		const response = await request.get("/admin/queues", { maxRedirects: 0 });

		expect(response.status()).toBe(401);
		expect(response.headers()["www-authenticate"]).toBe('Basic realm="Admin"');
	});

	test("GET /admin/queues returns 401 with wrong credentials", async ({ request }) => {
		const response = await request.get("/admin/queues", {
			headers: wrongAuth,
			maxRedirects: 0
		});

		expect(response.status()).toBe(401);
	});

	test("GET /admin/queues returns 200 with valid credentials", async ({ request }) => {
		const response = await request.get("/admin/queues", {
			headers: validAuth,
			maxRedirects: 0
		});

		expect(response.status()).toBe(200);
	});

	test("loads /admin/queues page in browser with Basic Auth", async ({ browser }) => {
		const context = await browser.newContext({
			httpCredentials: { username: adminUsername, password: adminPassword }
		});
		const page = await context.newPage();

		await page.goto("/admin/queues");
		await expect(page.getByText("Queues")).toBeVisible();

		await context.close();
	});
});
