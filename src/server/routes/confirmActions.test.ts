import { randomUUID } from "node:crypto";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { ioredisClient } from "../scan/redis.js";
import { generateConfirmToken, peekConfirmToken, consumeConfirmToken, confirmActionConfig } from "./confirmActions.js";
import { clearConfirmTokens } from "../db/confirmTokenStore.js";
import {
	clearConfirmTokenRows,
	getConfirmTokenRow,
	getConfirmTokenStorageKey,
	parseConfirmTokenRow
} from "../db/confirmTokenTestUtils.js";

describe("confirmActions", () => {
	beforeAll(async () => {
		if (ioredisClient.status !== "ready") {
			await new Promise<void>((resolve) => ioredisClient.once("ready", () => resolve()));
		}
	});
	const userId = randomUUID();
	const otherUserId = randomUUID();

	afterEach(async () => {
		await clearConfirmTokens();
		await clearConfirmTokenRows();
	});

	describe("generateConfirmToken", () => {
		it("returns a hex token for delete_account", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			expect(token).toBeTruthy();
			expect(token).toMatch(/^[0-9a-f]{64}$/);
		});

		it("returns a hex token for delete_domain", async () => {
			const token = await generateConfirmToken("delete_domain", userId, {});

			expect(token).toBeTruthy();
			expect(token).toMatch(/^[0-9a-f]{64}$/);
		});

		it("generates unique tokens on each call", async () => {
			const token1 = await generateConfirmToken("delete_account", userId, {});
			const token2 = await generateConfirmToken("delete_account", userId, {});

			expect(token1).not.toBe(token2);
		});

		it("persists the token in redis", async () => {
			const token = await generateConfirmToken("delete_domain", userId, { domainId: "abc-123" });
			const row = await getConfirmTokenRow(token);

			expect(row).not.toBeNull();
			expect(row?.key).toBe(getConfirmTokenStorageKey(token));

			const storedValue = parseConfirmTokenRow(row!);
			expect(storedValue).toEqual({
				action: "delete_domain",
				context: { domainId: "abc-123" },
				userId
			});
		});
	});

	describe("peekConfirmToken", () => {
		it("returns action and context for valid token without consuming it", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});
			const first = await peekConfirmToken(token);
			const second = await peekConfirmToken(token);

			expect(first).toEqual({ action: "delete_account", context: {}, userId });
			expect(second).toEqual({ action: "delete_account", context: {}, userId });
		});

		it("returns action and context for token with context", async () => {
			const token = await generateConfirmToken("delete_domain", userId, { domainId: "abc-123" });
			const result = await peekConfirmToken(token);

			expect(result).toEqual({
				action: "delete_domain",
				context: { domainId: "abc-123" },
				userId
			});
		});

		it("returns null for invalid token", async () => {
			const result = await peekConfirmToken("nonexistent-token");

			expect(result).toBeNull();
		});

		it("returns null for expired token", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			await clearConfirmTokens();

			const result = await peekConfirmToken(token);
			expect(result).toBeNull();
		});
	});

	describe("consumeConfirmToken", () => {
		it("returns action and context for valid token", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});
			const result = await consumeConfirmToken(token, userId);

			expect(result).toEqual({ action: "delete_account", context: {}, userId });
		});

		it("returns null for already-consumed token (single use)", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			await consumeConfirmToken(token, userId);
			const second = await consumeConfirmToken(token, userId);

			expect(second).toBeNull();
		});

		it("returns null for invalid token", async () => {
			const result = await consumeConfirmToken("nonexistent-token", userId);

			expect(result).toBeNull();
		});

		it("returns null for expired token", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			await clearConfirmTokens();

			const result = await consumeConfirmToken(token, userId);
			expect(result).toBeNull();
		});

		it("returns action for token within TTL", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			const result = await consumeConfirmToken(token, userId);
			expect(result).toEqual({ action: "delete_account", context: {}, userId });
		});

		it("removes the redis key after consumption", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			await consumeConfirmToken(token, userId);

			const row = await getConfirmTokenRow(token);
			expect(row).toBeNull();
		});

		it("returns null for the wrong user and keeps the token available for the owner", async () => {
			const token = await generateConfirmToken("delete_account", userId, {});

			const wrongUserResult = await consumeConfirmToken(token, otherUserId);

			expect(wrongUserResult).toBeNull();
			expect(await getConfirmTokenRow(token)).not.toBeNull();

			const ownerResult = await consumeConfirmToken(token, userId);
			expect(ownerResult).toEqual({ action: "delete_account", context: {}, userId });
		});

	});

	describe("confirmActionConfig", () => {
		it("has config for all actions", () => {
			expect(confirmActionConfig.delete_account).toEqual({
				title: "Delete Account",
				message: expect.any(String),
				confirmLabel: "Delete Account",
				cancelLabel: "Cancel"
			});

			expect(confirmActionConfig.delete_domain).toEqual({
				title: "Delete Domain",
				message: expect.any(String),
				confirmLabel: "Delete",
				cancelLabel: "Keep Domain"
			});
		});
	});
});
