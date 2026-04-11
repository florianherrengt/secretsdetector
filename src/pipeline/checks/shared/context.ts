import { z } from "zod";

const CONTEXT_WINDOW_CHARS = 80;

export const getDetectionContext = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive())
	.returns(z.string())
	.implement((body, start, end) => {
		const contextStart = Math.max(0, start - CONTEXT_WINDOW_CHARS);
		const contextEnd = Math.min(body.length, end + CONTEXT_WINDOW_CHARS);

		return body.slice(contextStart, contextEnd).toLowerCase();
	});

export const hasPositiveContext = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive())
	.returns(z.boolean())
	.implement((body, start, end) => {
		const context = getDetectionContext(body, start, end);

		return /\b(secret|token|auth|authorization|password|api[_-]?key|apikey)\b/i.test(context);
	});

export const hasNegativeContext = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive())
	.returns(z.boolean())
	.implement((body, start, end) => {
		const context = getDetectionContext(body, start, end);

		return /\b(analytics|measurement|tracking|public|example)\b/i.test(context);
	});
