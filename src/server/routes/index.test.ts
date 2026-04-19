/* eslint-disable custom/no-mutable-variables */
import { beforeAll, describe, it, expect } from "vitest";
import type { Hono } from "hono";

let app: Hono;

beforeAll(async () => {
	process.env.ADMIN_BASIC_AUTH_USERNAME = "admin";
	process.env.ADMIN_BASIC_AUTH_PASSWORD = "changeme";
	process.env.RATE_LIMIT_DISABLED = "true";
	process.env.NODE_ENV = "test";

	({ default: app } = await import("./index.js"));
});

describe("GET /healthz", () => {
	it("returns 200 with status ok", async () => {
		const res = await app.request("/healthz");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ status: "ok" });
	});
});

describe("GET /", () => {
	it("returns the home page html", async () => {
		const res = await app.request("/");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("action=\"/scan\" method=\"post\"");
		expect(html).toContain("name=\"domain\"");
		expect(html).toContain("name=\"visitorFingerprint\"");
		expect(html).toContain("/assets/scan-fingerprint.js");
	});

	it("renders demo scan target directly in initial html", async () => {
		const res = await app.request("/");
		expect(res.status).toBe(200);
		const html = await res.text();

		expect(html).toMatch(/name="domain"[^>]*value="[^"]*\/sandbox\/demo"/);
	});
});

describe("GET /qualify", () => {
	it("returns qualification input page", async () => {
		const res = await app.request("/qualify");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Qualification Debug");
		expect(html).toContain('<form action="/qualify" method="get"');
		expect(html).toContain('name="domain"');
	});

	it("renders reasons from qualification result via query string", async () => {
		const res = await app.request("/qualify?domain=localhost%3A39999%2Fscenarios%2Fpem-key");

		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("Qualification Result");
		expect(html).toContain("not qualified");
		expect(html).toContain("Failed: could not fetch homepage");
	});
});

describe("GET /dedupe", () => {
	it("returns dedupe input page", async () => {
		const res = await app.request("/dedupe");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Deduplication Debug");
		expect(html).toContain('<form action="/dedupe" method="post"');
		expect(html).toContain('name="domain"');
	});
});

describe("Admin routes (Basic Auth)", () => {
	const validAuth = { Authorization: `Basic ${btoa("admin:changeme")}` };
	const wrongAuth = { Authorization: `Basic ${btoa("admin:wrong")}` };

	describe("GET /admin", () => {
		it("returns 401 with WWW-Authenticate when no credentials", async () => {
			const res = await app.request("/admin");
			expect(res.status).toBe(401);
			expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Admin"');
		});

		it("returns 401 with wrong credentials", async () => {
			const res = await app.request("/admin", { headers: wrongAuth });
			expect(res.status).toBe(401);
			expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Admin"');
		});

		it("returns 200 with valid credentials", async () => {
			const res = await app.request("/admin", { headers: validAuth });
			expect(res.status).toBe(200);
			const html = await res.text();
			expect(html).toContain("Admin");
		});
	});

		describe("GET /admin/queues", () => {
			it("returns 401 with WWW-Authenticate when no credentials", async () => {
				const res = await app.request("/admin/queues");
				expect(res.status).toBe(401);
				expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="Admin"');
			});

			it("returns 401 with wrong credentials", async () => {
				const res = await app.request("/admin/queues", { headers: wrongAuth });
				expect(res.status).toBe(401);
			});

			it("returns 200 with valid credentials", async () => {
				const res = await app.request("/admin/queues", { headers: validAuth });
				expect(res.status).toBe(200);
				expect(res.headers.get("content-type")).toContain("text/html");
			});
		});
	});

describe("GET /domains", () => {
	it("returns 401 when not authenticated", async () => {
		const res = await app.request("/domains");
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty("error");
	});
});

describe("POST /domains", () => {
	it("returns 401 when not authenticated", async () => {
		const res = await app.request("/domains", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: "domain=example.com"
		});
		expect(res.status).toBe(401);
	});
});

describe("GET /domains/confirm", () => {
	it("returns 401 when not authenticated", async () => {
		const res = await app.request("/domains/confirm?token=sometoken");
		expect(res.status).toBe(401);
	});
});

describe("POST /domains/confirm", () => {
	it("returns 401 when not authenticated", async () => {
		const res = await app.request("/domains/confirm?token=sometoken", {
			method: "POST"
		});
		expect(res.status).toBe(401);
	});
});

describe("GET /settings", () => {
	it("returns 401 when not authenticated", async () => {
		const res = await app.request("/settings");
		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body).toHaveProperty("error");
	});
});

describe("POST /qualify", () => {
	it("returns validation error when input is invalid", async () => {
		const res = await app.request("/qualify", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded"
			},
			body: "domain="
		});

		expect(res.status).toBe(400);
		const html = await res.text();
		expect(html).toContain("Invalid domain input.");
	});

	it("renders reasons from qualification result", async () => {
		const res = await app.request("/qualify", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded"
			},
			body: "domain=localhost%3A39999%2Fscenarios%2Fpem-key"
		});

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(
			"/qualify?domain=localhost%3A39999%2Fscenarios%2Fpem-key"
		);
	});
});

describe("POST /scan", () => {
	it("rejects public scans without a fingerprint", async () => {
		const res = await app.request("/scan", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded"
			},
			body: "domain=example.com"
		});

		expect(res.status).toBe(400);
		const html = await res.text();
		expect(html).toContain("Fingerprint Required");
	});
});

describe("GET /sandbox/demo", () => {
	it("returns demo website page", async () => {
		const res = await app.request("/sandbox/demo");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Secret Detector Demo Website");
		expect(html).toContain('<script src="/sandbox/demo/assets/main.js"></script>');
	});
});

describe("GET /sandbox/demo/large", () => {
	it("returns large bundle demo website page", async () => {
		const res = await app.request("/sandbox/demo/large");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Secret Detector Demo Website");
		expect(html).toContain('<script src="/sandbox/demo/assets/main.large.js"></script>');
	});
});

describe("GET /sandbox/demo/assets/main.js", () => {
	it("returns fixture javascript content", async () => {
		const res = await app.request("/sandbox/demo/assets/main.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/javascript");
		const js = await res.text();
		expect(js).toContain("https://admin:password@internal.api.com");
	});
});

describe("GET /sandbox/demo/assets/main.large.js", () => {
	it("returns large bundle javascript content", async () => {
		const res = await app.request("/sandbox/demo/assets/main.large.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/javascript");
		const js = await res.text();
		expect(js).toContain("localStorage.setItem(Jo.token,l.renewToken)");
		expect(js).toContain("localStorage.setItem(Jo.selectedOrganisationId,u)");
	});
});

describe("404 Not Found", () => {
	it("returns 404 for non-existent routes", async () => {
		const res = await app.request("/nonexistent-route");
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("404 Not Found");
	});

	it("returns 404 for nested non-existent routes", async () => {
		const res = await app.request("/api/v1/nonexistent");
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("404 Not Found");
	});

	it("returns 404 for random paths", async () => {
		const res = await app.request("/some/random/path/that/does/not/exist");
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("404 Not Found");
	});
});
