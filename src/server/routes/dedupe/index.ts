import { z } from 'zod';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { render } from '../../../lib/response.js';
import { scanDomain } from '../../../pipeline/scanDomain.js';
import { DedupeInputPage, dedupeInputPagePropsSchema } from '../../../views/pages/dedupe.js';
import {
	normalizeSubmittedDomain,
	upsertDomainRecord,
	createPendingScanRecord,
	persistScanOutcome,
} from '../../scan/scanJob.js';

const dedupeRoutes = new Hono();

const dedupeFormSchema = z.object({
	domain: z.string().min(1),
});

dedupeRoutes.get(
	'/',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement((c) => {
			const viewProps = dedupeInputPagePropsSchema.parse({});
			return c.html(render(DedupeInputPage, viewProps));
		}),
);

dedupeRoutes.post(
	'/',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const body = await c.req.parseBody();
			const parsedForm = dedupeFormSchema.safeParse({
				domain: typeof body.domain === 'string' ? body.domain : '',
			});

			if (!parsedForm.success) {
				const viewProps = dedupeInputPagePropsSchema.parse({
					errorMessage: 'Invalid domain input.',
					defaultDomain: typeof body.domain === 'string' ? body.domain : '',
				});

				return c.html(render(DedupeInputPage, viewProps), 400);
			}

			const normalizedDomain = normalizeSubmittedDomain(parsedForm.data.domain);
			const domainRecord = await upsertDomainRecord(normalizedDomain);
			const scanRecord = await createPendingScanRecord(domainRecord.id);

			const pipelineResult = await scanDomain({ domain: normalizedDomain });
			await persistScanOutcome({
				scanId: scanRecord.id,
				pipelineResult,
			});

			return c.redirect(`/scan/${scanRecord.id}`, 302);
		}),
);

export default dedupeRoutes;
