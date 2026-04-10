import { z } from "zod";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailProvider } from "./EmailProvider.js";

const ses = new SESClient({ region: process.env.AWS_REGION || "us-east-1" });

const getEmailDomain = z
  .function()
  .args()
  .returns(z.string())
  .implement(() => {
    if (process.env.DOMAIN_NAME) {
      return process.env.DOMAIN_NAME;
    }
    
    const domain = process.env.DOMAIN || "localhost:3000";
    return domain.split(":")[0];
  });

const sourceEmail = `noreply@${getEmailDomain()}`;

export class SESEmailProvider implements EmailProvider {
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
      await ses.send(
        new SendEmailCommand({
          Destination: { ToAddresses: [input.to] },
          Message: {
            Subject: { Data: input.subject },
            Body: {
              Html: { Data: input.html }
            }
          },
          Source: sourceEmail
        })
      );
    });
}
