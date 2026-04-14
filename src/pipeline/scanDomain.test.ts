import { z } from "zod";
import { serve } from "@hono/node-server";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../server/routes/index.js";
import type { ScanCheck } from "./checks.js";
import { builtinChecks } from "./checks.js";
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

describe("scanDomain demo website", () => {
	let server: TestServer; // eslint-disable-line custom/no-mutable-variables

	beforeAll(async () => {
		server = serve({ fetch: app.fetch, port: TEST_PORT });
		await waitForServer(2_000);
	});

	afterAll(async () => {
		await closeServer(server);
	});

	it("detects at least one finding for every builtin check on the demo website", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/demo` });

		expect(result.status).toBe("success");
		expect(result.findings.length).toBeGreaterThanOrEqual(builtinChecks.length);
		expect(result.subdomainAssetCoverage).toEqual([]);

		for (const check of builtinChecks) {
			expect(countFindingsForCheck({ checks: result.checks, checkId: check.id })).toBeGreaterThan(0);
		}

		const localStorageJwtCheck = result.checks.find(
			(check) => check.id === "localstorage-jwt"
		);
		expect(localStorageJwtCheck).toBeDefined();
		expect(localStorageJwtCheck!.findings.length).toBeGreaterThan(0);
		expect(
			localStorageJwtCheck!.findings.some((finding) =>
				finding.snippet.includes("localStorage.setItem(Jo.token")
			)
		).toBe(true);
		expect(
			localStorageJwtCheck!.findings.some((finding) =>
				finding.snippet.includes("selectedOrganisationId")
			)
		).toBe(false);

		const bundleFinding = result.findings.find((finding) => finding.file.includes("/sandbox/demo/assets/main.js"));
		expect(bundleFinding).toBeDefined();
		expect(bundleFinding!.snippet).toContain("[REDACTED]");
		expect(bundleFinding!.fingerprint).toMatch(/^[a-f0-9]{64}$/);

		const sourceMapFinding = result.findings.find((finding) => finding.checkId === "public-source-map");
		expect(sourceMapFinding).toBeDefined();
		expect(sourceMapFinding!.file).toContain("/sandbox/demo/assets/main.js.map");
		expect(sourceMapFinding!.snippet).toContain("Public source map exposed");
	});

	it("returns failed for invalid target", async () => {
		const result = await scanDomain({ domain: "https://localhost:3310/sandbox/demo" });

		expect(result.status).toBe("failed");
		expect(result.findings).toHaveLength(0);
		expect(result.subdomainAssetCoverage).toEqual([]);
	});

	it("skips discovery for localhost and returns empty discovery fields", async () => {
		const result = await scanDomain({ domain: `localhost:${TEST_PORT}/sandbox/demo` });

		expect(result.status).toBe("success");
		expect(result.discoveredSubdomains).toEqual([]);
		expect(result.discoveryStats.fromLinks).toBe(0);
		expect(result.discoveryStats.fromSitemap).toBe(0);
		expect(result.discoveryStats.totalConsidered).toBe(0);
		expect(result.discoveryStats.totalAccepted).toBe(0);
		expect(result.discoveryStats.truncated).toBe(false);
		expect(result.subdomainAssetCoverage).toEqual([]);
	});

	it("returns empty discovery fields on failure", async () => {
		const result = await scanDomain({ domain: "https://localhost:3310/sandbox/demo" });

		expect(result.status).toBe("failed");
		expect(result.discoveredSubdomains).toEqual([]);
		expect(result.discoveryStats.fromLinks).toBe(0);
		expect(result.discoveryStats.fromSitemap).toBe(0);
		expect(result.discoveryStats.totalConsidered).toBe(0);
		expect(result.discoveryStats.totalAccepted).toBe(0);
		expect(result.discoveryStats.truncated).toBe(false);
		expect(result.subdomainAssetCoverage).toEqual([]);
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

		const result = runChecks("https://example.com/", [], checks, [], true);

		expect(result).toHaveLength(2);
		expect(result[0]?.id).toBe("throwing-check");
		expect(result[0]?.findings).toHaveLength(0);
		expect(result[1]?.id).toBe("safe-check");
		expect(result[1]?.findings).toHaveLength(1);
	});
});
