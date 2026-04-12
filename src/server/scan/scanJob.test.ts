import { describe, expect, it } from "vitest";
import { scanQueueJobDataSchema, createScanResultSchema } from "./scanJob.js";

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
