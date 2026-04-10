import { z } from "zod";
import { MockEmailProvider } from "./MockEmailProvider.js";
import { SESEmailProvider } from "./SESEmailProvider.js";
import type { EmailProvider } from "./EmailProvider.js";

const provider: EmailProvider = process.env.NODE_ENV === "production"
  ? new SESEmailProvider()
  : new MockEmailProvider();

export const getEmailProvider = z
  .function()
  .args()
  .returns(z.custom<EmailProvider>())
  .implement(() => {
    return provider;
  });
