import { expect, test, type APIRequestContext } from "@playwright/test";

const domain = process.env.DOMAIN ?? "127.0.0.1:3000";
const baseUrl = `http://${domain}`;

interface MockEmail {
  to: string;
  subject: string;
  html: string;
  createdAt: string;
}

const helper = {
  async requestMagicLink(request: APIRequestContext, email: string) {
    const response = await request.post(`${baseUrl}/auth/request-link`, {
      headers: { "Content-Type": "application/json" },
      data: { email }
    });
    return response;
  },

  async getLatestEmail(request: APIRequestContext, email: string): Promise<MockEmail | null> {
    await new Promise(resolve => setTimeout(resolve, 500));
    const emailsResponse = await request.get(`${baseUrl}/debug/emails`);
    const emails = await emailsResponse.json();
    
    const testEmails = emails.filter((e: MockEmail) => e.to === email);
    if (testEmails.length === 0) return null;

    return testEmails.sort(
      (a: MockEmail, b: MockEmail) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  },

  extractTokenFromEmail(email: MockEmail): string | null {
    const linkMatch = email.html.match(/href="([^"]*auth\/verify\?token=[^"]*)"/);
    if (!linkMatch) return null;
    
    const url = linkMatch[1];
    const tokenMatch = url.match(/token=([^&"]+)/);
    return tokenMatch ? tokenMatch[1] : null;
  },

  async verifyToken(request: APIRequestContext, token: string) {
    const url = token.startsWith("http") ? token : `${baseUrl}/auth/verify?token=${token}`;
    return await request.get(url, { maxRedirects: 0 });
  },

  extractSessionId(response: { headers: () => Record<string, string> }): string | null {
    const setCookieHeader = response.headers()["set-cookie"];
    const sessionMatch = setCookieHeader?.match(/session_id=([^;]+)/);
    return sessionMatch ? sessionMatch[1] : null;
  }
};

test.describe("Security: Token Validation", () => {
  test("2.1 Valid Login Flow (baseline)", async ({ request }) => {
    const email = `test-valid-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    expect(emailData).not.toBeNull();
    
    const token = helper.extractTokenFromEmail(emailData!);
    expect(token).not.toBeNull();
    
    const verifyResponse = await helper.verifyToken(request, token!);
    expect(verifyResponse.status()).toBe(302);
    
    const sessionId = helper.extractSessionId(verifyResponse);
    expect(sessionId).not.toBeNull();
    
    const whoamiResponse = await request.get(`${baseUrl}/auth/whoami`, {
      headers: { "Cookie": `session_id=${sessionId}` }
    });
    expect(whoamiResponse.status()).toBe(200);
    
    const body = await whoamiResponse.json();
    expect(body.email).toBe(email);
  });

  test("2.2 Token Replay Attack (CRITICAL)", async ({ request }) => {
    const email = `test-replay-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    
    const firstResponse = await helper.verifyToken(request, token!);
    expect(firstResponse.status()).toBe(302);
    
    const secondResponse = await helper.verifyToken(request, token!);
    
    expect(secondResponse.status()).toBe(401);
    const body = await secondResponse.text();
    expect(body).toContain("Invalid or expired login link");
  });

  test.skip("2.3 Expired Token Rejection", async ({ request }) => {
    const email = `test-expired-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    
    await request.post(`${baseUrl}/debug/emails/clear`);
    
    await new Promise(resolve => setTimeout(resolve, 16 * 60 * 1000));
    
    const verifyResponse = await helper.verifyToken(request, token!);
    expect(verifyResponse.status()).toBe(401);
  });

  test("2.4 Forged Token Attack", async ({ request }) => {
    const forgedToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    
    const verifyResponse = await helper.verifyToken(request, forgedToken);
    expect(verifyResponse.status()).toBe(401);
  });

  test("2.5 Tampered Token", async ({ request }) => {
    const email = `test-tampered-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    
    const tamperedToken = token!.slice(0, -10) + "0123456789";
    
    const verifyResponse = await helper.verifyToken(request, tamperedToken);
    expect(verifyResponse.status()).toBe(401);
  });

  test("2.6 Parallel Replay (Race Condition) - CRITICAL VULNERABILITY", async ({ request }) => {
    const email = `test-race-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    expect(emailData).not.toBeNull();
    
    const token = helper.extractTokenFromEmail(emailData!);
    expect(token).not.toBeNull();
    
    const parallelRequests = Array(5).fill(null).map(() => 
      helper.verifyToken(request, token!)
    );
    
    const responses = await Promise.all(parallelRequests);
    
    const successCount = responses.filter(r => r.status() === 302).length;
    const failureCount = responses.filter(r => r.status() === 401).length;
    
    expect(successCount).toBe(1);
    expect(failureCount).toBe(4);
  });
});

test.describe("Security: Session Management", () => {
  test("2.7 Session Fixation Test - CRITICAL VULNERABILITY", async ({ request }) => {
    const email = `test-fixation-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    
    const verifyResponse = await helper.verifyToken(request, token!);
    expect(verifyResponse.status()).toBe(302);
    
    const newSessionCookie = verifyResponse.headers()["set-cookie"] || "";
    
    const newSessionMatch = newSessionCookie.match(/session_id=([^;]+)/);
    
    expect(newSessionMatch).not.toBeNull();
    expect(newSessionMatch![1]).toBeTruthy();
  });

  test("2.8 Session Isolation", async ({ request }) => {
    const emailA = `test-isolation-a-${Date.now()}@example.com`;
    const emailB = `test-isolation-b-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, emailA);
    const emailDataA = await helper.getLatestEmail(request, emailA);
    const tokenA = helper.extractTokenFromEmail(emailDataA!);
    const verifyResponseA = await helper.verifyToken(request, tokenA!);
    const sessionIdA = helper.extractSessionId(verifyResponseA);
    
    await helper.requestMagicLink(request, emailB);
    const emailDataB = await helper.getLatestEmail(request, emailB);
    const tokenB = helper.extractTokenFromEmail(emailDataB!);
    await helper.verifyToken(request, tokenB!);
    
    const whoamiResponse = await request.get(`${baseUrl}/auth/whoami`, {
      headers: { "Cookie": `session_id=${sessionIdA}` }
    });
    
    const body = await whoamiResponse.json();
    expect(body.email).toBe(emailA);
  });

  test("2.9 No Session Without Token", async ({ request }) => {
    const verifyResponse = await request.get(`${baseUrl}/auth/verify`, {
      maxRedirects: 0
    });
    
    expect(verifyResponse.status()).toBe(400);
    expect(verifyResponse.headers()["set-cookie"]).toBeUndefined();
  });

  test.skip("7. Session Expiry Test", async ({ request }) => {
    const email = `test-session-expiry-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    const verifyResponse = await helper.verifyToken(request, token!);
    const sessionId = helper.extractSessionId(verifyResponse);
    
    await request.post(`${baseUrl}/db/expire-session`, {
      headers: { "Content-Type": "application/json" },
      data: { sessionId }
    });
    
    const whoamiResponse = await request.get(`${baseUrl}/auth/whoami`, {
      headers: { "Cookie": `session_id=${sessionId}` }
    });
    
    expect(whoamiResponse.status()).toBe(401);
  });
});

test.describe("Security: Token Handling", () => {
  test("3.2 Token Not Exposed via API", async ({ request }) => {
    const email = `test-exposure-${Date.now()}@example.com`;
    
    const requestLinkResponse = await helper.requestMagicLink(request, email);
    const requestLinkBody = await requestLinkResponse.json();
    expect(requestLinkBody).not.toHaveProperty("token");
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    
    const verifyResponse = await helper.verifyToken(request, token!);
    expect(verifyResponse.status()).toBe(302);
    
    const verifyBody = await verifyResponse.text();
    expect(verifyBody).not.toContain(token!);
    expect(verifyResponse.headers()).not.toHaveProperty("x-auth-token");
  });
});

test.describe("Security: Email System", () => {
  test("4.1 Email Contains Valid Token", async ({ request }) => {
    const email = `test-email-token-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    
    expect(emailData).not.toBeNull();
    expect(emailData!.subject).toBe("Your login link");
    
    const token = helper.extractTokenFromEmail(emailData!);
    expect(token).not.toBeNull();
    expect(token!.length).toBeGreaterThan(32);
    
    const verifyResponse = await helper.verifyToken(request, token!);
    expect(verifyResponse.status()).toBe(302);
  });

  test("4.2 Email Scanner Simulation - HIGH VULNERABILITY", async ({ request }) => {
    const email = `test-scanner-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, email);
    const emailData = await helper.getLatestEmail(request, email);
    const token = helper.extractTokenFromEmail(emailData!);
    
    const botResponse = await request.get(`${baseUrl}/auth/verify?token=${token}`, {
      maxRedirects: 0,
      headers: {
        "User-Agent": "EmailSecurityScanner/1.0"
      }
    });
    
    expect(botResponse.status()).toBe(302);
    
    const verifyResponse = await helper.verifyToken(request, token!);
    expect(verifyResponse.status()).toBe(401);
  });
});

test.describe("Security: Enumeration Protection", () => {
  test("5. Enumeration Protection Test", async ({ request }) => {
    const existingEmail = `test-enum-existing-${Date.now()}@example.com`;
    const nonExistingEmail = `test-enum-nonexisting-${Date.now()}@example.com`;
    
    await helper.requestMagicLink(request, existingEmail);
    const start1 = Date.now();
    const response1 = await helper.requestMagicLink(request, existingEmail);
    const time1 = Date.now() - start1;
    
    await helper.requestMagicLink(request, nonExistingEmail);
    const start2 = Date.now();
    const response2 = await helper.requestMagicLink(request, nonExistingEmail);
    const time2 = Date.now() - start2;
    
    expect(response1.status()).toBe(response2.status());
    expect(await response1.json()).toEqual(await response2.json());
    
    const timeDiff = Math.abs(time1 - time2);
    expect(timeDiff).toBeLessThan(100);
  });
});

test.describe("Security: Token Fuzzing", () => {
  const fuzzTokens = [
    "",
    "a",
    "abc",
    "very-long-token-" + "x".repeat(1000),
    "🔥🔥🔥",
    "token with spaces",
    "token\nwith\nnewlines",
    "<script>alert('xss')</script>",
    "../../etc/passwd",
    "%00null",
    "undefined",
    "null",
    "018ed8d4-3c48-4b0f-8c2e-5d86fa123456",
    Array(100).fill("a").join("")
  ];

  fuzzTokens.forEach((fuzzToken, index) => {
    test(`8. Token Fuzzing: ${index} - "${fuzzToken.substring(0, 30)}..."`, async ({ request }) => {
      const verifyResponse = await helper.verifyToken(request, fuzzToken);
      
      expect([400, 401, 500]).toContain(verifyResponse.status());
      
      if (verifyResponse.status() !== 500) {
        const setCookie = verifyResponse.headers()["set-cookie"];
        if (setCookie) {
          const sessionMatch = setCookie.match(/session_id=([^;]+)/);
          expect(sessionMatch).toBeNull();
        }
      }
    });
  });
});
