import { z } from "zod";
import { randomBytes } from "node:crypto";
import { confirmTokenStore, CONFIRM_TOKEN_TTL_SECONDS } from "../db/confirmTokenStore.js";

export const confirmActionSchema = z.enum(["delete_account", "delete_domain"]);
export type ConfirmAction = z.infer<typeof confirmActionSchema>;

export const confirmActionConfig: Record<ConfirmAction, {
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
}> = {
	delete_account: {
		title: "Delete Account",
		message: "Delete your account? This action cannot be undone. All your data will be permanently removed.",
		confirmLabel: "Delete Account",
		cancelLabel: "Cancel"
	},
	delete_domain: {
		title: "Delete Domain",
		message: "Delete this domain? This action cannot be undone.",
		confirmLabel: "Delete",
		cancelLabel: "Keep Domain"
	}
};

const confirmTokenPayloadSchema = z.object({
	action: confirmActionSchema,
	context: z.record(z.string(), z.string()),
	userId: z.string().uuid()
});

export type ConfirmTokenPayload = z.infer<typeof confirmTokenPayloadSchema>;

export const generateConfirmToken = z
	.function()
	.args(confirmActionSchema, z.string().uuid(), z.record(z.string(), z.string()).optional())
	.returns(z.promise(z.string()))
	.implement(async (action, userId, context) => {
		const token = randomBytes(32).toString("hex");
		const payload = { action, context: context ?? {}, userId };
		await confirmTokenStore.set(token, payload, CONFIRM_TOKEN_TTL_SECONDS);

		return token;
	});

export const peekConfirmToken = z
	.function()
	.args(z.string())
	.returns(z.promise(z.nullable(confirmTokenPayloadSchema)))
	.implement(async (token) => {
		const entry = await confirmTokenStore.get(token);

		if (!entry) {
			return null;
		}

		return confirmTokenPayloadSchema.parse(entry);
	});

export const consumeConfirmToken = z
	.function()
	.args(z.string(), z.string().uuid())
	.returns(z.promise(z.nullable(confirmTokenPayloadSchema)))
	.implement(async (token, userId) => {
		const entry = await confirmTokenStore.get(token);

		if (!entry) {
			return null;
		}

		const parsedEntry = confirmTokenPayloadSchema.parse(entry);

		if (parsedEntry.userId !== userId) {
			return null;
		}

		await confirmTokenStore.del(token);
		return parsedEntry;
	});
