import { expect, test } from "./fixtures/authed";

test.describe("Domains", () => {
	test("GET /domains returns domain list page when authenticated", async ({
		request,
		authHeaders
	}) => {
		const response = await request.get("/domains", { headers: authHeaders });

		expect(response.status()).toBe(200);
		expect(response.headers()["content-type"]).toContain("text/html");
		const html = await response.text();
		expect(html).toContain("Saved Domains");
		expect(html).toContain("Add Domain");
	});

	test("POST /domains adds a domain and redirects", async ({ request, authHeaders }) => {
		const response = await request.post("/domains", {
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			},
			form: { domain: "example.com" },
			maxRedirects: 0
		});

		expect(response.status()).toBe(302);
		expect(response.headers()["location"]).toBe("/domains");
	});

	test("GET /domains/confirm returns 400 for invalid token when authenticated", async ({
		request,
		authHeaders
	}) => {
		const response = await request.get(
			"/domains/confirm?token=invalid-token",
			{ headers: authHeaders, maxRedirects: 0 }
		);

		expect(response.status()).toBe(400);
		const html = await response.text();
		expect(html).toContain("Invalid or expired confirmation token");
	});

	test("added domain appears in the list", async ({ request, authHeaders }) => {
		await request.post("/domains", {
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			},
			form: { domain: "test-e2e.io" }
		});

		const listResponse = await request.get("/domains", { headers: authHeaders });
		const html = await listResponse.text();
		expect(html).toContain("test-e2e.io");
	});

	test("POST /domains rejects empty domain", async ({ request, authHeaders }) => {
		const response = await request.post("/domains", {
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			},
			form: { domain: "" }
		});

		expect(response.status()).toBe(400);
	});

	test("domain list page shows scan now links", async ({
		request,
		authHeaders
	}) => {
		await request.post("/domains", {
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			},
			form: { domain: "scan-target.com" }
		});

		const listResponse = await request.get("/domains", { headers: authHeaders });
		const html = await listResponse.text();
		expect(html).toContain("scan-target.com");
		expect(html).toContain("Scan now");
		expect(html).toContain('name="domain" value="scan-target.com"');
	});

	test("returns 401 when not authenticated", async ({ request }) => {
		const response = await request.get("/domains", { maxRedirects: 0 });
		expect(response.status()).toBe(401);
	});
});
