import { describe, expect, it, vi } from "vitest";

const scanId = "53a4ed31-f9f8-4ddb-9f56-a171092d6ea2";
const domainId = "53a4ed31-f9f8-4ddb-9f56-a171092d6ea3";

const mocks = vi.hoisted(() => {
	const selectMock = vi.fn();
	return { selectMock };
});

const { selectMock } = mocks;

vi.mock("../../db/client.js", () => ({
	db: {
		select: mocks.selectMock
	}
}));

vi.mock("../../auth/middleware.js", () => ({
	extractSessionId: () => null
}));

vi.mock("../../auth/index.js", () => ({
	getSession: async () => null
}));

import scanRoutes from "./index.js";

describe("GET /scan/:scanId discovery metadata rendering", () => {
	it("renders discovered subdomains and discovery stats from persisted metadata", async () => {
		selectMock.mockReset();
		selectMock
			.mockImplementationOnce(() => ({
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: scanId,
								domainId,
								status: "success",
								startedAt: new Date("2026-01-01T00:00:00.000Z"),
								finishedAt: new Date("2026-01-01T00:00:05.000Z"),
							discoveryMetadata: {
								discoveredSubdomains: ["a.example.com", "b.example.com"],
								subdomainAssetCoverage: [
									{ subdomain: "a.example.com", scannedAssetPaths: ["assets/index-bc075382.js"] },
									{ subdomain: "b.example.com", scannedAssetPaths: ["assets/vendor.js"] }
								],
								stats: {
									fromLinks: 2,
										fromSitemap: 1,
										totalConsidered: 5,
										totalAccepted: 2,
										truncated: false
									}
								}
							}
						]
					})
				})
			}))
			.mockImplementationOnce(() => ({
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: domainId,
								hostname: "example.com",
								createdAt: new Date("2026-01-01T00:00:00.000Z")
							}
						]
					})
				})
			}))
			.mockImplementationOnce(() => ({
				from: () => ({
					where: async () => []
				})
			}));

		const response = await scanRoutes.request(`/${scanId}`);
		expect(response.status).toBe(200);

		const html = await response.text();
		expect(html).toContain("Discovered Subdomains");
		expect(html).toContain("a.example.com");
		expect(html).toContain("b.example.com");
		expect(html).toContain("assets/index-bc075382.js");
		expect(html).toContain("2 links, 1 sitemap");
	});

	it("renders default empty discovery values when discovery metadata is null", async () => {
		selectMock.mockReset();
		selectMock
			.mockImplementationOnce(() => ({
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: scanId,
								domainId,
								status: "success",
								startedAt: new Date("2026-01-01T00:00:00.000Z"),
								finishedAt: new Date("2026-01-01T00:00:05.000Z"),
								discoveryMetadata: null
							}
						]
					})
				})
			}))
			.mockImplementationOnce(() => ({
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: domainId,
								hostname: "example.com",
								createdAt: new Date("2026-01-01T00:00:00.000Z")
							}
						]
					})
				})
			}))
			.mockImplementationOnce(() => ({
				from: () => ({
					where: async () => []
				})
			}));

		const response = await scanRoutes.request(`/${scanId}`);
		expect(response.status).toBe(200);

		const html = await response.text();
		expect(html).toContain("Discovered Subdomains");
		expect(html).toContain("No subdomains discovered");
		expect(html).toContain("0 links, 0 sitemap");
	});

	it("renders truncated discovery indicator from persisted metadata", async () => {
		selectMock.mockReset();
		selectMock
			.mockImplementationOnce(() => ({
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: scanId,
								domainId,
								status: "success",
								startedAt: new Date("2026-01-01T00:00:00.000Z"),
								finishedAt: new Date("2026-01-01T00:00:05.000Z"),
							discoveryMetadata: {
								discoveredSubdomains: Array.from({ length: 20 }, (_, i) => `sub${i}.example.com`),
								subdomainAssetCoverage: Array.from({ length: 20 }, (_, i) => ({
									subdomain: `sub${i}.example.com`,
									scannedAssetPaths: ["assets/main.js"]
								})),
								stats: {
										fromLinks: 25,
										fromSitemap: 2,
										totalConsidered: 30,
										totalAccepted: 21,
										truncated: true
									}
								}
							}
						]
					})
				})
			}))
			.mockImplementationOnce(() => ({
				from: () => ({
					where: () => ({
						limit: async () => [
							{
								id: domainId,
								hostname: "example.com",
								createdAt: new Date("2026-01-01T00:00:00.000Z")
							}
						]
					})
				})
			}))
			.mockImplementationOnce(() => ({
				from: () => ({
					where: async () => []
				})
			}));

		const response = await scanRoutes.request(`/${scanId}`);
		expect(response.status).toBe(200);

		const html = await response.text();
		expect(html).toContain("(truncated)");
		expect(html).toContain("sub0.example.com");
	});
});
