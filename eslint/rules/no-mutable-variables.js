import { ESLintUtils } from "@typescript-eslint/utils";

export default ESLintUtils.RuleCreator(() => "")({
  name: "no-mutable-variables",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow mutable variables. Use 'const' by default. If mutation is required, explicitly disable the rule.",
    },
    fixable: "code",
    schema: [],
    messages: {
      noMutable:
        "Variables must be immutable ('const'). If mutation is intentional and necessary, disable this rule for that line.",
    },
  },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;

    function isInsideLoop(node) {
      let current = node.parent;

      while (current) {
        if (
          current.type === "ForStatement" ||
          current.type === "ForInStatement" ||
          current.type === "ForOfStatement"
        ) {
          return true;
        }
        current = current.parent;
      }

      return false;
    }

    return {
      VariableDeclaration(node) {
        if (node.kind === "const") return;

        if (isInsideLoop(node)) return;

        context.report({
          node,
          messageId: "noMutable",
          fix(fixer) {
            const token = sourceCode.getFirstToken(node);
            if (!token) return null;

            if (token.value === "let" || token.value === "var") {
              return fixer.replaceText(token, "const");
            }

            return null;
          },
        });
      },
    };
  },
});