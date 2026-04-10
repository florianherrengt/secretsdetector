import { describe, it, expect, beforeEach } from "vitest";
import { MockEmailProvider } from "./MockEmailProvider.js";
import { db } from "../db/client.js";
import { mockEmails } from "../db/schema.js";

describe("MockEmailProvider", () => {
  beforeEach(async () => {
    await db.delete(mockEmails);
  });

  it("should store email in database", async () => {
    const provider = new MockEmailProvider();

    await provider.send({
      to: "test@example.com",
      subject: "Test Subject",
      html: "<p>Test HTML</p>"
    });

    const emails = await db.select().from(mockEmails);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: "test@example.com",
      subject: "Test Subject",
      html: "<p>Test HTML</p>"
    });
    expect(emails[0].id).toBeDefined();
    expect(emails[0].createdAt).toBeInstanceOf(Date);
  });

  it("should store multiple emails", async () => {
    const provider = new MockEmailProvider();

    await provider.send({
      to: "test1@example.com",
      subject: "Subject 1",
      html: "<p>HTML 1</p>"
    });

    await provider.send({
      to: "test2@example.com",
      subject: "Subject 2",
      html: "<p>HTML 2</p>"
    });

    const emails = await db.select().from(mockEmails);
    expect(emails).toHaveLength(2);
  });
});
