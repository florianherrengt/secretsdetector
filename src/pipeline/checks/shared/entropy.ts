import { z } from "zod";

const GENERIC_TOKEN_MIN_LENGTH = 20;
const GENERIC_TOKEN_MIN_ENTROPY = 3.6;

export const shannonEntropy = z
	.function()
	.args(z.string())
	.returns(z.number().nonnegative())
	.implement((value) => {
		if (value.length === 0) {
			return 0;
		}

		const counts = new Map<string, number>();

		for (const char of value) {
			counts.set(char, (counts.get(char) ?? 0) + 1);
		}

		const entropy = [...counts.values()].reduce((sum, count) => {
			const probability = count / value.length;
			return sum - probability * Math.log2(probability);
		}, 0);

		return entropy;
	});

export const hasGenericTokenEntropy = z
	.function()
	.args(z.string())
	.returns(z.boolean())
	.implement((value) => {
		if (value.length < GENERIC_TOKEN_MIN_LENGTH) {
			return false;
		}

		return shannonEntropy(value) >= GENERIC_TOKEN_MIN_ENTROPY;
	});
