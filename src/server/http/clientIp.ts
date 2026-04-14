import type { Context } from "hono";
import { z } from "zod";

export const getClientIp = z
	.function()
	.args(z.custom<Context>())
	.returns(z.string().min(1))
	.implement((c) => {
		const cfConnectingIp = c.req.header("cf-connecting-ip");

		if (cfConnectingIp && cfConnectingIp.trim().length > 0) {
			return cfConnectingIp.trim();
		}

		const xForwardedFor = c.req.header("x-forwarded-for");

		if (!xForwardedFor) {
			return "unknown";
		}

		const firstForwardedIp = xForwardedFor
			.split(",")
			.map((segment) => segment.trim())
			.find((segment) => segment.length > 0);

		return firstForwardedIp ?? "unknown";
	});
