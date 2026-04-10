import { z } from "zod";
import { serve } from "@hono/node-server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../server/routes/index.js";
import { scanDomain } from "./scanDomain.js";

const TEST_PORT = 3310;
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

describe("scanDomain local fixtures", () => {
	let server: TestServer;

	beforeAll(async () => {
		server = serve({ fetch: app.fetch, port: TEST_PORT });
		await waitForServer(2_000);
	});

	afterAll(async () => {
		await closeServer(server);
	});

	it("detects pem private key fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/pem-key` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/assets/pem-key.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
		expect(result.findings[0]?.snippet).not.toContain("abc123supersecretfixturekey");
		expect(result.findings[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	it("detects jwt fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/jwt` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/assets/jwt.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
	});

	it("detects credential url fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/credential-url` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/assets/credential-url.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
	});

	it("returns no findings for clean fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/no-leak` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(0);
	});

	it("stops after first script finding in multiple fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/multiple` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/assets/multiple-first.js");
	});

	it("returns failed for invalid target", async () => {
		const result = await scanDomain({ domain: "https://localhost:3310/sandbox/website/pem-key" });

		expect(result.status).toBe("failed");
		expect(result.findings).toHaveLength(0);
	});

});
