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

describe("GET /sandbox/website", () => {
	it("returns examples home page", async () => {
		const res = await app.request("/sandbox/website");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("Sandbox Website Examples");
		expect(html).toContain("Open site example");
		expect(html).toContain("Scan with tool");
	});

	it("returns example page in folder for pem-key", async () => {
		const res = await app.request("/sandbox/website/examples/pem-key/");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
		const html = await res.text();
		expect(html).toContain("PEM key in frontend bundle");
		expect(html).toContain('<script src="/sandbox/website/examples/pem-key/assets/main.js"></script>');
	});

	it("returns not found for unknown scenario", async () => {
		const res = await app.request("/sandbox/website/unknown");
		expect(res.status).toBe(404);
	});
});

describe("GET /sandbox/website/examples/:scenario/assets/:asset", () => {
	it("returns fixture javascript content", async () => {
		const res = await app.request("/sandbox/website/examples/credential-url/assets/main.js");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/javascript");
		const js = await res.text();
		expect(js).toContain("https://admin:password@internal.api.com");
	});
});
