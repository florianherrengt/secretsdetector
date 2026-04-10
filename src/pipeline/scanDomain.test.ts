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
			const isHealthy = await fetch(`http://localhost:${TEST_PORT}/healthz`)
				.then((r) => r.ok)
				.catch(() => false);

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
	let server: TestServer; // eslint-disable-line custom/no-mutable-variables

	beforeAll(async () => {
		server = serve({ fetch: app.fetch, port: TEST_PORT });
		await waitForServer(2_000);
	});

	afterAll(async () => {
		await closeServer(server);
	});

	it("detects pem private key fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/pem-key/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/examples/pem-key/assets/main.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
		expect(result.findings[0]?.snippet).not.toContain("abc123supersecretfixturekey");
		expect(result.findings[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/);
	});

	it("detects jwt fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/jwt/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/examples/jwt/assets/main.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
	});

	it("detects credential url fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/credential-url/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/examples/credential-url/assets/main.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
	});

	it("returns no findings for clean fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/no-leak/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(0);
	});

	it("stops after first script finding in multiple fixture", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/multiple/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/examples/multiple/assets/first.js");
	});

	it("returns failed for invalid target", async () => {
		const result = await scanDomain({ domain: "https://localhost:3310/sandbox/website/examples/pem-key/" });

		expect(result.status).toBe("failed");
		expect(result.findings).toHaveLength(0);
	});

	it("detects valid generic token with strict context", async () => {
		const result = await scanDomain({
			domain: `localhost:${TEST_PORT}/sandbox/website/examples/generic-token-valid/`
		});

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.file).toContain("/sandbox/website/examples/generic-token-valid/assets/main.js");
		expect(result.findings[0]?.snippet).toContain("[REDACTED]");
	});

	it("ignores short generic token values", async () => {
		const result = await scanDomain({
			domain: `localhost:${TEST_PORT}/sandbox/website/examples/generic-token-invalid/`
		});

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(0);
	});

	it("ignores allowlisted publishable keys", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/public-key/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(0);
	});

	it("ignores analytics identifiers", async () => {
		const result = await scanDomain({
			domain: `localhost:${TEST_PORT}/sandbox/website/examples/analytics-context/`
		});

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(0);
	});

	it("ignores high entropy values without secret context", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/weak-context/` });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(0);
	});

});
