import { describe, expect, it } from "vitest";
import { render } from "../../lib/response.js";
import {
	deriveCheckFields,
	formatDurationMs,
	ScanResultPage,
	type ScanResultPageProps,
	sortChecks
} from "./scanResult.js";

const baseProps: ScanResultPageProps = {
	scanId: "53a4ed31-f9f8-4ddb-9f56-a171092d6ea2",
	targetUrl: "example.com",
	topNavMode: "app",
	status: "success",
	startedAtIso: "2026-01-01T00:00:00.000Z",
	finishedAtIso: "2026-01-01T00:00:05.000Z",
	durationMs: 5000,
	checks: [
		{
			checkId: "pem-key",
			checkName: "PEM Key Detection",
			status: "pass",
			classification: null,
			sourceTimestamp: null,
			findings: []
		},
		{
			checkId: "jwt-token",
			checkName: "JWT Detection",
			status: "fail",
			classification: null,
			sourceTimestamp: "2026-01-01T00:00:03.000Z",
			findings: [
				{
					findingId: "finding-1",
					title: "Issue detected",
					description: null,
					severity: "high",
					filePath: "https://example.com/main.js",
					snippet: "token=[REDACTED]",
					detectedAt: "2026-01-01T00:00:03.000Z"
				}
			]
		}
	],
	discoveredSubdomains: [],
	subdomainAssetCoverage: [],
	discoveryStats: {
		fromLinks: 0,
		fromSitemap: 0,
		totalConsidered: 0,
		totalAccepted: 0,
		truncated: false
	},
	timezone: "UTC",
	locale: "en"
};

const renderPage = (overrides: Partial<ScanResultPageProps> = {}): string => {
	const props = { ...baseProps, ...overrides };
	return render(ScanResultPage, props) as string;
};

describe("ScanResultPage deterministic contracts", () => {
	it("renders page header and global status section", () => {
		const html = renderPage();

		expect(html).toContain("Scan Result");
		expect(html).toContain("Scan Status");
		expect(html).toContain("Global severity High (75)");
		expect(html).toContain("1 Issue Found");
	});

	it("renders compact summary row with clickable URL and duration", () => {
		const html = renderPage();

		expect(html).toContain("Target URL");
		expect(html).toContain("href=\"https://example.com/\"");
		expect(html).toContain("Duration");
		expect(html).toContain("5s");
	});

	it("groups findings section before passed checks section", () => {
		const html = renderPage();
		const failedIndex = html.indexOf("Findings");
		const passedIndex = html.indexOf("Passed Checks");

		expect(failedIndex).toBeGreaterThan(-1);
		expect(passedIndex).toBeGreaterThan(-1);
		expect(failedIndex).toBeLessThan(passedIndex);
	});

	it("renders findings with indexed labels and code styling", () => {
		const html = renderPage();

		expect(html).toContain("Finding #1");
		expect(html).toContain("overflow-x-auto");
	});

	it("renders rerun scan CTA", () => {
		const html = renderPage();

		expect(html).toContain("Re-run Scan");
		expect(html).toContain("action=\"/scan\"");
	});

	it("renders app nav actions in app mode", () => {
		const html = renderPage({ topNavMode: "app" });

		expect(html).toContain("href=\"/settings\"");
		expect(html).toContain("Settings");
		expect(html).not.toContain("href=\"/auth/sign-in\"");
		expect(html).not.toContain("href=\"/auth/sign-up\"");
	});

	it("renders auth nav actions in auth mode", () => {
		const html = renderPage({ topNavMode: "auth" });

		expect(html).toContain("href=\"/auth/sign-in\"");
		expect(html).toContain("Get started");
		expect(html).not.toContain("href=\"/auth/sign-up\"");
		expect(html).not.toContain("href=\"/settings\"");
	});
});

describe("ScanResultPage helper contracts", () => {
	it("formats sub-second durations as <1s", () => {
		expect(formatDurationMs(0)).toBe("<1s");
		expect(formatDurationMs(999)).toBe("<1s");
		expect(formatDurationMs(1000)).toBe("1s");
	});

	it("assigns medium severity to failed checks with missing finding severity", () => {
		const result = deriveCheckFields({
			checkId: "unknown",
			checkName: "Unknown",
			status: "fail",
			classification: null,
			sourceTimestamp: null,
			findings: []
		});

		expect(result.severityLevel).toBe("Medium");
		expect(result.severityScore).toBe(55);
		expect(result.findingsResolved).toHaveLength(1);
		expect(result.findingsResolved[0]?.title).toBe("Details unavailable");
	});

	it("assigns high severity to pem key findings without explicit severity", () => {
		const result = deriveCheckFields({
			checkId: "pem-key",
			checkName: "PEM Key Detection",
			status: "fail",
			classification: null,
			sourceTimestamp: "2026-01-01T00:00:03.000Z",
			findings: [
				{
					findingId: "finding-pem",
					title: "Issue detected",
					description: null,
					severity: null,
					filePath: "https://example.com/main.js",
					snippet: "-----BEGIN PRIVATE KEY-----",
					detectedAt: "2026-01-01T00:00:03.000Z"
				}
			]
		});

		expect(result.severityLevel).toBe("High");
		expect(result.severityScore).toBe(75);
	});

	it("sorts checks by status, severity, issue count, name, and id", () => {
		const checks = sortChecks([
			{
				checkId: "b",
				checkName: "B Check",
				status: "pass",
				classification: null,
				sourceTimestamp: null,
				findings: []
			},
			{
				checkId: "a",
				checkName: "A Check",
				status: "fail",
				classification: null,
				sourceTimestamp: null,
				findings: [
					{
						findingId: "f1",
						title: "Issue detected",
						description: null,
						severity: "critical",
						filePath: null,
						snippet: null,
						detectedAt: null
					}
				]
			}
		]);

		expect(checks[0]?.checkId).toBe("a");
		expect(checks[1]?.checkId).toBe("b");
	});
});

describe("ScanResultPage pending state", () => {
	it("renders loading state without check results when status is pending", () => {
		const html = renderPage({ status: "pending", checks: [], finishedAtIso: null, durationMs: 0 });

		expect(html).toContain("Scan in progress");
		expect(html).toContain("Loading check result");
		expect(html).not.toContain("Global severity");
		expect(html).toContain("Re-run Scan");
		expect(html).not.toContain("Duration");
	});
});

describe("ScanResultPage failed state", () => {
	it("renders error state with recovery action", () => {
		const html = renderPage({ status: "failed", checks: [], finishedAtIso: null, durationMs: 0 });

		expect(html).toContain("Scan failed before results were saved.");
		expect(html).toContain("No findings available");
		expect(html).toContain("Use Re-run Scan to retry.");
		expect(html).toContain("Re-run Scan");
	});
});

describe("ScanResultPage discovery rendering", () => {
	it("renders discovered subdomains list when present", () => {
		const html = renderPage({
			discoveredSubdomains: ["api.example.com", "cdn.example.com"],
			subdomainAssetCoverage: [
				{
					subdomain: "api.example.com",
					scannedAssetPaths: ["assets/index-bc075382.js"]
				},
				{
					subdomain: "cdn.example.com",
					scannedAssetPaths: ["assets/vendor-abc123.js", "assets/chunk-xyz987.js"]
				}
			],
			discoveryStats: {
				fromLinks: 2,
				fromSitemap: 0,
				totalConsidered: 3,
				totalAccepted: 2,
				truncated: false
			}
		});

		expect(html).toContain("Discovered Subdomains");
		expect(html).toContain("api.example.com");
		expect(html).toContain("cdn.example.com");
		expect(html).toContain("assets/index-bc075382.js");
		expect(html).toContain("assets/vendor-abc123.js");
		expect(html).toContain("2 links, 0 sitemap");
	});

	it("renders empty-state message when no subdomains discovered", () => {
		const html = renderPage({
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

		expect(html).toContain("Discovered Subdomains");
		expect(html).toContain("No subdomains discovered");
		expect(html).toContain("Use Re-run Scan after deploying pages that expose subdomain links or sitemap entries.");
	});

	it("renders truncated indicator when discovery was truncated", () => {
		const html = renderPage({
			discoveredSubdomains: ["a.example.com"],
			subdomainAssetCoverage: [
				{
					subdomain: "a.example.com",
					scannedAssetPaths: ["assets/main.js"]
				}
			],
			discoveryStats: {
				fromLinks: 5,
				fromSitemap: 3,
				totalConsidered: 25,
				totalAccepted: 20,
				truncated: true
			}
		});

		expect(html).toContain("(truncated)");
	});

	it("renders long subdomain values with break-words", () => {
		const longSub = "a".repeat(100) + ".example.com";
		const html = renderPage({
			discoveredSubdomains: [longSub],
			subdomainAssetCoverage: [
				{
					subdomain: longSub,
					scannedAssetPaths: ["assets/entry.js"]
				}
			],
			discoveryStats: {
				fromLinks: 1,
				fromSitemap: 0,
				totalConsidered: 1,
				totalAccepted: 1,
				truncated: false
			}
		});

		expect(html).toContain(longSub);
		expect(html).toContain("break-words");
	});

	it("renders per-subdomain empty asset state", () => {
		const html = renderPage({
			discoveredSubdomains: ["api.example.com"],
			subdomainAssetCoverage: [
				{
					subdomain: "api.example.com",
					scannedAssetPaths: []
				}
			],
			discoveryStats: {
				fromLinks: 1,
				fromSitemap: 0,
				totalConsidered: 1,
				totalAccepted: 1,
				truncated: false
			}
		});

		expect(html).toContain("api.example.com");
		expect(html).toContain("No assets scanned on this subdomain");
	});
});
