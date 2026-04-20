// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Context } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    user: {
      userId: string;
      email: string;
    };
    flash: string | null;
  }
}
