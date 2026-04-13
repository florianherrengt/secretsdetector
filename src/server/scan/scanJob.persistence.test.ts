import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const selectLimitMock = vi.fn();
	const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
	const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
	const selectMock = vi.fn(() => ({ from: selectFromMock }));

	const updateWhereMock = vi.fn();
	const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
	const updateMock = vi.fn(() => ({ set: updateSetMock }));

	const insertValuesMock = vi.fn();
	const insertMock = vi.fn(() => ({ values: insertValuesMock }));

	return {
		selectLimitMock,
		selectWhereMock,
		selectFromMock,
		selectMock,
		updateWhereMock,
		updateSetMock,
		updateMock,
		insertValuesMock,
		insertMock
	};
});

vi.mock("../db/client.js", () => ({
	db: {
		select: mocks.selectMock,
		update: mocks.updateMock,
		insert: mocks.insertMock
	}
}));

const {
	selectLimitMock,
	updateWhereMock,
	updateSetMock,
	updateMock,
	insertValuesMock
} = mocks;

import { persistScanOutcome } from "./scanJob.js";

describe("persistScanOutcome discovery metadata persistence", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		selectLimitMock.mockResolvedValue([]);
		updateWhereMock.mockResolvedValue([]);
		insertValuesMock.mockResolvedValue([]);
	});

	it("writes discoveredSubdomains and discoveryStats to scans.discoveryMetadata", async () => {
		const scanId = "11111111-1111-4111-8111-111111111111";
		const pipelineResult = {
			status: "success" as const,
			checks: [],
			findings: [],
			discoveredSubdomains: ["a.example.com", "b.example.com"],
			subdomainAssetCoverage: [
				{ subdomain: "a.example.com", scannedAssetPaths: ["assets/a.js"] },
				{ subdomain: "b.example.com", scannedAssetPaths: ["assets/b.js"] }
			],
			discoveryStats: {
				fromLinks: 2,
				fromSitemap: 1,
				totalConsidered: 8,
				totalAccepted: 2,
				truncated: false
			}
		};

		const result = await persistScanOutcome({ scanId, pipelineResult });

		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledTimes(1);
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "success",
				discoveryMetadata: {
					discoveredSubdomains: ["a.example.com", "b.example.com"],
					stats: {
						fromLinks: 2,
						fromSitemap: 1,
						totalConsidered: 8,
						totalAccepted: 2,
						truncated: false
					},
					subdomainAssetCoverage: [
						{ subdomain: "a.example.com", scannedAssetPaths: ["assets/a.js"] },
						{ subdomain: "b.example.com", scannedAssetPaths: ["assets/b.js"] }
					]
				}
			})
		);

		expect(result.discoveredSubdomains).toEqual(["a.example.com", "b.example.com"]);
		expect(result.discoveryStats).toEqual({
			fromLinks: 2,
			fromSitemap: 1,
			totalConsidered: 8,
			totalAccepted: 2,
			truncated: false
		});
		expect(result.subdomainAssetCoverage).toEqual([
			{ subdomain: "a.example.com", scannedAssetPaths: ["assets/a.js"] },
			{ subdomain: "b.example.com", scannedAssetPaths: ["assets/b.js"] }
		]);
	});
});
