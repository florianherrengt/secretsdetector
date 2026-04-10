import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const scanStatusEnum = pgEnum("scan_status", [
	"pending",
	"success",
	"failed"
]);

export const findingTypeEnum = pgEnum("finding_type", ["secret"]);

export const domains = pgTable("domains", {
	id: uuid("id").primaryKey(),
	hostname: text("hostname").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const scans = pgTable("scans", {
	id: uuid("id").primaryKey(),
	domainId: uuid("domain_id")
		.notNull()
		.references(() => domains.id),
	status: scanStatusEnum("status").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" })
});

export const findings = pgTable("findings", {
	id: uuid("id").primaryKey(),
	scanId: uuid("scan_id")
		.notNull()
		.references(() => scans.id),
	type: findingTypeEnum("type").notNull(),
	file: text("file").notNull(),
	snippet: text("snippet").notNull(),
	fingerprint: text("fingerprint").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});
