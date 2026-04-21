import { z } from 'zod';

export const isLikelyJwt = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
		if (!value.startsWith('eyJ')) {
			return false;
		}

		const segments = value.split('.');

		if (segments.length !== 3) {
			return false;
		}

		if (segments[0].length < 10 || segments[1].length < 10 || segments[2].length < 16) {
			return false;
		}

		return true;
	});
