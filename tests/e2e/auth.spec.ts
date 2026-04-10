import { expect, test } from "@playwright/test";

const domain = process.env.DOMAIN ?? "127.0.0.1:3000";

const baseUrl = `http://${domain}`;

interface MockEmail {
  to: string;
  subject: string;
  html: string;
  createdAt: string;
}

test.describe("Magic Link Authentication", () => {
  test("complete magic link auth flow", async ({ request }) => {
    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;

    await test.step("Step 1: Request magic link", async () => {
      const response = await request.post(`${baseUrl}/auth/request-link`, {
        headers: { "Content-Type": "application/json" },
        data: { email: testEmail }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toEqual({ success: true });
    });

    let magicLink: string | null = null; // eslint-disable-line custom/no-mutable-variables

    await test.step("Step 2: Retrieve mock email", async () => {
      const response = await request.get(`${baseUrl}/debug/emails`);

      expect(response.status()).toBe(200);
      const emails = await response.json();

      const testEmails = emails.filter((email: MockEmail) => email.to === testEmail);
      expect(testEmails.length).toBeGreaterThan(0);

      const latestEmail = testEmails.sort(
        (a: MockEmail, b: MockEmail) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      expect(latestEmail.subject).toBe("Your login link");
      expect(latestEmail.html).toContain("<a");

      const linkMatch = latestEmail.html.match(/href="([^"]*auth\/verify\?token=[^"]*)"/);
      expect(linkMatch).not.toBeNull();

      magicLink = linkMatch ? linkMatch[1] : null;
      expect(magicLink).not.toBeNull();
      expect(magicLink).toContain("/auth/verify?token=");
    });

    let sessionId: string | null = null; // eslint-disable-line custom/no-mutable-variables

    await test.step("Step 3: Visit magic link", async () => {
      expect(magicLink).not.toBeNull();
      
      const url = magicLink!.startsWith("http") ? magicLink! : `${baseUrl}${magicLink}`;
      
      const response = await request.get(url, {
        maxRedirects: 0,
        headers: { "Accept": "text/html" }
      });

      expect([302, 303]).toContain(response.status());

      const setCookieHeader = response.headers()["set-cookie"];
      expect(setCookieHeader).toBeDefined();

      const sessionMatch = setCookieHeader?.match(/session_id=([^;]+)/);
      expect(sessionMatch).not.toBeNull();

      sessionId = sessionMatch ? sessionMatch[1] : null;
      expect(sessionId).not.toBeNull();
    });

    await test.step("Step 4: Verify authenticated state", async () => {
      expect(sessionId).not.toBeNull();

      const response = await request.get(`${baseUrl}/auth/whoami`, {
        headers: {
          "Cookie": `session_id=${sessionId}`
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();

      expect(body).toHaveProperty("userId");
      expect(body).toHaveProperty("email");
      expect(body.email).toBe(testEmail);
      expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  test("invalid token returns 401", async ({ request }) => {
    const response = await request.get(`${baseUrl}/auth/verify?token=invalid_token`, {
      maxRedirects: 0
    });

    expect(response.status()).toBe(401);
  });

  test("missing token returns 400", async ({ request }) => {
    const response = await request.get(`${baseUrl}/auth/verify`, {
      maxRedirects: 0
    });

    expect(response.status()).toBe(400);
  });

  test("whoami returns 401 without session", async ({ request }) => {
    const response = await request.get(`${baseUrl}/auth/whoami`);

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("logout clears session", async ({ request }) => {
    const timestamp = Date.now();
    const testEmail = `test-logout-${timestamp}@example.com`;

    await request.post(`${baseUrl}/auth/request-link`, {
      headers: { "Content-Type": "application/json" },
      data: { email: testEmail }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    const emailsResponse = await request.get(`${baseUrl}/debug/emails`);
    const emails = await emailsResponse.json();
    
    const testEmails = emails.filter((email: MockEmail) => email.to === testEmail);
    const latestEmail = testEmails.sort(
      (a: MockEmail, b: MockEmail) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    const linkMatch = latestEmail.html.match(/href="([^"]*auth\/verify\?token=[^"]*)"/);
    const magicLink = linkMatch ? linkMatch[1] : null;

    const url = magicLink!.startsWith("http") ? magicLink! : `${baseUrl}${magicLink}`;

    const verifyResponse = await request.get(url, {
      maxRedirects: 0
    });

    const setCookieHeader = verifyResponse.headers()["set-cookie"];
    const sessionMatch = setCookieHeader?.match(/session_id=([^;]+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : null;

    const whoamiBeforeResponse = await request.get(`${baseUrl}/auth/whoami`, {
      headers: { "Cookie": `session_id=${sessionId}` }
    });
    expect(whoamiBeforeResponse.status()).toBe(200);

    const logoutResponse = await request.post(`${baseUrl}/auth/logout`, {
      headers: { "Cookie": `session_id=${sessionId}` }
    });
    expect(logoutResponse.status()).toBe(200);

    const whoamiAfterResponse = await request.get(`${baseUrl}/auth/whoami`, {
      headers: { "Cookie": `session_id=${sessionId}` }
    });
    expect(whoamiAfterResponse.status()).toBe(401);
  });
});
