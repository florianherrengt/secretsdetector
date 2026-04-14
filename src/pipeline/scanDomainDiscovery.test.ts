import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDnsLookup = vi.fn();

vi.mock("node:dns/promises", () => ({
	get lookup() {
		return mockDnsLookup;
	}
}));

import { scanDomain } from "./scanDomain.js";

const makeResponse = (url: string, status: number, body: string, contentType: string): Response => {
	const headers = new Headers({ "content-type": contentType });
	return {
		ok: status >= 200 && status < 300,
		status,
		url,
		headers,
		body: undefined,
		text: async () => body
	} as unknown as Response;
};

describe("scanDomain discovery contract", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns hostname-only discoveredSubdomains with deterministic sorted order and stats", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url === "https://example.com/path") {
				return makeResponse(
					url,
					200,
					`<html><body>
						<a href="https://z.example.com/a">Z</a>
						<a href="https://a.example.com/a">A</a>
						<a href="https://m.example.com/a">M</a>
						<script src="/main.js"></script>
					</body></html>`,
					"text/html"
				);
			}

			if (url === "https://example.com/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com/path" });

		expect(result.status).toBe("success");
		expect(result.discoveredSubdomains).toEqual([
			"a.example.com",
			"m.example.com",
			"z.example.com"
		]);
		for (const host of result.discoveredSubdomains) {
			expect(host).not.toContain("://");
			expect(host).not.toContain("/");
		}
		expect(result.discoveryStats.fromLinks).toBe(3);
		expect(result.discoveryStats.fromSitemap).toBe(0);
		expect(result.discoveryStats.totalAccepted).toBe(3);
		expect(result.discoveryStats.totalConsidered).toBe(4);
		expect(result.discoveryStats.truncated).toBe(false);
		expect(result.subdomainAssetCoverage).toEqual([
			{ subdomain: "a.example.com", scannedAssetPaths: [] },
			{ subdomain: "m.example.com", scannedAssetPaths: [] },
			{ subdomain: "z.example.com", scannedAssetPaths: [] }
		]);
	});

	it("truncates discoveredSubdomains deterministically at cap", async () => {
		const anchors = Array.from({ length: 25 }, (_, index) => {
			const id = String(index).padStart(2, "0");
			return `<a href="https://sub${id}.example.com/page">sub${id}</a>`;
		}).join("");

		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url === "https://example.com/") {
				return makeResponse(
					url,
					200,
					`<html><body>${anchors}<script src="/main.js"></script></body></html>`,
					"text/html"
				);
			}
			if (url === "https://example.com/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}
			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		expect(result.discoveredSubdomains).toHaveLength(20);
		expect(result.discoveredSubdomains[0]).toBe("sub00.example.com");
		expect(result.discoveredSubdomains[19]).toBe("sub19.example.com");
		expect(result.discoveryStats.truncated).toBe(true);
		expect(result.subdomainAssetCoverage).toHaveLength(20);
	});

	it("rejects main-page redirects that leave the base host", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url === "https://example.com/") {
				return makeResponse(
					"https://evil.example.net/",
					200,
					"<html><body><script src='/main.js'></script></body></html>",
					"text/html"
				);
			}
			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("failed");
		expect(result.discoveredSubdomains).toEqual([]);
		expect(result.discoveryStats.totalAccepted).toBe(0);
		expect(result.subdomainAssetCoverage).toEqual([]);
	});

	it("accepts main-page redirects to subdomains of the base host", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url === "https://example.com/") {
				return makeResponse(
					"https://www.example.com/",
					200,
					`<html><body>
						<a href="https://app.example.com/login">App</a>
						<script src="https://www.example.com/main.js"></script>
					</body></html>`,
					"text/html"
				);
			}

			if (url === "https://www.example.com/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		expect(result.discoveredSubdomains).toContain("app.example.com");
		expect(result.subdomainAssetCoverage).toEqual([
			{ subdomain: "app.example.com", scannedAssetPaths: [] },
			{ subdomain: "www.example.com", scannedAssetPaths: ["main.js"] }
		]);
	});

	it("rejects main-page redirects that drop an explicitly requested path", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url === "https://example.com/predictions/") {
				return makeResponse(
					"https://example.com/",
					200,
					"<html><body><script src='/main.js'></script></body></html>",
					"text/html"
				);
			}
			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com/predictions/" });

		expect(result.status).toBe("failed");
		expect(result.discoveredSubdomains).toEqual([]);
		expect(result.subdomainAssetCoverage).toEqual([]);
	});

	it("resolves scripts against the final redirected homepage URL", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url === "https://example.com/predictions/") {
				return makeResponse(
					"https://example.com/predictions/latest/",
					200,
					"<html><body><script src='assets/main.js'></script></body></html>",
					"text/html"
				);
			}

			if (url === "https://example.com/predictions/latest/assets/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com/predictions/" });

		expect(result.status).toBe("success");
		expect(mockFetch).toHaveBeenCalledWith(
			"https://example.com/predictions/latest/assets/main.js",
			expect.any(Object)
		);
		expect(mockFetch).not.toHaveBeenCalledWith(
			"https://example.com/predictions/assets/main.js",
			expect.any(Object)
		);
	});

	it("checks sitemap.xml inside an explicitly requested path first", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url === "https://example.com/predictions/") {
				return makeResponse(
					url,
					200,
					"<html><body><script src='/predictions/main.js'></script></body></html>",
					"text/html"
				);
			}

			if (url === "https://example.com/predictions/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			if (url === "https://example.com/predictions/sitemap.xml") {
				return makeResponse(url, 200, "<urlset></urlset>", "application/xml");
			}

			if (url === "https://example.com/sitemap.xml") {
				return makeResponse(url, 404, "", "text/plain");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com/predictions/" });

		expect(result.status).toBe("success");
		const missingSitemapCheck = result.checks.find((check) => check.id === "missing-sitemap");
		expect(missingSitemapCheck).toBeDefined();
		expect(missingSitemapCheck?.findings).toHaveLength(0);
		expect(mockFetch).toHaveBeenCalledWith(
			"https://example.com/predictions/sitemap.xml",
			expect.any(Object)
		);
	});

	it("reports missing sitemap against the requested path", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url === "https://example.com/predictions/") {
				return makeResponse(
					url,
					200,
					"<html><body><script src='/predictions/main.js'></script></body></html>",
					"text/html"
				);
			}

			if (url === "https://example.com/predictions/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			if (url === "https://example.com/predictions/sitemap.xml") {
				return makeResponse(url, 404, "", "text/plain");
			}

			if (url === "https://example.com/sitemap.xml") {
				return makeResponse(url, 404, "", "text/plain");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com/predictions/" });

		expect(result.status).toBe("success");
		const missingSitemapFinding = result.findings.find((finding) => finding.checkId === "missing-sitemap");
		expect(missingSitemapFinding).toBeDefined();
		expect(missingSitemapFinding?.file).toBe("https://example.com/predictions/sitemap.xml");
	});

	it("returns success when homepage fetch succeeds but has no script tags", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url === "https://example.com/") {
				return makeResponse(url, 200, "<html><body><h1>No Scripts</h1></body></html>", "text/html");
			}
			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.checkId).toBe("missing-sitemap");
		expect(result.discoveryStats.truncated).toBe(false);
		expect(result.subdomainAssetCoverage).toEqual([]);
	});

	it("returns success when homepage fetch succeeds with non-html content", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url === "https://example.com/") {
				return makeResponse(url, 200, "plain body", "text/plain");
			}
			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		expect(result.findings).toHaveLength(1);
		expect(result.findings[0]?.checkId).toBe("missing-sitemap");
		expect(result.discoveryStats.truncated).toBe(false);
		expect(result.subdomainAssetCoverage).toEqual([]);
	});

	it("rejects discovered target redirects that leave the selected host", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url === "https://example.com/") {
				return makeResponse(
					url,
					200,
					`<html><body>
						<a href="https://a.example.com/page">A</a>
						<script src="/main.js"></script>
					</body></html>`,
					"text/html"
				);
			}

			if (url === "https://example.com/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			if (url === "https://a.example.com/") {
				return makeResponse(
					"https://evil.example.net/",
					200,
					"<html><body><script src='/sub.js'></script></body></html>",
					"text/html"
				);
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		expect(result.discoveredSubdomains).toEqual(["a.example.com"]);
		expect(result.discoveryStats.fromLinks).toBe(1);
		expect(result.discoveryStats.totalAccepted).toBe(1);
		expect(result.subdomainAssetCoverage).toEqual([
			{ subdomain: "a.example.com", scannedAssetPaths: [] }
		]);
	});

	it("maps scanned scripts to matching discovered subdomain asset paths", async () => {
		const mockFetch = vi.fn(async (input: string | URL) => {
			const url = String(input);

			if (url === "https://example.com/") {
				return makeResponse(
					url,
					200,
					`<html><body><a href="https://app.example.com/">App</a><script src="/main.js"></script></body></html>`,
					"text/html"
				);
			}

			if (url === "https://example.com/main.js") {
				return makeResponse(url, 200, "console.log('ok');", "application/javascript");
			}

			if (url === "https://app.example.com/") {
				return makeResponse(
					url,
					200,
					`<html><body><script src="/assets/index-bc075382.js?v=1"></script></body></html>`,
					"text/html"
				);
			}

			if (url === "https://app.example.com/assets/index-bc075382.js?v=1") {
				return makeResponse(url, 200, "console.log('subdomain');", "application/javascript");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		expect(result.discoveredSubdomains).toEqual(["app.example.com"]);
		expect(result.subdomainAssetCoverage).toEqual([
			{ subdomain: "app.example.com", scannedAssetPaths: ["assets/index-bc075382.js"] }
		]);
	});

	it("detects localStorage token writes when only present near end of a large bundle", async () => {
		const largePrefix = "x".repeat(120_000);
		const tokenNearEnd =
			"localStorage.setItem(Jo.token,l.renewToken),localStorage.setItem(Jo.selectedOrganisationId,u)";
		const largeScript = `${largePrefix}${tokenNearEnd}`;

		const makeScriptRangeResponse = (url: string, body: string, rangeHeader: string | undefined): Response => {
			if (!rangeHeader) {
				return makeResponse(url, 200, body, "application/javascript");
			}

			if (rangeHeader.startsWith("bytes=0-")) {
				const end = Number(rangeHeader.slice("bytes=0-".length));
				const sliced = body.slice(0, end + 1);
				const headers = new Headers({
					"content-type": "application/javascript",
					"content-range": `bytes 0-${Math.max(0, sliced.length - 1)}/${body.length}`
				});
				return {
					ok: true,
					status: 206,
					url,
					headers,
					body: undefined,
					text: async () => sliced
				} as unknown as Response;
			}

			if (rangeHeader.startsWith("bytes=-")) {
				const requestedLength = Number(rangeHeader.slice("bytes=-".length));
				const start = Math.max(0, body.length - requestedLength);
				const sliced = body.slice(start);
				const headers = new Headers({
					"content-type": "application/javascript",
					"content-range": `bytes ${start}-${Math.max(start, body.length - 1)}/${body.length}`
				});
				return {
					ok: true,
					status: 206,
					url,
					headers,
					body: undefined,
					text: async () => sliced
				} as unknown as Response;
			}

			return makeResponse(url, 416, "", "text/plain");
		};

		const mockFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
			const url = String(input);

			if (url === "https://example.com/") {
				return makeResponse(
					url,
					200,
					`<html><body><script src="/main.js"></script></body></html>`,
					"text/html"
				);
			}

			if (url === "https://example.com/main.js") {
				const rangeHeader =
					typeof init?.headers === "object" && init.headers !== null && "Range" in init.headers
						? (init.headers as Record<string, string>).Range
						: undefined;

				return makeScriptRangeResponse(url, largeScript, rangeHeader);
			}

			if (url === "https://example.com/sitemap.xml") {
				return makeResponse(url, 404, "", "text/plain");
			}

			return makeResponse(url, 404, "", "text/plain");
		});

		vi.stubGlobal("fetch", mockFetch);

		const result = await scanDomain({ domain: "example.com" });

		expect(result.status).toBe("success");
		const localStorageJwtCheck = result.checks.find((check) => check.id === "localstorage-jwt");
		expect(localStorageJwtCheck).toBeDefined();
		expect(localStorageJwtCheck!.findings.length).toBeGreaterThan(0);
	});
});
