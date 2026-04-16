import { expect, test } from "./fixtures/authed";

test.describe("Settings", () => {
	test("GET /settings returns settings page with user email when authenticated", async ({
		request,
		authHeaders,
		authSession
	}) => {
		const response = await request.get("/settings", { headers: authHeaders });

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("Settings");
		expect(html).toContain(authSession.email);
		expect(html).toContain("Sign out");
		expect(html).toContain("href=\"/domains\"");
	});

	test("GET /settings returns 401 when not authenticated", async ({ request }) => {
		const response = await request.get("/settings", { maxRedirects: 0 });
		expect(response.status()).toBe(401);
	});

	test("sign out button submits to /auth/logout and redirects to /", async ({
		request,
		authHeaders
	}) => {
		const response = await request.post("/auth/logout", {
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			},
			maxRedirects: 0
		});

		expect(response.status()).toBe(302);
		expect(response.headers()["location"]).toBe("/");

		const setCookie = response.headers()["set-cookie"];
		expect(setCookie).toContain("session_id=;");
		expect(setCookie).toContain("Max-Age=0");
	});

	test("session is invalidated after sign out", async ({
		request,
		authHeaders
	}) => {
		await request.post("/auth/logout", {
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			},
			maxRedirects: 0
		});

		const settingsResponse = await request.get("/settings", {
			headers: authHeaders
		});
		expect(settingsResponse.status()).toBe(401);
	});

	test("full sign out flow via browser", async ({ authedPage, authSession }) => {
		await authedPage.goto("/settings");

		await expect(authedPage.locator("h1")).toContainText("Settings");
		await expect(authedPage.locator("text=Email").locator("..")).toContainText(authSession.email);
		await expect(authedPage.getByRole("link", { name: "Go to domains" })).toBeVisible();

		await authedPage.locator('form[action="/auth/logout"] button[type="submit"]').click();
		await authedPage.waitForURL("/");

		await expect(authedPage.locator("header")).toContainText("Sign in");

		const protectedResponse = await authedPage.request.get("/settings");
		expect(protectedResponse.status()).toBe(401);
	});
});
