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
	]
};

const renderPage = (overrides: Partial<ScanResultPageProps> = {}): string => {
	const props = { ...baseProps, ...overrides };
	return render(ScanResultPage, props) as string;
};

describe("ScanResultPage deterministic contracts", () => {
	it("renders breadcrumb and global status banner", () => {
		const html = renderPage();

		expect(html).toContain("Home");
		expect(html).toContain("Scans");
		expect(html).toContain("Result");
		expect(html).toContain("Global Severity: High (75)");
		expect(html).toContain("1 Issue Found");
	});

	it("renders compact summary row with clickable URL and duration", () => {
		const html = renderPage();

		expect(html).toContain("Target URL");
		expect(html).toContain("href=\"https://example.com/\"");
		expect(html).toContain("Duration");
		expect(html).toContain("5s");
	});

	it("groups checks with failed group first", () => {
		const html = renderPage();
		const failedIndex = html.indexOf("Issue Detected");
		const passedIndex = html.indexOf("No Issues Found");

		expect(failedIndex).toBeGreaterThan(-1);
		expect(passedIndex).toBeGreaterThan(-1);
		expect(failedIndex).toBeLessThan(passedIndex);
	});

	it("renders expandable findings with indexed labels", () => {
		const html = renderPage();

		expect(html).toContain("Finding #1");
		expect(html).toContain("font-mono");
	});

	it("renders rerun scan CTA", () => {
		const html = renderPage();

		expect(html).toContain("Re-run Scan");
		expect(html).toContain("action=\"/scan\"");
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

		expect(html).toContain("Scan In Progress");
		expect(html).toContain("Waiting for scan results\u2026");
		expect(html).not.toContain("Global Severity");
		expect(html).not.toContain("Re-run Scan");
		expect(html).not.toContain("Duration");
	});
});
