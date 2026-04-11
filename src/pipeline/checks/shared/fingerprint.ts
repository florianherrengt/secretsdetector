import { createHash } from "node:crypto";
import { z } from "zod";

export const fingerprintValue = z
	.function()
	.args(z.string())
	.returns(z.string())
	.implement((value) => {
		return createHash("sha256").update(value).digest("hex");
	});
