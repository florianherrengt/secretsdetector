import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { settingsPagePropsSchema, SettingsPage } from "../../../views/pages/settings.js";
import { buildConfirmUrl } from "../confirmQuerySchema.js";
import { createConfirmHandlers } from "../confirmHandlerFactory.js";
import { deleteAccount } from "../../auth/index.js";
import { getEmailProvider } from "../../email/index.js";
import { requireAuth } from "../../auth/middleware.js";
import { setFlashMessage } from "../../../lib/flash.js";

const settingsRoutes = new Hono();

settingsRoutes.use("*", requireAuth);

settingsRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
		const user = c.get("user");
			const viewProps = settingsPagePropsSchema.parse({
				email: user.email,
				deleteAccountUrl: await buildConfirmUrl("delete_account", user.userId, undefined, "/settings")
			});

			return c.html(render(SettingsPage, viewProps));
		})
);

const handleDeleteAccount = z
	.function()
	.args(z.custom<Context>(), z.custom<{ action: string; context: Record<string, string> }>())
	.returns(z.promise(z.instanceof(Response)))
	.implement(async (c) => {
		const user = c.get("user");
		await deleteAccount(user.userId);

		try {
			const emailProvider = getEmailProvider();
			await emailProvider.send({
				to: user.email,
				subject: "Account deleted",
				html: "<p>Your account has been deleted.</p>"
			});
		} catch (error) {
			console.error("Failed to send account deletion email", error);
		}

		setFlashMessage(c, "Your account has been deleted.");
		c.header("Set-Cookie", "session_id=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0", { append: true });

		return c.redirect("/", 302);
	});

const { getConfirmHandler, postConfirmHandler } = createConfirmHandlers("/settings", {
	delete_account: handleDeleteAccount
});

settingsRoutes.get(
	"/confirm",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(getConfirmHandler)
);

settingsRoutes.post(
	"/confirm",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(postConfirmHandler)
);

export default settingsRoutes;
