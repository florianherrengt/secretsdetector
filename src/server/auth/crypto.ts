import { z } from "zod";

export const generateToken = z
  .function()
  .args()
  .returns(z.string())
  .implement(() => {
    return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  });

export const hashToken = z
  .function()
  .args(z.string())
  .returns(z.promise(z.string()))
  .implement(async (token) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  });
