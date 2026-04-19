import { z } from "zod";
import { confirmActionSchema, confirmActionConfig, generateConfirmToken, peekConfirmToken } from "./confirmActions.js";

export const confirmQuerySchema = z.object({
	token: z.string().min(1),
	back: z
		.string()
		.trim()
		.min(1)
		.max(2048)
		.regex(/^\/(?!\/).+$/, "Invalid cancel endpoint")
		.optional()
});

const actionBasePaths: Record<string, string> = {
	delete_account: "/settings",
	delete_domain: "/domains"
};

export const buildConfirmUrl = z
	.function()
	.args(confirmActionSchema, z.string().uuid(), z.record(z.string(), z.string()).optional(), z.string().optional())
	.returns(z.promise(z.string()))
	.implement(async (action, userId, context, back) => {
		const token = await generateConfirmToken(action, userId, context);
		const params = new URLSearchParams({ token });

		if (back) {
			params.set("back", back);
		}

		const basePath = actionBasePaths[action] ?? "/settings";
		return `${basePath}/confirm?${params.toString()}`;
	});

export const resolveConfirmTokenForDisplay = z
	.function()
	.args(z.string())
	.returns(z.promise(z.nullable(z.object({
		action: confirmActionSchema,
		context: z.record(z.string(), z.string()),
		config: z.object({
			title: z.string(),
			message: z.string(),
			confirmLabel: z.string(),
			cancelLabel: z.string()
		})
	}))))
	.implement(async (token) => {
		const result = await peekConfirmToken(token);

		if (!result) {
			return null;
		}

		return {
			action: result.action,
			context: result.context,
			config: confirmActionConfig[result.action]
		};
	});
