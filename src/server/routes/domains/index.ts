import { z } from 'zod';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { render } from '../../../lib/response.js';
import {
	domainDetailPagePropsSchema,
	scanHistoryItemSchema,
	DomainDetailPage,
} from '../../../views/pages/domainDetail.js';
import { domainListPagePropsSchema, DomainListPage } from '../../../views/pages/domainList.js';
import { buildConfirmUrl } from '../confirmQuerySchema.js';
import { createConfirmHandlers } from '../confirmHandlerFactory.js';
import { db } from '../../db/client.js';
import { domains, findings, scans, userDomains } from '../../db/schema.js';
import { normalizeSubmittedDomain } from '../../scan/scanJob.js';
import { requireAuth } from '../../auth/middleware.js';
import { hostnameSchema } from '../hostnameSchema.js';
import { scanStatusSchema } from '../../../schemas/scan.js';

const domainRoutes = new Hono();

domainRoutes.use('*', requireAuth);

const hostnameParamSchema = z.string().trim().min(1).max(2048);

const addDomainFormSchema = z.object({
	domain: hostnameSchema,
});

const deleteDomainParamsSchema = z.object({
	domainId: z.string().uuid(),
});

domainRoutes.get(
	'/',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const user = c.get('user');
			const rows = await db.select().from(userDomains).where(eq(userDomains.userId, user.userId));
			const uniqueHostnames = [...new Set(rows.map((row) => row.domain))];
			const domainRows =
				uniqueHostnames.length > 0
					? await db
							.select({ id: domains.id, hostname: domains.hostname })
							.from(domains)
							.where(inArray(domains.hostname, uniqueHostnames))
					: [];
			const domainIdByHostname = new Map(domainRows.map((row) => [row.hostname, row.id]));
			const domainIds = [...new Set(domainRows.map((row) => row.id))];
			const scanRows =
				domainIds.length > 0
					? await db
							.select({
								id: scans.id,
								domainId: scans.domainId,
								status: scans.status,
								startedAt: scans.startedAt,
							})
							.from(scans)
							.where(inArray(scans.domainId, domainIds))
							.orderBy(desc(scans.startedAt))
					: [];
			const latestSuccessfulScanByDomainId = new Map<string, string>();

			for (const scanRow of scanRows) {
				if (scanRow.status !== 'success') {
					continue;
				}

				if (!latestSuccessfulScanByDomainId.has(scanRow.domainId)) {
					latestSuccessfulScanByDomainId.set(scanRow.domainId, scanRow.id);
				}
			}

			const latestSuccessfulScanIds = [...new Set(latestSuccessfulScanByDomainId.values())];
			const findingCountRows =
				latestSuccessfulScanIds.length > 0
					? await db
							.select({
								scanId: findings.scanId,
								count: sql<number>`count(*)`,
							})
							.from(findings)
							.where(inArray(findings.scanId, latestSuccessfulScanIds))
							.groupBy(findings.scanId)
					: [];
			const findingCountByScanId = new Map(
				findingCountRows.map((row) => [row.scanId, Number(row.count)]),
			);
			const viewProps = domainListPagePropsSchema.parse({
				domains: rows.map((row) => ({
					id: row.id,
					domain: row.domain,
					lastCheckResult: (() => {
						const domainId = domainIdByHostname.get(row.domain);

						if (!domainId) {
							return 'none';
						}

						const scanId = latestSuccessfulScanByDomainId.get(domainId);

						if (!scanId) {
							return 'none';
						}

						return (findingCountByScanId.get(scanId) ?? 0) > 0 ? 'issues' : 'pass';
					})(),
					href: `/domains/${encodeURIComponent(row.domain)}`,
				})),
			});

			return c.html(render(DomainListPage, viewProps));
		}),
);

const handleDeleteDomain = z
	.function()
	.args(z.custom<Context>(), z.custom<{ action: string; context: Record<string, string> }>())
	.returns(z.promise(z.instanceof(Response)))
	.implement(async (c, resolved) => {
		const user = c.get('user');
		const parsedParams = deleteDomainParamsSchema.safeParse({
			domainId: resolved.context.domainId,
		});

		if (!parsedParams.success) {
			return c.html('<h1>Bad Request</h1><p>Invalid domain id.</p>', 400);
		}

		await db
			.delete(userDomains)
			.where(
				and(eq(userDomains.id, parsedParams.data.domainId), eq(userDomains.userId, user.userId)),
			);

		return c.redirect('/domains', 302);
	});

const { getConfirmHandler, postConfirmHandler } = createConfirmHandlers('/domains', {
	delete_domain: handleDeleteDomain,
});

domainRoutes.get(
	'/confirm',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(getConfirmHandler),
);

domainRoutes.post(
	'/confirm',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.promise(z.instanceof(Response)))
		.implement(postConfirmHandler),
);

const buildScanHistoryItems = z
	.function()
	.args(z.string().uuid())
	.returns(z.promise(z.array(scanHistoryItemSchema)))
	.implement(async (domainId) => {
		const scanRows = await db
			.select({
				id: scans.id,
				status: scans.status,
				startedAt: scans.startedAt,
				finishedAt: scans.finishedAt,
			})
			.from(scans)
			.where(eq(scans.domainId, domainId))
			.orderBy(desc(scans.startedAt));

		const successfulScanIds = scanRows
			.filter((row) => row.status === 'success')
			.map((row) => row.id);

		const findingCountMap = new Map<string, number>();

		if (successfulScanIds.length > 0) {
			const findingCountRows = await db
				.select({
					scanId: findings.scanId,
					count: sql<number>`count(*)`,
				})
				.from(findings)
				.where(inArray(findings.scanId, successfulScanIds))
				.groupBy(findings.scanId);
			for (const row of findingCountRows) {
				findingCountMap.set(row.scanId, Number(row.count));
			}
		}

		return scanRows.map((row) => ({
			scanId: row.id,
			status: scanStatusSchema.parse(row.status),
			startedAtIso: row.startedAt.toISOString(),
			durationMs: row.finishedAt
				? Math.max(0, row.finishedAt.getTime() - row.startedAt.getTime())
				: 0,
			findingCount: row.status === 'success' ? (findingCountMap.get(row.id) ?? 0) : 0,
		}));
	});

domainRoutes.get(
	'/:hostname{.+}',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const rawHostname = c.req.param('hostname') ?? '';
			const parsedHostname = hostnameParamSchema.safeParse(rawHostname);

			if (!parsedHostname.success) {
				return c.text('Not found', 404);
			}

			const hostname = parsedHostname.data;
			const user = c.get('user');
			const userDomainRows = await db
				.select()
				.from(userDomains)
				.where(and(eq(userDomains.userId, user.userId), eq(userDomains.domain, hostname)))
				.limit(1);

			if (userDomainRows.length === 0) {
				return c.text('Not found', 404);
			}

			const userDomainRow = userDomainRows[0];
			const domainRows = await db
				.select({ id: domains.id })
				.from(domains)
				.where(eq(domains.hostname, hostname))
				.limit(1);

			const scanHistoryItems =
				domainRows.length > 0 ? await buildScanHistoryItems(domainRows[0].id) : [];

			const deleteConfirmHref = await buildConfirmUrl(
				'delete_domain',
				user.userId,
				{ domainId: userDomainRow.id },
				`/domains/${encodeURIComponent(hostname)}`,
			);

			const viewProps = domainDetailPagePropsSchema.parse({
				hostname,
				scans: scanHistoryItems,
				deleteConfirmHref,
			});

			return c.html(render(DomainDetailPage, viewProps));
		}),
);

domainRoutes.post(
	'/',
	z
		.function()
		.args(z.custom<Context>())
		.returns(z.custom<Response | Promise<Response>>())
		.implement(async (c) => {
			const body = await c.req.parseBody();
			const parsedForm = addDomainFormSchema.safeParse({
				domain: typeof body.domain === 'string' ? body.domain : '',
			});

			if (!parsedForm.success) {
				return c.html('<h1>Bad Request</h1><p>Invalid domain input.</p>', 400);
			}

			const normalizedDomain = normalizeSubmittedDomain(parsedForm.data.domain);

			await db.insert(userDomains).values({
				userId: c.get('user').userId,
				domain: normalizedDomain,
				createdAt: new Date(),
			});

			return c.redirect('/domains', 302);
		}),
);

export default domainRoutes;
