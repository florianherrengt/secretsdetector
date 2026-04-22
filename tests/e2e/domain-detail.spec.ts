import { expect, test } from './fixtures/authed';
import { createAuthenticatedSession } from './support/auth';

const UNIQUE = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const domain = process.env.DOMAIN ?? '127.0.0.1:3000';
const selfHost = domain.includes('://') ? new URL(domain).host : domain;

const addDomain = async (
	request: import('@playwright/test').APIRequestContext,
	authHeaders: Record<string, string>,
	hostname: string,
) => {
	const response = await request.post('/domains', {
		headers: {
			...authHeaders,
			'content-type': 'application/x-www-form-urlencoded',
		},
		form: { domain: hostname },
		maxRedirects: 0,
	});
	expect(response.status()).toBe(302);
};

const waitForScanCompletion = async (page: import('@playwright/test').Page) => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const issueDetected = await page.getByText('Issue Detected', { exact: true }).count();
		const noIssuesFound = await page.getByText('No Issues Found', { exact: true }).count();

		if (issueDetected > 0 || noIssuesFound > 0) {
			return;
		}

		await page.waitForTimeout(250);
		await page.reload();
	}

	throw new Error('Timed out waiting for scan completion');
};

const addDomainAndScan = async (
	page: import('@playwright/test').Page,
	request: import('@playwright/test').APIRequestContext,
	authHeaders: Record<string, string>,
	hostname: string,
) => {
	await addDomain(request, authHeaders, hostname);
	await page.goto(`/domains/${hostname}`);
	await page.getByRole('button', { name: 'Scan now' }).click();
	await page.waitForURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 30_000 });
	await waitForScanCompletion(page);
};

test.describe('Domain detail: GET /domains/:hostname', () => {
	test('returns 404 for unknown hostname', async ({ request, authHeaders }) => {
		const response = await request.get(`/domains/nonexistent-${UNIQUE()}.com`, {
			headers: authHeaders,
		});
		expect(response.status()).toBe(404);
	});

	test('returns 401 when not authenticated', async ({ request }) => {
		const response = await request.get('/domains/example.com', { maxRedirects: 0 });
		expect(response.status()).toBe(401);
	});

	test('shows domain detail page for a tracked domain', async ({ request, authHeaders }) => {
		const hostname = `detail-target-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const response = await request.get(`/domains/${hostname}`, { headers: authHeaders });
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('text/html');

		const html = await response.text();
		expect(html).toContain(hostname);
	});

	test('shows empty state when domain has no scans', async ({ request, authHeaders }) => {
		const hostname = `no-scans-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const response = await request.get(`/domains/${hostname}`, { headers: authHeaders });
		const html = await response.text();
		expect(html).toContain('No scans yet');
	});

	test('shows scan now button on detail page', async ({ request, authHeaders }) => {
		const hostname = `scan-action-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const response = await request.get(`/domains/${hostname}`, { headers: authHeaders });
		const html = await response.text();
		expect(html).toContain('Scan now');
		expect(html).toContain(`name="domain" value="${hostname}"`);
	});

	test('shows delete link on detail page header', async ({ request, authHeaders }) => {
		const hostname = `delete-link-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const response = await request.get(`/domains/${hostname}`, { headers: authHeaders });
		const html = await response.text();
		expect(html).toContain('Delete');
		expect(html).toContain('/domains/confirm?token=');
	});

	test('shows scan history after a scan completes', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		await addDomainAndScan(authedPage, request, authHeaders, selfHost);

		await authedPage.goto(`/domains/${selfHost}`);
		await expect(authedPage.locator('h1')).toContainText(selfHost);

		const scanLink = authedPage.locator('a[href^="/scan/"]').first();
		await expect(scanLink).toBeVisible();
	});

	test('scan row displays status badge and date', async ({ authedPage, request, authHeaders }) => {
		await addDomainAndScan(authedPage, request, authHeaders, selfHost);

		await authedPage.goto(`/domains/${selfHost}`);

		const scanLink = authedPage.locator('a[href^="/scan/"]').first();
		await expect(scanLink).toBeVisible();

		await expect(scanLink.locator('time')).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);

		const passedCount = await scanLink.getByText('Passed', { exact: true }).count();
		const issuesCount = await scanLink.getByText(/issue/).count();
		expect(passedCount + issuesCount).toBeGreaterThan(0);
	});

	test('scan now from detail page triggers scan and redirects', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		await addDomain(request, authHeaders, selfHost);

		const page = authedPage;
		await page.goto(`/domains/${selfHost}`);

		await page.getByRole('button', { name: 'Scan now' }).click();
		await page.waitForURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 30_000 });
		await expect(page).toHaveTitle('Scan Result | Secrets Watch');
	});

	test('clicking a scan row navigates to scan result', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		await addDomainAndScan(authedPage, request, authHeaders, selfHost);

		await authedPage.goto(`/domains/${selfHost}`);

		const scanLink = authedPage.locator('a[href^="/scan/"]').first();
		await expect(scanLink).toBeVisible();

		await scanLink.click();
		await authedPage.waitForURL(/\/scan\/[0-9a-f-]{36}$/, { timeout: 10_000 });
		await expect(authedPage).toHaveTitle('Scan Result | Secrets Watch');
	});
});

test.describe('Domain list: modified for domain detail links', () => {
	test('domain name is a link to detail page', async ({ request, authHeaders }) => {
		const hostname = `link-test-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const response = await request.get('/domains', { headers: authHeaders });
		const html = await response.text();
		expect(html).toContain(`href="/domains/${hostname}"`);
	});

	test('domain name link is rendered as anchor in browser', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		const hostname = `anchor-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const page = authedPage;
		await page.goto('/domains');

		const link = page.locator('a[href*="/domains/"]').filter({ hasText: hostname });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', `/domains/${hostname}`);
	});

	test('each domain row has only domain link — no delete', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		const hostname = `row-layout-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const page = authedPage;
		await page.goto('/domains');

		const row = page.locator('li').filter({ hasText: hostname });
		await expect(row).toBeVisible();

		await expect(row.locator('a[href*="/domains/"]').filter({ hasText: hostname })).toBeVisible();

		await expect(row.getByRole('link', { name: 'Delete' })).toHaveCount(0);
		await expect(row.getByText('Delete')).toHaveCount(0);
	});

	test('full row area is clickable via link', async ({ authedPage, request, authHeaders }) => {
		const hostname = `full-row-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const page = authedPage;
		await page.goto('/domains');

		const row = page.locator('li').filter({ hasText: hostname });
		await expect(row).toBeVisible();

		const statusText = row.getByText('No checks yet');
		const statusBox = await statusText.boundingBox();
		expect(statusBox).toBeTruthy();

		await page.mouse.click(
			statusBox!.x + statusBox!.width / 2,
			statusBox!.y + statusBox!.height / 2,
		);
		await page.waitForURL(`/domains/${hostname}`);
		await expect(page.locator('h1')).toContainText(hostname);
	});

	test('clicking domain name navigates to detail page in browser', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		const hostname = `nav-click-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const page = authedPage;
		await page.goto('/domains');

		await page.locator('a[href*="/domains/"]').filter({ hasText: hostname }).click();
		await page.waitForURL(`/domains/${hostname}`);

		await expect(page.locator('h1')).toContainText(hostname);
	});
});

test.describe('Domain detail: delete flow', () => {
	test('delete confirmation cancel returns to detail page', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		const hostname = `cancel-del-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const page = authedPage;
		await page.goto(`/domains/${hostname}`);

		const deleteLink = page.getByRole('link', { name: 'Delete' });
		await expect(deleteLink).toBeVisible();

		await deleteLink.click();
		await expect(page.locator('h1')).toContainText('Delete Domain');

		await page.getByRole('link', { name: 'Keep Domain' }).click();
		await page.waitForURL(`/domains/${hostname}`);
		await expect(page.locator('h1')).toContainText(hostname);
	});

	test('delete confirmation succeeds and redirects to domain list', async ({
		authedPage,
		request,
		authHeaders,
	}) => {
		const hostname = `confirm-del-${UNIQUE()}.com`;
		await addDomain(request, authHeaders, hostname);

		const page = authedPage;
		await page.goto(`/domains/${hostname}`);

		await page.getByRole('link', { name: 'Delete' }).click();
		await expect(page.locator('h1')).toContainText('Delete Domain');

		await page.getByRole('button', { name: 'Delete' }).click();
		await page.waitForURL('/domains');

		const html = await page.content();
		expect(html).not.toContain(hostname);
	});
});

test.describe('Domain detail: user isolation', () => {
	test('cannot view another users domain detail', async ({ request }) => {
		const userA = await createAuthenticatedSession(request, `isolation-a-${UNIQUE()}@example.com`);
		const userB = await createAuthenticatedSession(request, `isolation-b-${UNIQUE()}@example.com`);

		const hostname = `private-${UNIQUE()}.com`;
		await addDomain(request, { Cookie: userA.cookieHeader }, hostname);

		const response = await request.get(`/domains/${hostname}`, {
			headers: { Cookie: userB.cookieHeader },
		});
		expect(response.status()).toBe(404);
	});
});

test.describe('Domain detail: domains with path/query characters', () => {
	test('detail page is reachable for domain with path', async ({ request, authHeaders }) => {
		const input = `https://path-${UNIQUE()}.com/some/path`;
		await addDomain(request, authHeaders, input);

		const url = new URL(input);
		const normalizedDomain = `${url.host}${url.pathname}`;

		const encoded = encodeURIComponent(normalizedDomain);

		const response = await request.get(`/domains/${encoded}`, { headers: authHeaders });
		expect(response.status()).toBe(200);
		const html = await response.text();
		expect(html).toContain(normalizedDomain);
	});

	test('detail page is reachable for domain with query string', async ({
		request,
		authHeaders,
	}) => {
		const input = `https://query-${UNIQUE()}.com?x=1&y=2`;
		await addDomain(request, authHeaders, input);

		const url = new URL(input);
		const normalizedDomain = `${url.host}${url.search}`;

		const encoded = encodeURIComponent(normalizedDomain);

		const response = await request.get(`/domains/${encoded}`, { headers: authHeaders });
		expect(response.status()).toBe(200);
		const html = await response.text();
		expect(html).toContain(normalizedDomain.replace(/&/g, '&amp;'));
	});

	test('domain list uses encoded href for domains with path', async ({ request, authHeaders }) => {
		const input = `https://href-${UNIQUE()}.com/app`;
		await addDomain(request, authHeaders, input);

		const normalizedDomain = input.replace('https://', '');
		const encoded = encodeURIComponent(normalizedDomain);

		const response = await request.get('/domains', { headers: authHeaders });
		const html = await response.text();
		expect(html).toContain(`href="/domains/${encoded}"`);
	});

	test('delete flow works for domain with path', async ({ authedPage, request, authHeaders }) => {
		const input = `https://del-path-${UNIQUE()}.com/api`;
		await addDomain(request, authHeaders, input);

		const normalizedDomain = input.replace('https://', '');
		const encoded = encodeURIComponent(normalizedDomain);

		const page = authedPage;
		await page.goto(`/domains/${encoded}`);

		await expect(page.locator('h1')).toContainText(normalizedDomain);

		const deleteLink = page.getByRole('link', { name: 'Delete' });
		await expect(deleteLink).toBeVisible();

		await deleteLink.click();
		await expect(page.locator('h1')).toContainText('Delete Domain');

		await page.getByRole('button', { name: 'Delete' }).click();
		await page.waitForURL('/domains');

		const html = await page.content();
		expect(html).not.toContain(normalizedDomain);
	});
});
