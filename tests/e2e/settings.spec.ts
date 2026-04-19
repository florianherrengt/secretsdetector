import { expect, test } from "./fixtures/authed";
import { createAuthenticatedSession } from "./support/auth";
import {
	getConfirmTokenRow,
	parseConfirmTokenRow
} from "../../src/server/db/confirmTokenTestUtils.js";

const domain = process.env.DOMAIN ?? "127.0.0.1:3000";
const baseUrl = `http://${domain}`;

interface MockEmail {
	to: string;
	subject: string;
	html: string;
	createdAt: string;
}

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

	test("GET /settings/confirm returns 400 for invalid query when authenticated", async ({
		request,
		authHeaders
	}) => {
		const response = await request.get("/settings/confirm", {
			headers: authHeaders,
			maxRedirects: 0
		});

		expect(response.status()).toBe(400);
	});

	test("GET /settings/confirm returns 400 for invalid token when authenticated", async ({
		request,
		authHeaders
	}) => {
		const response = await request.get(
			"/settings/confirm?token=invalid-token",
			{ headers: authHeaders, maxRedirects: 0 }
		);

		expect(response.status()).toBe(400);
		const html = await response.text();
		expect(html).toContain("Invalid or expired confirmation token");
	});

	test("POST /settings/confirm returns 401 when not authenticated", async ({ request }) => {
		const response = await request.post("/settings/confirm?token=sometoken", {
			headers: {
				"content-type": "application/x-www-form-urlencoded"
			},
			maxRedirects: 0
		});

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

		await expect(authedPage.locator("header")).toContainText("Get started");

		const protectedResponse = await authedPage.request.get("/settings");
		expect(protectedResponse.status()).toBe(401);
	});

	test("delete account flow", async ({ authedPage, authSession, request }) => {
		await authedPage.goto("/settings");

		await expect(authedPage.getByText("Danger Zone")).toBeVisible();
		await expect(authedPage.getByRole("link", { name: "Delete account" })).toBeVisible();

		const deleteAccountHref = await authedPage.getByRole("link", { name: "Delete account" }).getAttribute("href");
		const token = deleteAccountHref
			? new URL(deleteAccountHref, baseUrl).searchParams.get("token")
			: null;

		expect(token).toBeTruthy();

		const tokenRowBeforeConfirm = await getConfirmTokenRow(token!);
		expect(tokenRowBeforeConfirm).not.toBeNull();
		expect(parseConfirmTokenRow(tokenRowBeforeConfirm!)).toMatchObject({
			action: "delete_account",
			context: {}
		});

		await authedPage.getByRole("link", { name: "Delete account" }).click();

		await expect(authedPage.locator("h1")).toContainText("Delete Account");
		await expect(authedPage.getByText("This action cannot be undone")).toBeVisible();
		await expect(authedPage.getByRole("button", { name: "Delete Account" })).toBeVisible();
		await expect(authedPage.getByRole("link", { name: "Cancel" })).toBeVisible();

		await authedPage.getByRole("button", { name: "Delete Account" }).click();

		await authedPage.waitForURL("/");
		expect(await getConfirmTokenRow(token!)).toBeNull();

		await expect(authedPage.getByText("Your account has been deleted.")).toBeVisible();

		await expect(authedPage.locator("header")).toContainText("Get started");

		const settingsResponse = await authedPage.request.get("/settings");
		expect(settingsResponse.status()).toBe(401);

		const emailsResponse = await request.get(`${baseUrl}/debug/emails`);
		const emails = await emailsResponse.json();
		const testEmails = emails
			.filter((email: MockEmail) => email.to === authSession.email)
			.sort((a: MockEmail, b: MockEmail) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		expect(testEmails.length).toBeGreaterThan(0);
		expect(testEmails[0].subject).toBe("Account deleted");
		expect(testEmails[0].html).toContain("Your account has been deleted.");
	});

	test("cancel account deletion returns to settings", async ({ authedPage, authSession }) => {
		await authedPage.goto("/settings");

		await authedPage.getByRole("link", { name: "Delete account" }).click();
		await expect(authedPage.locator("h1")).toContainText("Delete Account");

		await authedPage.getByRole("link", { name: "Cancel" }).click();
		await authedPage.waitForURL("/settings");

		await expect(authedPage.locator("h1")).toContainText("Settings");
		await expect(authedPage.locator("text=Email").locator("..")).toContainText(authSession.email);
	});

	test("user can re-register after deletion", async ({ request }) => {
		const email = `re-reg-${Date.now()}@example.com`;

		const session = await createAuthenticatedSession(request, email);

		const settingsResponse = await request.get(`${baseUrl}/settings`, {
			headers: {
				"Cookie": session.cookieHeader
			}
		});
		const settingsHtml = await settingsResponse.text();
		const deleteAccountHref = settingsHtml.match(/href="(\/settings\/confirm\?token=[^"]+)"/)?.[1];
		expect(deleteAccountHref).toBeTruthy();

		const deleteResponse = await request.post(`${baseUrl}${deleteAccountHref}`, {
			headers: {
				"Cookie": session.cookieHeader,
				"content-type": "application/x-www-form-urlencoded"
			},
			maxRedirects: 0
		});

		expect(deleteResponse.status()).toBe(302);
		expect(deleteResponse.headers()["location"]).toBe("/");
		const setCookie = deleteResponse.headers()["set-cookie"];
		expect(setCookie).toContain("flash_message=Your%20account%20has%20been%20deleted.");
		expect(setCookie).toContain("session_id=;");

		const requestLinkResponse = await request.post(`${baseUrl}/auth/request-link`, {
			headers: { "Content-Type": "application/json" },
			data: { email }
		});
		expect(requestLinkResponse.status()).toBe(200);

		const emailsResponse = await request.get(`${baseUrl}/debug/emails`);
		const emails = await emailsResponse.json();
		const testEmails = emails
			.filter((e: MockEmail) => e.to === email)
			.sort((a: MockEmail, b: MockEmail) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		expect(testEmails.length).toBeGreaterThan(0);
		expect(testEmails[0].subject).toBe("Welcome to Secret Detector");
	});
});
