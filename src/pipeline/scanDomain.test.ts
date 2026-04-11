import { z } from "zod";
import { serve } from "@hono/node-server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../server/routes/index.js";
import type { ScanCheck } from "./checks.js";
import { runChecks, scanDomain } from "./scanDomain.js";

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

const countFindingsForCheck = z
	.function()
	.args(
		z.object({
			checks: z.array(
				z.object({
					id: z.string(),
					findings: z.array(z.object({ file: z.string(), snippet: z.string() }))
				})
			),
			checkId: z.string().min(1)
		})
	)
	.returns(z.number().int().nonnegative())
	.implement(({ checks, checkId }) => {
		const matchedCheck = checks.find((check) => check.id === checkId);

		if (!matchedCheck) {
			return 0;
		}

		return matchedCheck.findings.length;
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
		expect(countFindingsForCheck({ checks: result.checks, checkId: "pem-key" })).toBe(1);
		expect(countFindingsForCheck({ checks: result.checks, checkId: "jwt-token" })).toBe(0);
		expect(countFindingsForCheck({ checks: result.checks, checkId: "credential-url" })).toBe(0);
		expect(countFindingsForCheck({ checks: result.checks, checkId: "generic-secret" })).toBe(0);
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
		expect(result.checks.every((check) => check.findings.length === 0)).toBe(true);
	});

	it("returns findings from multiple checks independently", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/website/examples/multiple/` });

		expect(result.status).toBe("success");
		expect(result.findings.length).toBeGreaterThanOrEqual(1);
		expect(result.findings.some((finding) => finding.file.includes("/sandbox/website/examples/multiple/assets/"))).toBe(true);
		expect(result.checks.some((check) => check.findings.length > 0)).toBe(true);
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

	it("continues running other checks if one check throws", () => {
		const checks: ScanCheck[] = [
			{
				id: "throwing-check",
				name: "Throwing Check",
				description: "Always throws",
				run: z
					.function()
					.args(z.object({ domain: z.string().url(), scripts: z.array(z.object({ file: z.string().url(), content: z.string() })) }))
					.returns(z.object({ findings: z.array(z.any()) }))
					.implement(() => {
						throw new Error("boom");
					}) as unknown as ScanCheck["run"]
			},
			{
				id: "safe-check",
				name: "Safe Check",
				description: "Returns one finding",
				run: z
					.function()
					.args(z.object({ domain: z.string().url(), scripts: z.array(z.object({ file: z.string().url(), content: z.string() })) }))
					.returns(
						z.object({
							findings: z.array(
								z.object({
									type: z.literal("secret"),
									file: z.string().url(),
									snippet: z.string(),
									fingerprint: z.string()
								})
							)
						})
					)
					.implement(() => {
						return {
							findings: [
								{
									type: "secret",
									file: "https://example.com/app.js",
									snippet: "token=[REDACTED]",
									fingerprint: "abc123"
								}
							]
						};
					}) as unknown as ScanCheck["run"]
			}
		];

		const result = runChecks("https://example.com/", [], checks);

		expect(result).toHaveLength(2);
		expect(result[0]?.id).toBe("throwing-check");
		expect(result[0]?.findings).toHaveLength(0);
		expect(result[1]?.id).toBe("safe-check");
		expect(result[1]?.findings).toHaveLength(1);
	});

});
