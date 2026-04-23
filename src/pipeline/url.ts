import { z } from 'zod';

export const safeNewUrl = z
	.function()
	.args(z.string())
	.returns(z.instanceof(URL).nullable())
	.implement((raw) => {
		try {
			return new URL(raw);
		} catch {
			return null;
		}
	});
