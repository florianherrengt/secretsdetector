import { z } from "zod";
import { asc } from "drizzle-orm";
import { createScanForDomainId } from "../scan/scanJob.js";
import { db } from "../db/client.js";
import { domains } from "../db/schema.js";

export const dispatchScans = z
	.function()
	.args()
	.returns(z.promise(z.void()))
	.implement(async () => {
		const rows = await db.select({ id: domains.id }).from(domains).orderBy(asc(domains.id));

		console.log("[scheduler] Dispatching scans", { domainCount: rows.length });

		for (const row of rows) {
			try {
				await createScanForDomainId(row.id);
			} catch (error) {
				const normalizedError = error instanceof Error ? error : new Error("Unknown dispatch error");
				console.error("[scheduler] Failed to create scan for domain", {
					domainId: row.id,
					error: normalizedError.message
				});
			}
		}
	});
