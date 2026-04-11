import { z } from "zod";

export const redactSecret = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((value) => {
		if (value.length <= 8) {
			return "[REDACTED]";
		}

		const prefix = value.slice(0, 4);
		const suffix = value.slice(-4);

		return `${prefix}...[REDACTED]...${suffix}`;
	});
