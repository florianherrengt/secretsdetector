import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const scanStatusEnum = pgEnum("scan_status", [
	"pending",
	"success",
	"failed"
]);

export const findingTypeEnum = pgEnum("finding_type", ["secret"]);

export const domains = pgTable("domains", {
	id: uuid("id").primaryKey(),
	hostname: text("hostname").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const scans = pgTable("scans", {
	id: uuid("id").primaryKey(),
	domainId: uuid("domain_id")
		.notNull()
		// eslint-disable-next-line custom/no-raw-functions
		.references(() => domains.id),
	status: scanStatusEnum("status").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" })
});

export const findings = pgTable("findings", {
	id: uuid("id").primaryKey(),
	scanId: uuid("scan_id")
		.notNull()
		// eslint-disable-next-line custom/no-raw-functions
		.references(() => scans.id),
	type: findingTypeEnum("type").notNull(),
	file: text("file").notNull(),
	snippet: text("snippet").notNull(),
	fingerprint: text("fingerprint").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const mockEmails = pgTable("mock_emails", {
	id: uuid("id").primaryKey(),
	to: text("to").notNull(),
	subject: text("subject").notNull(),
	html: text("html").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const users = pgTable("users", {
	id: uuid("id").primaryKey(),
	email: text("email").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const loginTokens = pgTable("login_tokens", {
	id: uuid("id").primaryKey(),
	email: text("email").notNull(),
	tokenHash: text("token_hash").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
	usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const userDomains = pgTable("user_domains", {
	id: uuid("id").primaryKey().defaultRandom(),
	domain: text("domain").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});

export const sessions = pgTable("sessions", {
	id: uuid("id").primaryKey(),
	userId: uuid("user_id")
		.notNull()
		// eslint-disable-next-line custom/no-raw-functions
		.references(() => users.id),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull()
});
