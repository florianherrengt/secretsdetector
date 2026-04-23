import { ESLintUtils } from '@typescript-eslint/utils';

function findVariable(scope, name) {
	let currentScope = scope;

	while (currentScope) {
		const variable = currentScope.set.get(name);
		if (variable) {
			return variable;
		}

		currentScope = currentScope.upper;
	}

	return null;
}

function isImmutableSourceVariable(variable) {
	if (!variable || variable.defs.length === 0) {
		return false;
	}

	return variable.defs.every((definition) => {
		if (definition.type === 'ImportBinding' || definition.type === 'Parameter') {
			return true;
		}

		if (definition.type === 'Variable') {
			return definition.parent?.kind === 'const';
		}

		return false;
	});
}

export default ESLintUtils.RuleCreator(() => '')({
	name: 'no-unnecessary-const-alias',
	meta: {
		type: 'suggestion',
		docs: {
			description: 'Disallow const alias declarations that only rename an immutable identifier.',
		},
		schema: [],
		messages: {
			unnecessaryAlias:
				"Unnecessary const alias '{{aliasName}}' for immutable '{{sourceName}}'. Use '{{sourceName}}' directly.",
		},
	},
	defaultOptions: [],
	create(context) {
		const { sourceCode } = context;

		return {
			VariableDeclaration(node) {
				if (node.kind !== 'const') {
					return;
				}

				for (const declaration of node.declarations) {
					if (declaration.id.type !== 'Identifier' || declaration.init?.type !== 'Identifier') {
						continue;
					}

					const declarationScope = sourceCode.getScope(declaration);
					const sourceVariable = findVariable(declarationScope, declaration.init.name);

					if (!isImmutableSourceVariable(sourceVariable)) {
						continue;
					}

					const declaredVariables = sourceCode.getDeclaredVariables(declaration);
					const declaredAliasVariable = declaredVariables[0] ?? null;

					if (declaredAliasVariable && declaredAliasVariable === sourceVariable) {
						continue;
					}

					context.report({
						node: declaration.id,
						messageId: 'unnecessaryAlias',
						data: {
							aliasName: declaration.id.name,
							sourceName: declaration.init.name,
						},
					});
				}
			},
		};
	},
});
