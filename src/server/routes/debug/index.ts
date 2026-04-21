import { z } from 'zod';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { desc } from 'drizzle-orm';
import { render } from '../../../lib/response.js';
import { getSource, debugSource } from '../../../pipeline/sources/index.js';
import { toSourceListItem } from '../../../views/pages/source.js';
import { sourceDebugPagePropsSchema, SourceDebugPage } from '../../../views/pages/sourceDebug.js';
import { db } from '../../db/client.js';
import { mockEmails } from '../../db/schema.js';

const debugRoutes = new Hono();

debugRoutes.get(
	'/sources/:sourceName',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const sourceName = c.req.param('sourceName');

			if (sourceName === undefined) {
				return c.text('Source name required', 400);
			}

			const source = getSource(sourceName);

			if (source === undefined) {
				return c.text(`Unknown source: ${sourceName}`, 404);
			}

			const queryTld = c.req.query('tld');
			const queryMaxPages = c.req.query('maxPages');

			const input: Record<string, unknown> = {};

			if (source.key === 'crtsh' && typeof queryTld === 'string' && queryTld.trim().length > 0) {
				input.tld = queryTld;
			}

			if (source.key === 'producthunt' && typeof queryMaxPages === 'string') {
				const parsed = z.coerce.number().int().min(1).max(20).safeParse(queryMaxPages);
				if (parsed.success) {
					input.maxPages = parsed.data;
				}
			}

			const viewProps = sourceDebugPagePropsSchema.parse({
				source: toSourceListItem(source),
				result: null,
				input,
			});

			return c.html(render(SourceDebugPage, viewProps));
		}),
);

debugRoutes.post(
	'/sources/:sourceName',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const sourceName = c.req.param('sourceName');

			if (sourceName === undefined) {
				return c.text('Source name required', 400);
			}

			const source = getSource(sourceName);

			if (source === undefined) {
				return c.text(`Unknown source: ${sourceName}`, 404);
			}

			const body = await c.req.parseBody();
			const input: Record<string, unknown> = {};

			if (source.key === 'crtsh' && typeof body.tld === 'string' && body.tld.trim().length > 0) {
				input.tld = body.tld;
			}

			if (source.key === 'producthunt' && typeof body.maxPages === 'string') {
				const parsed = z.coerce.number().int().min(1).max(20).safeParse(body.maxPages);
				if (parsed.success) {
					input.maxPages = parsed.data;
				}
			}

			const hasInput = Object.keys(input).length > 0;

			if (!hasInput) {
				const viewProps = sourceDebugPagePropsSchema.parse({
					source: toSourceListItem(source),
					result: null,
					input,
				});
				return c.html(render(SourceDebugPage, viewProps));
			}

			const result = await debugSource({ sourceKey: source.key, input });
			const viewProps = sourceDebugPagePropsSchema.parse({
				source: toSourceListItem(source),
				result,
				input,
			});

			return c.html(render(SourceDebugPage, viewProps));
		}),
);

debugRoutes.get(
	'/emails',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			const emails = await db.select().from(mockEmails).orderBy(desc(mockEmails.createdAt));
			return c.json(emails);
		}),
);

debugRoutes.post(
	'/emails/clear',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(async (c) => {
			await db.delete(mockEmails);
			return c.json({ success: true });
		}),
);

export default debugRoutes;
