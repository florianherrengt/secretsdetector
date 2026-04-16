import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { termsOfServicePagePropsSchema, TermsOfServicePage } from "../../../views/pages/termsOfService.js";
import { privacyPolicyPagePropsSchema, PrivacyPolicyPage } from "../../../views/pages/privacyPolicy.js";

const legalRoutes = new Hono();

const fallbackContactEmail = "support@secretswatch.com";

const resolveContactEmail = z
	.function()
	.args(z.string().optional())
	.returns(z.string().min(1))
	.implement((envValue) => {
		const trimmed = (envValue ?? "").trim();
		return trimmed.length > 0 ? trimmed : fallbackContactEmail;
	});

legalRoutes.get(
	"/terms",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const contactEmail = resolveContactEmail(process.env.LEGAL_CONTACT_EMAIL);
			const viewProps = termsOfServicePagePropsSchema.parse({ contactEmail });
			return c.html(render(TermsOfServicePage, viewProps));
		})
);

legalRoutes.get(
	"/privacy",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const contactEmail = resolveContactEmail(process.env.LEGAL_CONTACT_EMAIL);
			const viewProps = privacyPolicyPagePropsSchema.parse({ contactEmail });
			return c.html(render(PrivacyPolicyPage, viewProps));
		})
);

export default legalRoutes;
