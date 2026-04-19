/* eslint-disable custom/no-mutable-variables */
import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, userDomains, users, domains, scans, findings } from "../db/schema.js";
import { buildConfirmUrl } from "./confirmQuerySchema.js";
import { clearConfirmTokens } from "../db/confirmTokenStore.js";
import {
	clearConfirmTokenRows,
	getConfirmTokenRow
} from "../db/confirmTokenTestUtils.js";

let app: Hono;
let userId = "";
let sessionId = "";
let email = "";
let authHeaders: Record<string, string>;
let otherUserId = "";
let otherSessionId = "";
let otherAuthHeaders: Record<string, string>;

beforeAll(async () => {
	process.env.ADMIN_BASIC_AUTH_USERNAME = "admin";
	process.env.ADMIN_BASIC_AUTH_PASSWORD = "changeme";
	process.env.RATE_LIMIT_DISABLED = "true";
	process.env.NODE_ENV = "test";

	({ default: app } = await import("./index.js"));
});

beforeEach(async () => {
	userId = randomUUID();
	sessionId = randomUUID();
	email = `confirm-routes-${randomUUID()}@example.com`;
	authHeaders = { Cookie: `session_id=${sessionId}` };
	otherUserId = randomUUID();
	otherSessionId = randomUUID();
	otherAuthHeaders = { Cookie: `session_id=${otherSessionId}` };

	await db.insert(users).values({
		id: userId,
		email,
		isVerified: true,
		createdAt: new Date()
	});
	await db.insert(users).values({
		id: otherUserId,
		email: `confirm-routes-${randomUUID()}@example.com`,
		isVerified: true,
		createdAt: new Date()
	});

	await db.insert(sessions).values({
		id: sessionId,
		userId,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		createdAt: new Date()
	});
	await db.insert(sessions).values({
		id: otherSessionId,
		userId: otherUserId,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		createdAt: new Date()
	});
});

afterEach(async () => {
	await clearConfirmTokens();
	await clearConfirmTokenRows();
	await db.delete(sessions).where(eq(sessions.userId, userId));
	await db.delete(sessions).where(eq(sessions.userId, otherUserId));
	await db.delete(userDomains).where(eq(userDomains.userId, userId));
	await db.delete(userDomains).where(eq(userDomains.userId, otherUserId));
	await db.delete(users).where(eq(users.id, userId));
	await db.delete(users).where(eq(users.id, otherUserId));
});

describe("confirmation routes", () => {
	it("renders the settings confirmation page for an authenticated user with a valid token", async () => {
		const confirmUrl = await buildConfirmUrl("delete_account", userId, undefined, "/settings");
		const token = new URL(confirmUrl, "http://localhost").searchParams.get("token");

		const response = await app.request(confirmUrl, {
			headers: authHeaders
		});

		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain("Delete Account");
		expect(html).toContain("This action cannot be undone");
		expect(html).toContain(`action="/settings/confirm?token=${token}"`);
		expect(html).toContain('href="/settings"');
	});

	it("consumes the settings confirmation token and deletes the authenticated account", async () => {
		const confirmUrl = await buildConfirmUrl("delete_account", userId, undefined, "/settings");
		const token = new URL(confirmUrl, "http://localhost").searchParams.get("token");

		expect(token).toBeTruthy();
		expect(await getConfirmTokenRow(token!)).not.toBeNull();

		const response = await app.request(confirmUrl, {
			method: "POST",
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/");
		expect(response.headers.get("set-cookie")).toContain("flash_message=Your%20account%20has%20been%20deleted.");

		const remainingUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		expect(remainingUsers).toHaveLength(0);
		expect(await getConfirmTokenRow(token!)).toBeNull();
	});

	it("renders the domain confirmation page for an authenticated user with a valid token", async () => {
		const domainId = randomUUID();

		await db.insert(userDomains).values({
			id: domainId,
			userId,
			domain: `domain-${domainId}.example.com`,
			createdAt: new Date()
		});

		const confirmUrl = await buildConfirmUrl("delete_domain", userId, { domainId }, "/domains");
		const token = new URL(confirmUrl, "http://localhost").searchParams.get("token");
		const response = await app.request(confirmUrl, {
			headers: authHeaders
		});

		expect(response.status).toBe(200);
		const html = await response.text();
		expect(html).toContain("Delete Domain");
		expect(html).toContain(`action="/domains/confirm?token=${token}"`);
		expect(html).toContain('href="/domains"');
	});

	it("consumes the domain confirmation token and deletes only the authenticated user's domain", async () => {
		const domainId = randomUUID();

		await db.insert(userDomains).values({
			id: domainId,
			userId,
			domain: `domain-${domainId}.example.com`,
			createdAt: new Date()
		});

		const confirmUrl = await buildConfirmUrl("delete_domain", userId, { domainId }, "/domains");
		const token = new URL(confirmUrl, "http://localhost").searchParams.get("token");

		const response = await app.request(confirmUrl, {
			method: "POST",
			headers: {
				...authHeaders,
				"content-type": "application/x-www-form-urlencoded"
			}
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("/domains");

		const remainingDomains = await db
			.select()
			.from(userDomains)
			.where(eq(userDomains.id, domainId))
			.limit(1);
		expect(remainingDomains).toHaveLength(0);
		expect(await getConfirmTokenRow(token!)).toBeNull();
	});

	it("rejects a valid token when a different authenticated user submits it", async () => {
		const confirmUrl = await buildConfirmUrl("delete_account", userId, undefined, "/settings");
		const token = new URL(confirmUrl, "http://localhost").searchParams.get("token");

		const response = await app.request(confirmUrl, {
			method: "POST",
			headers: {
				...otherAuthHeaders,
				"content-type": "application/x-www-form-urlencoded"
			}
		});

		expect(response.status).toBe(400);
		expect(await response.text()).toContain("Invalid or expired confirmation token.");
		expect(await getConfirmTokenRow(token!)).not.toBeNull();

		const ownerRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
		expect(ownerRows).toHaveLength(1);
	});

	describe("aggressive cleanup on account deletion", () => {
		it("deletes scans and findings for the user's tracked domains", async () => {
			const hostname = `cleanup-${randomUUID()}.example.com`;
			const domainId = randomUUID();
			const scanId = randomUUID();
			const findingId = randomUUID();

			await db.insert(domains).values({ id: domainId, hostname, createdAt: new Date() });
			await db.insert(userDomains).values({ id: randomUUID(), userId, domain: hostname, createdAt: new Date() });
			await db.insert(scans).values({ id: scanId, domainId, status: "success", startedAt: new Date(), finishedAt: new Date() });
			await db.insert(findings).values({ id: findingId, scanId, checkId: "pem-key", type: "secret", file: "app.js", snippet: "...", fingerprint: `fp-${randomUUID()}`, createdAt: new Date() });

			const confirmUrl = await buildConfirmUrl("delete_account", userId, undefined, "/settings");
			const response = await app.request(confirmUrl, {
				method: "POST",
				headers: { ...authHeaders, "content-type": "application/x-www-form-urlencoded" }
			});

			expect(response.status).toBe(302);

			expect(await db.select().from(findings).where(eq(findings.id, findingId))).toHaveLength(0);
			expect(await db.select().from(scans).where(eq(scans.id, scanId))).toHaveLength(0);
			expect(await db.select().from(domains).where(eq(domains.id, domainId))).toHaveLength(0);
		});

		it("preserves domain row when another user still tracks it", async () => {
			const hostname = `shared-${randomUUID()}.example.com`;
			const domainId = randomUUID();
			const scanId = randomUUID();

			await db.insert(domains).values({ id: domainId, hostname, createdAt: new Date() });
			await db.insert(userDomains).values({ id: randomUUID(), userId, domain: hostname, createdAt: new Date() });
			await db.insert(userDomains).values({ id: randomUUID(), userId: otherUserId, domain: hostname, createdAt: new Date() });
			await db.insert(scans).values({ id: scanId, domainId, status: "success", startedAt: new Date(), finishedAt: new Date() });

			const confirmUrl = await buildConfirmUrl("delete_account", userId, undefined, "/settings");
			const response = await app.request(confirmUrl, {
				method: "POST",
				headers: { ...authHeaders, "content-type": "application/x-www-form-urlencoded" }
			});

			expect(response.status).toBe(302);

			expect(await db.select().from(domains).where(eq(domains.id, domainId))).toHaveLength(1);
			expect(await db.select().from(scans).where(eq(scans.id, scanId))).toHaveLength(1);
		});

		it("deletes domain row when no other user tracks it", async () => {
			const hostname = `solo-${randomUUID()}.example.com`;
			const domainId = randomUUID();

			await db.insert(domains).values({ id: domainId, hostname, createdAt: new Date() });
			await db.insert(userDomains).values({ id: randomUUID(), userId, domain: hostname, createdAt: new Date() });

			const confirmUrl = await buildConfirmUrl("delete_account", userId, undefined, "/settings");
			const response = await app.request(confirmUrl, {
				method: "POST",
				headers: { ...authHeaders, "content-type": "application/x-www-form-urlencoded" }
			});

			expect(response.status).toBe(302);

			expect(await db.select().from(domains).where(eq(domains.id, domainId))).toHaveLength(0);
		});
	});
});
