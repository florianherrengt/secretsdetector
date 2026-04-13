import { describe, expect, it } from "vitest";
import { buildScanChecksView } from "./index.js";
import { scanResultPagePropsSchema } from "../../../views/pages/scanResult.js";

describe("buildScanChecksView", () => {
	it("includes unknown checks so findings are not hidden", () => {
		const checks = buildScanChecksView([
			{
				id: "2d16858e-a13d-41eb-bb02-89f06c6575bc",
				scanId: "53a4ed31-f9f8-4ddb-9f56-a171092d6ea2",
				checkId: "legacy-check",
				type: "secret",
				file: "https://example.com/main.js",
				snippet: "token=[REDACTED]",
				fingerprint: "abc123",
				createdAt: new Date("2026-01-01T00:00:00.000Z")
			}
		]);

		const legacy = checks.find((check) => check.checkId === "legacy-check");

		expect(legacy).toBeDefined();
		expect(legacy?.status).toBe("fail");
		expect(legacy?.findings).toHaveLength(1);
		expect(legacy?.checkName).toContain("Unknown check");
	});
});

describe("scanResultPagePropsSchema with discovery data", () => {
	const baseProps = {
		scanId: "53a4ed31-f9f8-4ddb-9f56-a171092d6ea2",
		targetUrl: "example.com",
		topNavMode: "app" as const,
		status: "success" as const,
		startedAtIso: "2026-01-01T00:00:00.000Z",
		finishedAtIso: "2026-01-01T00:00:05.000Z",
		durationMs: 5000,
		checks: [],
		discoveredSubdomains: ["a.example.com", "b.example.com"],
		subdomainAssetCoverage: [
			{ subdomain: "a.example.com", scannedAssetPaths: ["assets/main.js"] },
			{ subdomain: "b.example.com", scannedAssetPaths: ["assets/vendor.js"] }
		],
		discoveryStats: {
			fromLinks: 2,
			fromSitemap: 1,
			totalConsidered: 5,
			totalAccepted: 2,
			truncated: false
		}
	};

	it("accepts props with populated discoveredSubdomains", () => {
		const result = scanResultPagePropsSchema.safeParse(baseProps);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.discoveredSubdomains).toEqual(["a.example.com", "b.example.com"]);
			expect(result.data.subdomainAssetCoverage[0]?.scannedAssetPaths).toEqual(["assets/main.js"]);
			expect(result.data.discoveryStats.fromLinks).toBe(2);
			expect(result.data.discoveryStats.fromSitemap).toBe(1);
		}
	});

	it("accepts props with empty discoveredSubdomains", () => {
		const props = {
			...baseProps,
			discoveredSubdomains: [],
			subdomainAssetCoverage: [],
			discoveryStats: {
				fromLinks: 0,
				fromSitemap: 0,
				totalConsidered: 0,
				totalAccepted: 0,
				truncated: false
			}
		};
		const result = scanResultPagePropsSchema.safeParse(props);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.discoveredSubdomains).toEqual([]);
			expect(result.data.subdomainAssetCoverage).toEqual([]);
		}
	});

	it("accepts props with truncated discovery stats", () => {
		const props = {
			...baseProps,
			discoveredSubdomains: Array.from({ length: 20 }, (_, i) => `sub${i}.example.com`),
			subdomainAssetCoverage: Array.from({ length: 20 }, (_, i) => ({
				subdomain: `sub${i}.example.com`,
				scannedAssetPaths: ["assets/main.js"]
			})),
			discoveryStats: {
				fromLinks: 25,
				fromSitemap: 0,
				totalConsidered: 25,
				totalAccepted: 20,
				truncated: true
			}
		};
		const result = scanResultPagePropsSchema.safeParse(props);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.discoveryStats.truncated).toBe(true);
			expect(result.data.discoveredSubdomains).toHaveLength(20);
		}
	});
});
