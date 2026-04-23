import { ESLintUtils } from '@typescript-eslint/utils';
import { getPolicy, isFrontendFile } from './utils/design-system.js';

// Enforces design-system boundaries for JSX HTML usage:
// - allows only raw tags explicitly approved by policy
// - blocks tags explicitly forbidden by policy
// - preserves a narrow exception for <link> nested under <head>
// This keeps markup aligned with sanctioned primitives and component patterns.

const isWithinHeadElement = (node) => {
	let current = node.parent;

	while (current) {
		if (current.type === 'JSXElement') {
			const opening = current.openingElement;
			if (opening.name.type === 'JSXIdentifier' && opening.name.name === 'head') {
				return true;
			}
		}

		current = current.parent;
	}

	return false;
};

export default ESLintUtils.RuleCreator(() => '')({
	name: 'ds-no-raw-html-elements',
	meta: {
		type: 'problem',
		docs: {
			description:
				'Blocks raw HTML elements that are not explicitly approved by the design-system policy',
		},
		schema: [],
		messages: {
			forbidden:
				"Raw element '{{tag}}' is not approved. Use an approved design-system component or add an explicit policy exception.",
		},
	},
	defaultOptions: [],
	create(context) {
		if (!isFrontendFile(context)) {
			return {};
		}

		const policy = getPolicy();

		return {
			JSXOpeningElement(node) {
				if (node.name.type !== 'JSXIdentifier') {
					return;
				}

				const tag = node.name.name;
				const isRawHtml = tag === tag.toLowerCase();

				if (!isRawHtml) {
					return;
				}

				if (tag === 'link' && isWithinHeadElement(node)) {
					return;
				}

				if (policy.forbiddenRawElements.has(tag)) {
					context.report({
						node,
						messageId: 'forbidden',
						data: { tag },
					});
					return;
				}

				if (!policy.approvedRawElements.has(tag)) {
					context.report({
						node,
						messageId: 'forbidden',
						data: { tag },
					});
				}
			},
		};
	},
});
