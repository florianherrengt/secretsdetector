import { describe, expect, it } from "vitest";
import { buildScanChecksView } from "./index.js";

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

		const legacy = checks.find((check) => check.id === "legacy-check");

		expect(legacy).toBeDefined();
		expect(legacy?.status).toBe("failed");
		expect(legacy?.findings).toHaveLength(1);
		expect(legacy?.name).toContain("Unknown check");
	});
});
