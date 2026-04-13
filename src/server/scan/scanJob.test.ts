import { describe, expect, it } from "vitest";
import { normalizeSubmittedDomain, dedupeFindingsWithinScan, scanPersistenceResultSchema, scanQueueJobDataSchema, createScanResultSchema } from "./scanJob.js";

const MOCK_DOMAIN_ID = "00000000-0000-4000-8000-aaaaaaaaaaaa";

describe("scanQueueJobDataSchema", () => {
	it("accepts valid domainId", () => {
		const result = scanQueueJobDataSchema.safeParse({ domainId: MOCK_DOMAIN_ID });
		expect(result.success).toBe(true);
	});

	it("rejects missing domainId", () => {
		const result = scanQueueJobDataSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it("rejects non-uuid domainId", () => {
		const result = scanQueueJobDataSchema.safeParse({ domainId: "not-a-uuid" });
		expect(result.success).toBe(false);
	});
});

describe("createScanResultSchema", () => {
	it("accepts valid result", () => {
		const result = createScanResultSchema.safeParse({ scanId: MOCK_DOMAIN_ID });
		expect(result.success).toBe(true);
	});

	it("rejects missing scanId", () => {
		const result = createScanResultSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});

describe("normalizeSubmittedDomain", () => {
	it("strips https:// prefix", () => {
		expect(normalizeSubmittedDomain("https://example.com")).toBe("example.com");
	});

	it("strips http:// prefix", () => {
		expect(normalizeSubmittedDomain("http://example.com")).toBe("example.com");
	});

	it("preserves hostname with port", () => {
		expect(normalizeSubmittedDomain("example.com:8080")).toBe("example.com:8080");
	});

	it("trims whitespace", () => {
		expect(normalizeSubmittedDomain("  example.com  ")).toBe("example.com");
	});
});

describe("dedupeFindingsWithinScan", () => {
	it("deduplicates findings with same checkId and fingerprint", () => {
		const findings = [
			{ checkId: "check-a", type: "secret" as const, file: "a.js", snippet: "s1", fingerprint: "fp1" },
			{ checkId: "check-a", type: "secret" as const, file: "a.js", snippet: "s1", fingerprint: "fp1" },
			{ checkId: "check-b", type: "secret" as const, file: "b.js", snippet: "s2", fingerprint: "fp2" }
		];
		const result = dedupeFindingsWithinScan(findings);
		expect(result).toHaveLength(2);
	});

	it("keeps findings with same fingerprint but different checkId", () => {
		const findings = [
			{ checkId: "check-a", type: "secret" as const, file: "a.js", snippet: "s1", fingerprint: "fp1" },
			{ checkId: "check-b", type: "secret" as const, file: "a.js", snippet: "s1", fingerprint: "fp1" }
		];
		const result = dedupeFindingsWithinScan(findings);
		expect(result).toHaveLength(2);
	});
});

describe("scanPersistenceResultSchema", () => {
	it("accepts result with discoveredSubdomains and discoveryStats", () => {
		const result = scanPersistenceResultSchema.safeParse({
			scanId: MOCK_DOMAIN_ID,
			status: "success",
			findingsCount: 1,
			insertedFindingsCount: 1,
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
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.discoveredSubdomains).toEqual(["a.example.com", "b.example.com"]);
			expect(result.data.subdomainAssetCoverage[0]?.scannedAssetPaths).toEqual(["assets/main.js"]);
			expect(result.data.discoveryStats.fromLinks).toBe(2);
		}
	});

	it("accepts result with empty discoveredSubdomains", () => {
		const result = scanPersistenceResultSchema.safeParse({
			scanId: MOCK_DOMAIN_ID,
			status: "failed",
			findingsCount: 0,
			insertedFindingsCount: 0,
			discoveredSubdomains: [],
			subdomainAssetCoverage: [],
			discoveryStats: {
				fromLinks: 0,
				fromSitemap: 0,
				totalConsidered: 0,
				totalAccepted: 0,
				truncated: false
			}
		});
		expect(result.success).toBe(true);
	});

	it("accepts result with truncated flag true", () => {
		const result = scanPersistenceResultSchema.safeParse({
			scanId: MOCK_DOMAIN_ID,
			status: "success",
			findingsCount: 0,
			insertedFindingsCount: 0,
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
		});
		expect(result.success).toBe(true);
		expect(result.data?.discoveryStats.truncated).toBe(true);
	});
});
