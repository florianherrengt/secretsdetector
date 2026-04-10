import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { listSources, getSource, previewSource, runSourcePipeline } from "../../../pipeline/sources/index.js";
import { sourceListItemSchema } from "../../../views/pages/source.js";
import {
	sourceInputPagePropsSchema,
	SourceInputPage,
	sourcePreviewPagePropsSchema,
	SourcePreviewPage,
	sourceResultPagePropsSchema,
	SourceResultPage
} from "../../../views/pages/source.js";

const sourceRoutes = new Hono();

const sourceQuerySchema = z.object({
	source: z.string().min(1).optional(),
	tld: z.string().optional(),
	maxPages: z.string().optional()
});

const sourcePostSchema = z.object({
	source: z.string().min(1)
});

const toSourceListItem = z
	.function()
	.args(z.object({ key: z.string(), label: z.string(), description: z.string() }))
	.returns(sourceListItemSchema)
	.implement((s) => sourceListItemSchema.parse(s));

sourceRoutes.get(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const query = sourceQuerySchema.safeParse(c.req.query());
			let selectedSource = query.success ? query.data.source : undefined;
			const sources = listSources();

			if (selectedSource !== undefined && sources.every((s) => s.key !== selectedSource)) {
				selectedSource = undefined;
			}

			const viewProps = sourceInputPagePropsSchema.parse({
				sources: sources.map((s) => toSourceListItem(s)),
				selectedSourceKey: selectedSource
			});

			return c.html(render(SourceInputPage, viewProps));
		})
);

sourceRoutes.get(
	"/preview",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
	.implement(async (c) => {
		const query = sourceQuerySchema.safeParse(c.req.query());

		if (!query.success || query.data.source === undefined) {
			return c.redirect("/source", 302);
		}

		const source = getSource(query.data.source);

		if (source === undefined) {
			return c.redirect("/source", 302);
		}

		const input: Record<string, unknown> = {};

		if (query.data.tld !== undefined) {
			input.tld = query.data.tld;
		}

		if (query.data.maxPages !== undefined) {
			input.maxPages = query.data.maxPages;
		}

		const result = await previewSource({ sourceKey: source.key, input });
		const viewProps = sourcePreviewPagePropsSchema.parse({
			source: toSourceListItem(source),
			result
		});

		return c.html(render(SourcePreviewPage, viewProps));
	})
);

sourceRoutes.post(
	"/",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
	.implement(async (c) => {
			const body = await c.req.parseBody();
			const parsed = sourcePostSchema.safeParse({
				source: typeof body.source === "string" ? body.source : ""
			});

			if (!parsed.success) {
				const sources = listSources();
				const viewProps = sourceInputPagePropsSchema.parse({
					sources: sources.map((s) => toSourceListItem(s)),
					errorMessage: "Select a source."
				});
				return c.html(render(SourceInputPage, viewProps), 400);
			}

			const source = getSource(parsed.data.source);

			if (source === undefined) {
				const sources = listSources();
				const viewProps = sourceInputPagePropsSchema.parse({
					sources: sources.map((s) => toSourceListItem(s)),
					errorMessage: `Unknown source: ${parsed.data.source}`
				});
				return c.html(render(SourceInputPage, viewProps), 400);
			}

			const rawInput: Record<string, unknown> = {};

			for (const [key, value] of Object.entries(body)) {
				if (key === "source") continue;
				if (typeof value === "string") {
					rawInput[key] = value;
				}
			}

			const result = await runSourcePipeline({ sourceKey: source.key, input: rawInput });
			const viewProps = sourceResultPagePropsSchema.parse({
				source: toSourceListItem(source),
				result
			});

			return c.html(render(SourceResultPage, viewProps));
		})
);

export default sourceRoutes;
