import { z } from "zod";
import { Hono } from "hono";
import type { Context } from "hono";
import { render } from "../../../lib/response.js";
import { getSource, debugSource } from "../../../pipeline/sources/index.js";
import { sourceListItemSchema } from "../../../views/pages/source.js";
import {
	sourceDebugPagePropsSchema,
	SourceDebugPage
} from "../../../views/pages/sourceDebug.js";

const debugRoutes = new Hono();

const toSourceListItem = z
	.function()
	.args(z.object({ key: z.string(), label: z.string(), description: z.string() }))
	.returns(sourceListItemSchema)
	.implement((s) => sourceListItemSchema.parse(s));

debugRoutes.get(
	"/sources/:sourceName",
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const sourceName = c.req.param("sourceName");

			if (sourceName === undefined) {
				return c.text("Source name required", 400);
			}

			const source = getSource(sourceName);

			if (source === undefined) {
				return c.text(`Unknown source: ${sourceName}`, 404);
			}

			const queryTld = c.req.query("tld");
			const queryMaxPages = c.req.query("maxPages");

			const shouldRunDebug =
				(source.key === "crtsh" && typeof queryTld === "string" && queryTld.trim().length > 0) ||
				(source.key === "producthunt" && typeof queryMaxPages === "string");

			if (!shouldRunDebug) {
				const viewProps = sourceDebugPagePropsSchema.parse({
					source: toSourceListItem(source),
					result: null,
					input: source.key === "producthunt" ? { maxPages: 10 } : {}
				});
				return c.html(render(SourceDebugPage, viewProps));
			}

			const input: Record<string, unknown> = {};

			if (source.key === "crtsh" && typeof queryTld === "string") {
				input.tld = queryTld;
			}

			if (source.key === "producthunt" && typeof queryMaxPages === "string") {
				const parsed = z.coerce.number().int().min(1).max(20).safeParse(queryMaxPages);
				if (parsed.success) {
					input.maxPages = parsed.data;
				}
			}

			const result = await debugSource({ sourceKey: source.key, input });
			const viewProps = sourceDebugPagePropsSchema.parse({
				source: toSourceListItem(source),
				result,
				input
			});

			return c.html(render(SourceDebugPage, viewProps));
		})
);

export default debugRoutes;
