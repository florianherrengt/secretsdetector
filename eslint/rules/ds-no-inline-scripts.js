import { ESLintUtils } from '@typescript-eslint/utils';
import { isFrontendFile } from './utils/design-system.js';

export default ESLintUtils.RuleCreator(() => '')({
	name: 'ds-no-inline-scripts',
	meta: {
		type: 'problem',
		docs: {
			description:
				'Disallows inline <script> tags. All client-side JavaScript must be delivered as external files via <script src="...">.',
		},
		fixable: 'code',
		schema: [],
		messages: {
			inlineScript:
				'Inline <script> tags are forbidden. Place JS in /assets/ and reference it with <script src="...">.',
		},
	},
	defaultOptions: [],
	create(context) {
		if (!isFrontendFile(context)) {
			return {};
		}

		return {
			JSXOpeningElement(node) {
				if (node.name.type !== 'JSXIdentifier') {
					return;
				}

				if (node.name.name !== 'script') {
					return;
				}

				const hasSrc = node.attributes.some(
					(attr) =>
						attr.type === 'JSXAttribute' &&
						attr.name.type === 'JSXIdentifier' &&
						attr.name.name === 'src',
				);

				if (hasSrc) {
					return;
				}

				context.report({
					node,
					messageId: 'inlineScript',
					fix(fixer) {
						return null;
					},
				});
			},
		};
	},
});
