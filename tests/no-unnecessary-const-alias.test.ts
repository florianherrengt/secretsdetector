import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import * as custom from '../eslint/index.js';

async function lintSnippet(code: string) {
	const eslint = new ESLint({
		ignore: false,
		overrideConfigFile: true,
		overrideConfig: [
			{
				files: ['**/*.{ts,tsx,js,jsx}'],
				languageOptions: {
					parser: tseslint.parser,
					parserOptions: {
						ecmaFeatures: { jsx: true },
						sourceType: 'module',
					},
				},
				plugins: {
					custom,
				},
				rules: {
					'custom/no-unnecessary-const-alias': 'error',
				},
			},
		],
	});

	const [result] = await eslint.lintText(code, { filePath: 'src/example.ts' });
	return result.messages;
}

describe('no-unnecessary-const-alias', () => {
	it('flags aliases of const locals', async () => {
		const messages = await lintSnippet('const selfHost = "localhost"; const hostname = selfHost;');

		expect(messages).toHaveLength(1);
		expect(messages[0]?.ruleId).toBe('custom/no-unnecessary-const-alias');
		expect(messages[0]?.message).toContain("Use 'selfHost' directly");
	});

	it('flags aliases of imports', async () => {
		const messages = await lintSnippet(
			"import { authedPage } from './auth'; const page = authedPage;",
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.ruleId).toBe('custom/no-unnecessary-const-alias');
	});

	it('flags aliases of parameters', async () => {
		const messages = await lintSnippet(
			'function run(input: string) { const value = input; return value; }',
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]?.ruleId).toBe('custom/no-unnecessary-const-alias');
	});

	it('allows aliases from mutable variables', async () => {
		const messages = await lintSnippet('let mutableLet = 1; const snapshot = mutableLet;');

		expect(messages).toHaveLength(0);
	});

	it('allows non-identifier initializers', async () => {
		const messages = await lintSnippet('const hostname = `prefix-${x}`; const val = obj.prop;');

		expect(messages).toHaveLength(0);
	});
});
