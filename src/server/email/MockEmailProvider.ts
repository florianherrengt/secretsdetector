import { z } from "zod";
import { db } from "../db/client.js";
import { mockEmails } from "../db/schema.js";
import type { EmailProvider } from "./EmailProvider.js";

export class MockEmailProvider implements EmailProvider {
  send = z
    .function()
    .args(
      z.object({
        to: z.string(),
        subject: z.string(),
        html: z.string()
      })
    )
    .returns(z.promise(z.void()))
    .implement(async (input) => {
      await db.insert(mockEmails).values({
        id: crypto.randomUUID(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        createdAt: new Date()
      });
    });
}
