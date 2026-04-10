import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { qualifyDomain } from "../../../pipeline/qualifyDomain.js";
import {
	QualifyInputPage,
	QualifyResultPage,
	qualifyInputPagePropsSchema,
	qualifyResultPagePropsSchema
} from "../../../views/pages/qualify.js";

const qualifyRoutes = new Hono();

const qualifyFormSchema = z.object({
	domain: z.string().min(1)
});

const qualifyQuerySchema = z.object({
	domain: z.string().optional()
});

const normalizeSubmittedDomain = z
	.function()
	.args(z.string())
	.returns(z.string().min(1))
	.implement((rawDomain) => {
		const trimmed = rawDomain.trim();

		if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
			let parsedUrl: URL;

			try {
				parsedUrl = new URL(trimmed);
			} catch {
				return trimmed.replace(/^https?:\/\//i, "");
			}

			const normalizedPath = parsedUrl.pathname === "/" ? "" : parsedUrl.pathname;
			return `${parsedUrl.host}${normalizedPath}${parsedUrl.search}`;
		}

		return trimmed;
	});

qualifyRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const parsedQuery = qualifyQuerySchema.safeParse(c.req.query());

			if (!parsedQuery.success) {
				const viewProps = qualifyInputPagePropsSchema.parse({
					errorMessage: "Invalid query input."
				});
				return c.html(render(QualifyInputPage, viewProps), 400);
			}

			if (parsedQuery.data.domain === undefined) {
				const viewProps = qualifyInputPagePropsSchema.parse({});
				return c.html(render(QualifyInputPage, viewProps));
			}

			if (parsedQuery.data.domain.trim().length === 0) {
				const viewProps = qualifyInputPagePropsSchema.parse({
					errorMessage: "Invalid domain input.",
					defaultDomain: parsedQuery.data.domain
				});

				return c.html(render(QualifyInputPage, viewProps), 400);
			}

			const normalizedDomain = normalizeSubmittedDomain(parsedQuery.data.domain);
			const qualification = await qualifyDomain({ domain: normalizedDomain });
			const viewProps = qualifyResultPagePropsSchema.parse({
				domain: normalizedDomain,
				isQualified: qualification.isQualified,
				reasons: qualification.reasons
			});

			return c.html(render(QualifyResultPage, viewProps));
		})
);

qualifyRoutes.post(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const body = await c.req.parseBody();
			const parsedForm = qualifyFormSchema.safeParse({
				domain: typeof body.domain === "string" ? body.domain : ""
			});

			if (!parsedForm.success) {
				const viewProps = qualifyInputPagePropsSchema.parse({
					errorMessage: "Invalid domain input.",
					defaultDomain: typeof body.domain === "string" ? body.domain : ""
				});

				return c.html(render(QualifyInputPage, viewProps), 400);
			}

			const normalizedDomain = normalizeSubmittedDomain(parsedForm.data.domain);
			const query = new URLSearchParams({ domain: normalizedDomain }).toString();

			return c.redirect(`/qualify?${query}`, 302);
		})
);

export default qualifyRoutes;
