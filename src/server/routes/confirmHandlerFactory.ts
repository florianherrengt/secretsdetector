import { z } from "zod";
import type { Context } from "hono";
import { render } from "../../lib/response.js";
import { confirmPagePropsSchema, ConfirmPage } from "../../views/pages/confirm.js";
import { confirmQuerySchema, resolveConfirmTokenForDisplay } from "./confirmQuerySchema.js";
import { consumeConfirmToken, type ConfirmAction } from "./confirmActions.js";

type ActionHandler = (c: Context, resolved: { action: ConfirmAction; context: Record<string, string> }) => Promise<Response>;

export const createConfirmHandlers = z
	.function()
	.args(z.string(), z.record(z.string(), z.custom<ActionHandler>()))
	.returns(z.object({
		getConfirmHandler: z.custom(),
		postConfirmHandler: z.custom()
	}))
	.implement((basePath, actionHandlers) => {
		const getConfirmHandler = z
			.function()
			.args(z.custom<Context>())
			.returns(z.custom<Response | Promise<Response>>())
			.implement(async (c) => {
				const parsedQuery = confirmQuerySchema.safeParse(c.req.query());

				if (!parsedQuery.success) {
					return c.html("<h1>Bad Request</h1><p>Invalid confirmation request.</p>", 400);
				}

				const resolved = await resolveConfirmTokenForDisplay(parsedQuery.data.token);

				if (!resolved) {
					return c.html("<h1>Bad Request</h1><p>Invalid or expired confirmation token.</p>", 400);
				}

				const viewProps = confirmPagePropsSchema.parse({
					title: resolved.config.title,
					message: resolved.config.message,
					confirmAction: `${basePath}/confirm?token=${parsedQuery.data.token}`,
					cancelHref: parsedQuery.data.back ?? basePath,
					confirmLabel: resolved.config.confirmLabel,
					cancelLabel: resolved.config.cancelLabel
				});

				return c.html(render(ConfirmPage, viewProps));
			});

		const postConfirmHandler = z
			.function()
			.args(z.custom<Context>())
			.returns(z.promise(z.instanceof(Response)))
			.implement(async (c) => {
				const user = c.get("user");

				if (!user) {
					return c.json({ error: "Authentication required" }, 401);
				}

				const token = c.req.query("token");

				if (!token) {
					return c.html("<h1>Bad Request</h1><p>Missing confirmation token.</p>", 400);
				}

				const resolved = await consumeConfirmToken(token, user.userId);

				if (!resolved) {
					return c.html("<h1>Bad Request</h1><p>Invalid or expired confirmation token.</p>", 400);
				}

				const handler = actionHandlers[resolved.action];

				if (handler) {
					return handler(c, resolved);
				}

				return c.html("<h1>Bad Request</h1><p>Unknown action.</p>", 400);
			});

		return { getConfirmHandler, postConfirmHandler };
	});
