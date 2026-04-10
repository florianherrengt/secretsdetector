import { describe, it, expect } from "vitest";
import app from "./index.js";

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
		expect(html).toContain("Secret Detector</h1>");
		expect(html).toContain("<form action=\"/scan\" method=\"post\"");
		expect(html).toContain("name=\"domain\"");
	});
});

describe("GET /sandbox/website/:scenario", () => {
	it("returns deterministic fixture page for pem-key", async () => {
		const res = await app.request("/sandbox/website/pem-key");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Fixture pem-key");
		expect(html).toContain('<script src="/sandbox/website/assets/pem-key.js"></script>');
	});

	it("returns not found for unknown scenario", async () => {
		const res = await app.request("/sandbox/website/unknown");
		expect(res.status).toBe(404);
	});
});

describe("GET /sandbox/website/assets/:asset", () => {
	it("returns fixture javascript content", async () => {
		const res = await app.request("/sandbox/website/assets/credential-url.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/javascript");
		const js = await res.text();
		expect(js).toContain("https://admin:password@internal.api.com");
	});
});
