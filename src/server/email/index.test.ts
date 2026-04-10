import { describe, it, expect, beforeEach } from "vitest";
import { getEmailProvider } from "../email/index.js";
import { db } from "../db/client.js";
import { mockEmails } from "../db/schema.js";

describe("getEmailProvider", () => {
  beforeEach(async () => {
    await db.delete(mockEmails);
  });

  it("should return MockEmailProvider in non-production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const provider = getEmailProvider();

    expect(provider).toHaveProperty("send");

    await provider.send({
      to: "test@example.com",
      subject: "Test",
      html: "<p>Test</p>"
    });

    const emails = await db.select().from(mockEmails);
    expect(emails).toHaveLength(1);

    process.env.NODE_ENV = originalEnv;
  });
});
