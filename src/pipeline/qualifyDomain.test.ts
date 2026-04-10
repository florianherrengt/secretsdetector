import { z } from "zod";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { qualifyDomain } from "./qualifyDomain.js";

const TEST_PORT = 3311;
type TestServer = ReturnType<typeof serve>;

const waitForServer = z
	.function()
	.args(z.number().int().positive())
	.returns(z.promise(z.void()))
	.implement(async (timeoutMs) => {
		const startedAt = Date.now();

		while (true) {
			let isHealthy = false;

			try {
				const response = await fetch(`http://localhost:${TEST_PORT}/healthz`);

				if (response.ok) {
					isHealthy = true;
				}
			} catch {
				isHealthy = false;
			}

			if (isHealthy) {
				return;
			}

			if (Date.now() - startedAt > timeoutMs) {
				throw new Error("Local test server did not start in time");
			}

			await new Promise((resolve) => {
				setTimeout(resolve, 10);
			});
		}
	});

const closeServer = z
	.function()
	.args(z.custom<TestServer>())
	.returns(z.promise(z.void()))
	.implement(async (server) => {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});
		});
	});

const testApp = new Hono();

testApp.get("/healthz", (c) => {
	return c.text("ok");
});

testApp.get("/scenarios/pem-key", (c) => {
	return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Valid app fixture</title>
  <script src="/assets/main.js"></script>
</head>
<body>
  <main>
    <h1>Fixture</h1>
    <p>This is a valid app-like page used for qualification tests.</p>
  </main>
</body>
</html>`);
});

testApp.get("/scenarios/no-script", (c) => {
	return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>No script fixture</title>
</head>
<body>
  <p>This page intentionally has no script tags.</p>
</body>
</html>`);
});

testApp.get("/scenarios/parking", (c) => {
	return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Parking fixture</title>
  <script src="/assets/main.js"></script>
</head>
<body>
  <p>This domain is for sale. Buy this domain today.</p>
</body>
</html>`);
});

testApp.get("/scenarios/tiny", (c) => {
	return c.html("<script src='/x.js'></script>");
});

describe("qualifyDomain", () => {
	let server: TestServer;

	beforeAll(async () => {
		server = serve({ fetch: testApp.fetch, port: TEST_PORT });
		await waitForServer(2_000);
	});

	afterAll(async () => {
		await closeServer(server);
	});

	it("returns true for valid app-like homepage", async () => {
		const result = await qualifyDomain({ domain: `localhost:${TEST_PORT}/scenarios/pem-key` });

		expect(result.isQualified).toBe(true);
		expect(result.reasons).toContain("Qualified: HTML contains scripts and passes all checks");
	});

	it("returns false when no script tag is present", async () => {
		const result = await qualifyDomain({ domain: `localhost:${TEST_PORT}/scenarios/no-script` });

		expect(result.isQualified).toBe(false);
		expect(result.reasons).toContain("Failed: no <script> tag found");
	});

	it("returns false for parking page markers", async () => {
		const result = await qualifyDomain({ domain: `localhost:${TEST_PORT}/scenarios/parking` });

		expect(result.isQualified).toBe(false);
		expect(result.reasons).toContain("Failed: detected parking page");
	});

	it("returns false for tiny html pages", async () => {
		const result = await qualifyDomain({ domain: `localhost:${TEST_PORT}/scenarios/tiny` });

		expect(result.isQualified).toBe(false);
		expect(result.reasons).toContain("Failed: HTML too small");
	});

	it("returns false when homepage fetch fails", async () => {
		const result = await qualifyDomain({ domain: "localhost:39999/scenarios/pem-key" });

		expect(result.isQualified).toBe(false);
		expect(result.reasons).toContain("Failed: could not fetch homepage");
	});
});
