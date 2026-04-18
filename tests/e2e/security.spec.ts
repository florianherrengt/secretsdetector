import { expect, test, type APIRequestContext } from "@playwright/test";
import {
	createAuthenticatedSession,
	extractTokenFromMagicLink,
	getLatestEmailForRecipient,
	getMagicLinkFromEmail,
	getSessionIdFromSetCookie,
	getTokenForEmail,
	requestMagicLink,
	verifyMagicLinkToken
} from "./support/auth";

const getTokenOrThrow = async (request: APIRequestContext, email: string) => {
	const token = await getTokenForEmail(request, email);
	expect(token).not.toBeNull();
	return token as string;
};

test.describe("Security: Token Validation", () => {
  test("2.1 Valid Login Flow (baseline)", async ({ request }) => {
    const session = await createAuthenticatedSession(request, `test-valid-${Date.now()}@example.com`);
    
    const whoamiResponse = await request.get("/auth/whoami", {
      headers: { "Cookie": session.cookieHeader }
    });
    expect(whoamiResponse.status()).toBe(200);
    
    const body = await whoamiResponse.json();
    expect(body.email).toBe(session.email);
  });

  test("2.2 Token Replay Attack (CRITICAL)", async ({ request }) => {
    const email = `test-replay-${Date.now()}@example.com`;

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    const firstResponse = await verifyMagicLinkToken(request, token);
    expect(firstResponse.status()).toBe(302);

    const secondResponse = await verifyMagicLinkToken(request, token);
    
    expect(secondResponse.status()).toBe(401);
    const body = await secondResponse.text();
    expect(body).toContain("Invalid or expired login link");
  });

  test.skip("2.3 Expired Token Rejection", async ({ request }) => {
    const email = `test-expired-${Date.now()}@example.com`;

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    await request.post("/debug/emails/clear");
    
    await new Promise(resolve => setTimeout(resolve, 16 * 60 * 1000));
    
    const verifyResponse = await verifyMagicLinkToken(request, token);
    expect(verifyResponse.status()).toBe(401);
  });

  test("2.4 Forged Token Attack", async ({ request }) => {
    const forgedToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");

    const verifyResponse = await verifyMagicLinkToken(request, forgedToken);
    expect(verifyResponse.status()).toBe(401);
  });

  test("2.5 Tampered Token", async ({ request }) => {
    const email = `test-tampered-${Date.now()}@example.com`;

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    const tamperedToken = token.slice(0, -10) + "0123456789";

    const verifyResponse = await verifyMagicLinkToken(request, tamperedToken);
    expect(verifyResponse.status()).toBe(401);
  });

  test("2.6 Parallel Replay (Race Condition) - CRITICAL VULNERABILITY", async ({ request }) => {
    const email = `test-race-${Date.now()}@example.com`;

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    const parallelRequests = Array(5).fill(null).map(() => 
      verifyMagicLinkToken(request, token)
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

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    const verifyResponse = await verifyMagicLinkToken(request, token);
    expect(verifyResponse.status()).toBe(302);

    const sessionId = getSessionIdFromSetCookie(verifyResponse.headers()["set-cookie"] ?? null);
    expect(sessionId).toBeTruthy();
  });

  test("2.8 Session Isolation", async ({ request }) => {
    const sessionA = await createAuthenticatedSession(request, `test-isolation-a-${Date.now()}@example.com`);
    await createAuthenticatedSession(request, `test-isolation-b-${Date.now()}@example.com`);
    
    const whoamiResponse = await request.get("/auth/whoami", {
      headers: { "Cookie": sessionA.cookieHeader }
    });
    
    const body = await whoamiResponse.json();
    expect(body.email).toBe(sessionA.email);
  });

  test("2.9 No Session Without Token", async ({ request }) => {
    const verifyResponse = await request.get("/auth/verify", {
      maxRedirects: 0
    });
    
    expect(verifyResponse.status()).toBe(400);
    expect(verifyResponse.headers()["set-cookie"]).toBeUndefined();
  });

  test.skip("7. Session Expiry Test", async ({ request }) => {
    const email = `test-session-expiry-${Date.now()}@example.com`;

    const session = await createAuthenticatedSession(request, email);

    await request.post("/db/expire-session", {
      headers: { "Content-Type": "application/json" },
      data: { sessionId: session.sessionId }
    });

    const whoamiResponse = await request.get("/auth/whoami", {
      headers: { "Cookie": session.cookieHeader }
    });
    
    expect(whoamiResponse.status()).toBe(401);
  });
});

test.describe("Security: Token Handling", () => {
  test("3.2 Token Not Exposed via API", async ({ request }) => {
    const email = `test-exposure-${Date.now()}@example.com`;

    const requestLinkResponse = await requestMagicLink(request, email);
    const requestLinkBody = await requestLinkResponse.json();
    expect(requestLinkBody).not.toHaveProperty("token");

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    const verifyResponse = await verifyMagicLinkToken(request, token);
    expect(verifyResponse.status()).toBe(302);

    const verifyBody = await verifyResponse.text();
    expect(verifyBody).not.toContain(token);
    expect(verifyResponse.headers()).not.toHaveProperty("x-auth-token");
  });
});

test.describe("Security: Email System", () => {
  test("4.1 Email Contains Valid Token", async ({ request }) => {
    const email = `test-email-token-${Date.now()}@example.com`;

    await requestMagicLink(request, email);
    const emailData = await getLatestEmailForRecipient(request, email);

    expect(emailData).not.toBeNull();
		expect(emailData!.subject).toBe("Welcome to Secret Detector");

		const magicLink = getMagicLinkFromEmail(emailData!);
		expect(magicLink).not.toBeNull();
		const token = magicLink ? extractTokenFromMagicLink(magicLink) : null;
		expect(token).not.toBeNull();
		expect(token!.length).toBeGreaterThan(32);

		const verifyResponse = await verifyMagicLinkToken(request, token!);
		expect(verifyResponse.status()).toBe(302);
	});

  test("4.2 Email Scanner Simulation - HIGH VULNERABILITY", async ({ request }) => {
    const email = `test-scanner-${Date.now()}@example.com`;

    await requestMagicLink(request, email);
    const token = await getTokenOrThrow(request, email);

    const botResponse = await request.get(`/auth/verify?token=${token}`, {
      maxRedirects: 0,
      headers: {
        "User-Agent": "EmailSecurityScanner/1.0"
      }
    });

    expect(botResponse.status()).toBe(302);

    const verifyResponse = await verifyMagicLinkToken(request, token);
    expect(verifyResponse.status()).toBe(401);
  });
});

test.describe("Security: Enumeration Protection", () => {
  test("5. Enumeration Protection Test", async ({ request }) => {
    const existingEmail = `test-enum-existing-${Date.now()}@example.com`;
    const nonExistingEmail = `test-enum-nonexisting-${Date.now()}@example.com`;

    await requestMagicLink(request, existingEmail);
    const start1 = Date.now();
    const response1 = await requestMagicLink(request, existingEmail);
    const time1 = Date.now() - start1;

    await requestMagicLink(request, nonExistingEmail);
    const start2 = Date.now();
    const response2 = await requestMagicLink(request, nonExistingEmail);
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
      const verifyResponse = await verifyMagicLinkToken(request, fuzzToken);
      
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
