import { z } from "zod";
import type { Context } from "hono";

const FLASH_COOKIE_NAME = "flash_message";
const FLASH_COOKIE_OPTIONS = "Path=/; HttpOnly; SameSite=Lax";

const readFlashCookie = z
	.function()
	.args(z.custom<Context>())
	.returns(z.string().optional())
	.implement((c) => {
		const match = c.req.header("cookie")?.match(new RegExp(`${FLASH_COOKIE_NAME}=([^;]+)`))?.[1];

		if (!match) {
			return undefined;
		}

		try {
			return decodeURIComponent(match);
		} catch {
			return undefined;
		}
	});

export const flashMiddleware = z
	.function()
	.args(z.custom<Context>(), z.custom<() => Promise<void>>())
	.returns(z.custom<Promise<Response | void>>())
	.implement(async (c, next) => {
		const message = readFlashCookie(c);

		if (message) {
			c.set("flash", message);
		}

		await next();

		if (message) {
			c.header("Set-Cookie", `${FLASH_COOKIE_NAME}=; ${FLASH_COOKIE_OPTIONS}; Max-Age=0`, { append: true });
		}
	});

export const setFlashMessage = z
	.function()
	.args(z.custom<Context>(), z.string())
	.returns(z.void())
	.implement((c, message) => {
		c.header("Set-Cookie", `${FLASH_COOKIE_NAME}=${encodeURIComponent(message)}; ${FLASH_COOKIE_OPTIONS}; Max-Age=60`, { append: true });
	});
