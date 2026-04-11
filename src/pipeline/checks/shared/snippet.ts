import { z } from "zod";
import { redactSecret } from "./redaction.js";

export const buildSnippet = z
	.function()
	.args(z.string(), z.number().int().nonnegative(), z.number().int().positive(), z.string())
	.returns(z.string())
	.implement((body, start, end, matchedValue) => {
		const contextChars = 50;
		const snippetStart = Math.max(0, start - contextChars);
		const snippetEnd = Math.min(body.length, end + contextChars);
		const rawSnippet = body.slice(snippetStart, snippetEnd);
		const localStart = start - snippetStart;
		const localEnd = localStart + (end - start);

		const redacted = `${rawSnippet.slice(0, localStart)}${redactSecret(matchedValue)}${rawSnippet.slice(localEnd)}`;
		const snippet = redacted.replace(/\s+/g, " ").trim();

		if (snippet.length > 180) {
			return snippet.slice(0, 180);
		}

		return snippet;
	});
