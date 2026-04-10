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
		expect(html).toContain("Server-side domain scanning and secret detection platform.");
	});
});
