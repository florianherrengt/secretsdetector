import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../scan/scanJob.js", () => ({
	createScanForDomainId: vi.fn(),
	scanQueueJobDataSchema: z.object({ domainId: z.string().uuid() })
}));

vi.mock("../db/client.js", () => ({
	db: {
		select: vi.fn()
	}
}));

import { createScanForDomainId } from "../scan/scanJob.js";
import { dispatchScans } from "./dispatchScans.js";
import { db } from "../db/client.js";

const defaultMocks = z
	.function()
	.args()
	.returns(z.void())
	.implement(() => {
		vi.mocked(createScanForDomainId).mockResolvedValue({ scanId: "10000000-0000-4000-8000-000000000001" });
	});

describe("dispatchScans", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		defaultMocks();
	});

	it("calls createScanForDomainId zero times when there are no domains", async () => {
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue([])
			})
		});

		await dispatchScans();

		expect(createScanForDomainId).not.toHaveBeenCalled();
	});

	it("calls createScanForDomainId exactly once per domain", async () => {
		const domainIds = [
			{ id: "00000000-0000-4000-8000-aaaaaaaaaaaa" },
			{ id: "00000000-0000-4000-8000-bbbbbbbbbbbb" },
			{ id: "00000000-0000-4000-8000-cccccccccccc" }
		];
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(domainIds)
			})
		});

		await dispatchScans();

		expect(createScanForDomainId).toHaveBeenCalledTimes(3);
		expect(createScanForDomainId).toHaveBeenCalledWith("00000000-0000-4000-8000-aaaaaaaaaaaa");
		expect(createScanForDomainId).toHaveBeenCalledWith("00000000-0000-4000-8000-bbbbbbbbbbbb");
		expect(createScanForDomainId).toHaveBeenCalledWith("00000000-0000-4000-8000-cccccccccccc");
	});

	it("continues dispatching remaining domains when one fails", async () => {
		const domainIds = [
			{ id: "00000000-0000-4000-8000-aaaaaaaaaaaa" },
			{ id: "00000000-0000-4000-8000-bbbbbbbbbbbb" }
		];
		(db.select as ReturnType<typeof vi.fn>).mockReturnValue({
			from: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(domainIds)
			})
		});
		vi.mocked(createScanForDomainId)
			.mockRejectedValueOnce(new Error("DB error"))
			.mockResolvedValueOnce({ scanId: "10000000-0000-4000-8000-000000000001" });

		await dispatchScans();

		expect(createScanForDomainId).toHaveBeenCalledTimes(2);
	});
});
